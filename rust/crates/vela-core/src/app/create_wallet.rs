//! Machine A — creating a wallet.
//!
//! ```text
//! Form ─submit─► CheckingSupport ─► Registering ─► Verifying ─► SavingPending
//!   ▲                                                               │
//!   │ cancel-at-verify KEEPS the draft (resume, never re-register)   ▼
//!   └──────────────────── Syncing{publish → remove pending} ─► Saving ─► Created
//! ```
//!
//! The ordering is the product. The passkey must first produce a valid
//! signature (a provider can report `create()` success and still have stored
//! nothing — issue #1). The wallet is then published to the registry as a
//! possession-proven group *before* it is entered (option B): the same key set
//! that derives the address is the group's membership. A publish failure does
//! not trap the user — the key is recoverable on-device from two signatures
//! regardless of the registry — so it surfaces the retry screen while the
//! passkey and its draft are kept.

use crux_core::{command::AbortHandle, render::render, App, Command};
use serde::{Deserialize, Serialize};

use super::shell::{CompletionMode, Effect, ShellOperation, ShellResult};
use super::{
    address_from_public_key_hex, name_fits_user_handle, public_key_hex_from_attestation, Account,
    FailureKind, PendingUpload, PromptKind, RegistryPublishMember, StatusKey,
};
use crate::error::CoreError;
use crate::registry_metadata::{RegistryMetadata, REGISTRY_METADATA_VERSION};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// The acknowledgment checklist. Four rows, all required — the gate is a
/// business rule, not a UI decoration.
pub const ACK_COUNT: usize = 4;

/// The Safe deployment this wallet uses, recorded in the registry metadata.
const WALLET_VERSION: &str = "safe-1.4.1";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "CreateWalletEvent"))]
pub enum Event {
    Start,
    NameChanged {
        name: String,
    },
    AckToggled {
        index: usize,
    },
    /// The primary button: "Create Wallet", or "Finish verification" when a
    /// draft is waiting.
    Submit,
    /// Abandon an unprovable passkey and mint a fresh one.
    StartOver,
    /// Re-run the index upload after it exhausted its retries.
    RetryUpload,
    EnterWallet,
    GoBack,
    /// Internal: an effect resolved. Never sent by a shell — `attempt` is
    /// captured by the core when the request is made, which is what makes a
    /// late result from an abandoned attempt identifiable.
    #[serde(skip)]
    ShellCompleted {
        attempt: u64,
        result: ShellResult,
    },
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/// A registered passkey that has not yet proven it can sign. Its whole reason
/// for existing is that a cancelled verification must resume from the
/// *signature*, never mint a second passkey.
#[derive(Clone, Debug, Default)]
pub struct Draft {
    pub credential_id: String,
    pub attestation_object_hex: String,
    pub name: String,
    pub registered_at_iso: String,
}

/// Derived from the draft, not yet persisted anywhere.
#[derive(Clone, Debug, Default)]
pub struct Prepared {
    pub credential_id: String,
    pub name: String,
    pub public_key_hex: String,
    pub address: String,
    pub created_at_iso: String,
}

impl Prepared {
    fn account(&self) -> Account {
        Account {
            id: self.credential_id.clone(),
            name: self.name.clone(),
            address: self.address.clone(),
            public_key_hex: self.public_key_hex.clone(),
            created_at_iso: self.created_at_iso.clone(),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct SyncState {
    /// 1-based attempt number of the run in flight; 0 when idle.
    pub tries: u8,
    /// Why the last attempt failed — shown behind the technical-details
    /// disclosure and carried into the bug report.
    pub last_error: Option<String>,
    /// A failed `create` is not yet a failure: the query below decides. Kept so
    /// the original cause is what surfaces if confirmation also fails.
    pub create_error: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SyncStep {
    /// Running the possession-proven publish (option B: before entering).
    #[default]
    Publishing,
    /// Clearing the pending-upload record after a successful publish.
    RemovingPending,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum Stage {
    #[default]
    Form,
    CheckingSupport,
    Registering,
    Verifying,
    SavingPending,
    Syncing(SyncStep),
    Saving,
    SyncFailed,
    Created,
    Completing,
}

impl Stage {
    /// Is an operation in flight? Everything that is not a resting place.
    fn is_busy(&self) -> bool {
        !matches!(self, Stage::Form | Stage::SyncFailed | Stage::Created)
    }
}

#[derive(Default)]
pub struct Model {
    name: String,
    acks: [bool; ACK_COUNT],
    draft: Option<Draft>,
    prepared: Option<Prepared>,
    sync: SyncState,
    stage: Stage,
    status: Option<StatusKey>,
    /// Bumped on every user-initiated start. A result carrying a different
    /// attempt belongs to an abandoned run and is dropped.
    attempt: u64,
    abort: Option<AbortHandle>,
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum CreateStage {
    /// The form panel — also what shows while work is in flight, with `busy`
    /// driving the button spinner. Matches today's screen exactly.
    Form,
    SyncFailed,
    Created,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum SubmitLabel {
    Create,
    FinishVerify,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct CreateView {
    pub stage: CreateStage,
    pub name: String,
    pub name_editable: bool,
    pub name_too_long: bool,
    pub acks: Vec<bool>,
    pub can_submit: bool,
    pub submit_label: SubmitLabel,
    pub busy: bool,
    pub status: Option<StatusKey>,
    pub show_start_over: bool,
    /// Present only once the wallet is real. Showing an address earlier would
    /// invite funding a wallet that may never be reachable.
    pub address: Option<String>,
    pub sync_error_detail: Option<String>,
    pub can_go_back: bool,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct CreateWallet;

impl App for CreateWallet {
    type Event = Event;
    type Model = Model;
    type ViewModel = CreateView;
    type Effect = Effect;

    fn update(&self, event: Event, model: &mut Model) -> Command<Effect, Event> {
        match event {
            Event::Start => render(),
            Event::NameChanged { name } => {
                if model.stage.is_busy() || model.draft.is_some() {
                    return Command::done(); // the input is not editable then
                }
                model.name = name;
                render()
            }
            Event::AckToggled { index } => {
                if model.stage.is_busy() || index >= ACK_COUNT {
                    return Command::done();
                }
                model.acks[index] = !model.acks[index];
                render()
            }
            Event::Submit => submit(model),
            Event::StartOver => start_over(model),
            Event::RetryUpload => retry_upload(model),
            Event::EnterWallet => enter_wallet(model),
            Event::GoBack => {
                model.status = None;
                render()
            }
            Event::ShellCompleted { attempt, result } => {
                if attempt != model.attempt {
                    // A result from an abandoned run. Dropping it is the whole
                    // reason `attempt` exists: without it, a late upload result
                    // could resurrect a draft the user already abandoned.
                    return Command::done();
                }
                accept(model, result)
            }
        }
    }

    fn view(&self, model: &Model) -> CreateView {
        let trimmed = model.name.trim();
        let name_too_long = !name_fits_user_handle(trimmed);
        let busy = model.stage.is_busy();
        let has_draft = model.draft.is_some();

        let stage = match model.stage {
            Stage::SyncFailed => CreateStage::SyncFailed,
            Stage::Created | Stage::Completing => CreateStage::Created,
            _ => CreateStage::Form,
        };

        CreateView {
            stage,
            name: model.name.clone(),
            name_editable: !busy && !has_draft,
            name_too_long,
            acks: model.acks.to_vec(),
            can_submit: !busy
                && model.acks.iter().all(|checked| *checked)
                && (has_draft || (!trimmed.is_empty() && !name_too_long)),
            submit_label: if has_draft {
                SubmitLabel::FinishVerify
            } else {
                SubmitLabel::Create
            },
            busy,
            status: model.status,
            show_start_over: has_draft && !busy,
            address: match stage {
                CreateStage::Created => model.prepared.as_ref().map(|p| p.address.clone()),
                _ => None,
            },
            sync_error_detail: match stage {
                CreateStage::SyncFailed => model.sync.last_error.clone(),
                _ => None,
            },
            can_go_back: model.stage != Stage::SyncFailed,
        }
    }
}

// ---------------------------------------------------------------------------
// User-initiated transitions
// ---------------------------------------------------------------------------

fn submit(model: &mut Model) -> Command<Effect, Event> {
    // Only from the form. `Created` and `SyncFailed` are also "not busy", and a
    // draft outlives a successful creation — so without this guard a stray
    // submit after the wallet exists would start a *second* ceremony for a
    // wallet that is already done. No screen offers that button today; the
    // machine simply must not depend on that staying true.
    if model.stage != Stage::Form || !model.acks.iter().all(|checked| *checked) {
        return Command::done();
    }

    if let Some(draft) = model.draft.clone() {
        // Resume: the passkey already exists (never re-registered). Go straight
        // to deriving and publishing — the publish's member proof is the get.
        model.attempt += 1;
        return derive_and_persist_pending(model, draft.registered_at_iso);
    }

    let trimmed = model.name.trim();
    if trimmed.is_empty() || !name_fits_user_handle(trimmed) {
        return Command::done();
    }

    model.attempt += 1;
    model.stage = Stage::CheckingSupport;
    model.status = None;
    request(model, ShellOperation::CheckPasskeySupport)
}

fn start_over(model: &mut Model) -> Command<Effect, Event> {
    // Abandon the unprovable passkey. Nothing about it was persisted (no
    // account, and the pending upload only exists after a proven signature), so
    // this is a clean reset; the orphaned authenticator entry is inert.
    model.attempt += 1;
    if let Some(handle) = model.abort.take() {
        handle.abort();
    }
    model.draft = None;
    model.prepared = None;
    model.sync = SyncState::default();
    model.stage = Stage::Form;
    model.status = None;
    render()
}

fn retry_upload(model: &mut Model) -> Command<Effect, Event> {
    if model.stage != Stage::SyncFailed || model.prepared.is_none() {
        return Command::done();
    }
    // Resumes at the publish — never at registration. The passkey is already
    // proven; re-registering would mint a second one for the same wallet. The
    // publish re-prompts for the member signature, which an explicit retry
    // makes expected.
    model.attempt += 1;
    begin_publish(model)
}

fn enter_wallet(model: &mut Model) -> Command<Effect, Event> {
    if model.stage != Stage::Created {
        return Command::done();
    }
    let Some(prepared) = model.prepared.clone() else {
        return Command::done();
    };
    // Signing was proven during creation and the key is synced — entering is
    // now a state transition, not another ceremony.
    model.attempt += 1;
    model.stage = Stage::Completing;
    request(
        model,
        ShellOperation::CompleteOnboarding {
            mode: CompletionMode::AddAccount {
                account: prepared.account(),
            },
        },
    )
}

// ---------------------------------------------------------------------------
// Shell results
// ---------------------------------------------------------------------------

fn accept(model: &mut Model, result: ShellResult) -> Command<Effect, Event> {
    match (&model.stage, result) {
        // -- support probe ---------------------------------------------------
        (Stage::CheckingSupport, ShellResult::PasskeySupport { supported }) => {
            if supported {
                model.stage = Stage::Registering;
                model.status = Some(StatusKey::SettingUpIdentity);
                let name = model.name.trim().to_owned();
                request(model, ShellOperation::RegisterPasskey { name })
            } else {
                fail_to_form(model, PromptKind::NotSupportedCreate, None)
            }
        }

        // -- registration ----------------------------------------------------
        (
            Stage::Registering,
            ShellResult::PasskeyRegistered {
                registration,
                now_iso,
            },
        ) => {
            model.draft = Some(Draft {
                credential_id: registration.credential_id,
                attestation_object_hex: registration.attestation_object_hex,
                name: model.name.trim().to_owned(),
                registered_at_iso: now_iso.clone(),
            });
            // No separate verification signature: the register member proof is
            // itself a get() that proves the passkey can sign (and that the
            // COSE public key matches the signing key). One get, not two.
            derive_and_persist_pending(model, now_iso)
        }
        (Stage::Registering, ShellResult::PasskeyFailed { kind, message }) => match kind {
            FailureKind::Cancelled => {
                model.stage = Stage::Form;
                model.status = Some(StatusKey::SetupCancelled);
                render()
            }
            // The authenticator made a device-local credential: it would sign
            // fine here but never appear at sign-in or sync for recovery. Stop
            // now — nothing has been persisted (issue #1).
            FailureKind::NotDiscoverable => fail_to_form(model, PromptKind::NotDiscoverable, None),
            FailureKind::NotSupported => fail_to_form(model, PromptKind::NotSupportedCreate, None),
            FailureKind::Other => fail_to_form(
                model,
                PromptKind::CreateFailed {
                    detail: message.unwrap_or_default(),
                },
                None,
            ),
        },

        // -- pending record --------------------------------------------------
        (Stage::SavingPending, ShellResult::PendingUploadSaved) => begin_publish(model),
        (Stage::SavingPending, ShellResult::StorageFailed { message }) => {
            fail_to_form(model, PromptKind::CreateFailed { detail: message }, None)
        }

        // -- registry publish (option B: publish before entering) ------------
        // Published (or the identical group was already on-chain) → clear the
        // pending record, then save and enter.
        (Stage::Syncing(SyncStep::Publishing), ShellResult::RegistryPublished) => {
            let Some(prepared) = model.prepared.clone() else {
                return Command::done();
            };
            model.stage = Stage::Syncing(SyncStep::RemovingPending);
            request(
                model,
                ShellOperation::RemovePendingUpload {
                    credential_id: prepared.credential_id,
                },
            )
        }
        // Publish failed. There is no silent retry — the publish needs a
        // passkey signature — so offer the retry screen. The pending record is
        // kept, and the key stays recoverable on-device regardless.
        (Stage::Syncing(SyncStep::Publishing), ShellResult::IndexFailed { message, .. }) => {
            model.sync.last_error = Some(message);
            model.stage = Stage::SyncFailed;
            model.status = None;
            render()
        }
        (Stage::Syncing(SyncStep::RemovingPending), ShellResult::PendingUploadRemoved) => {
            save_account(model)
        }
        (Stage::Syncing(SyncStep::RemovingPending), ShellResult::StorageFailed { .. }) => {
            save_account(model)
        }

        // -- local persistence ----------------------------------------------
        (Stage::Saving, ShellResult::AccountSaved) => {
            model.stage = Stage::Created;
            model.status = None;
            render()
        }
        (Stage::Saving, ShellResult::StorageFailed { message }) => {
            fail_to_form(model, PromptKind::CreateFailed { detail: message }, None)
        }

        // -- handover ---------------------------------------------------------
        (Stage::Completing, ShellResult::OnboardingCompleted) => Command::done(),

        // A prompt was dismissed, or a result arrived for a stage that no longer
        // expects it. Neither is an error, and neither may change state.
        _ => Command::done(),
    }
}

// ---------------------------------------------------------------------------
// Internal transitions
// ---------------------------------------------------------------------------

/// Extract the public key, derive the Safe address, and write the pending-sync
/// record — all before a single byte of account state exists.
fn derive_and_persist_pending(model: &mut Model, now_iso: String) -> Command<Effect, Event> {
    let Some(draft) = model.draft.clone() else {
        return Command::done();
    };

    model.status = Some(StatusKey::ExtractingKey);
    let public_key_hex = match public_key_hex_from_attestation(&draft.attestation_object_hex) {
        Ok(hex) => hex,
        Err(error) => {
            return fail_to_form(
                model,
                PromptKind::CreateFailed {
                    detail: error.to_string(),
                },
                None,
            )
        }
    };

    model.status = Some(StatusKey::ComputingAddress);
    let address = match address_from_public_key_hex(&public_key_hex) {
        Ok(address) => address,
        Err(error) => {
            return fail_to_form(
                model,
                PromptKind::CreateFailed {
                    detail: error.to_string(),
                },
                None,
            )
        }
    };

    model.prepared = Some(Prepared {
        credential_id: draft.credential_id.clone(),
        name: draft.name.clone(),
        public_key_hex: public_key_hex.clone(),
        address,
        created_at_iso: now_iso.clone(),
    });
    model.stage = Stage::SavingPending;
    request(
        model,
        ShellOperation::SavePendingUpload {
            record: PendingUpload {
                id: draft.credential_id,
                name: draft.name,
                public_key_hex,
                attestation_object_hex: draft.attestation_object_hex,
                created_at_iso: now_iso,
            },
        },
    )
}

/// Run the possession-proven publish for the prepared wallet. A metadata
/// encoding failure surfaces on the retry screen rather than blocking.
fn begin_publish(model: &mut Model) -> Command<Effect, Event> {
    let Some(prepared) = model.prepared.clone() else {
        return Command::done();
    };
    model.sync = SyncState::default();
    model.status = Some(StatusKey::SyncingKey);
    match registry_publish_op(&prepared) {
        Ok(operation) => {
            model.stage = Stage::Syncing(SyncStep::Publishing);
            request(model, operation)
        }
        Err(error) => {
            model.sync.last_error = Some(error.to_string());
            model.stage = Stage::SyncFailed;
            model.status = None;
            render()
        }
    }
}

/// Build the single-key registry publish operation for a prepared wallet.
fn registry_publish_op(prepared: &Prepared) -> Result<ShellOperation, CoreError> {
    let metadata = RegistryMetadata {
        version: REGISTRY_METADATA_VERSION,
        address: prepared.address.clone(),
        wallet_version: WALLET_VERSION.to_owned(),
        key_names: vec![prepared.name.clone()],
        created_at_iso: prepared.created_at_iso.clone(),
    };
    Ok(ShellOperation::RegistryPublish {
        metadata_hex: metadata.encode_hex()?,
        members: vec![RegistryPublishMember {
            credential_id: prepared.credential_id.clone(),
            public_key_hex: prepared.public_key_hex.clone(),
            attestation_hex: String::new(),
        }],
    })
}

/// The only place an account is ever written — reachable only after the
/// possession-proven publish has landed (or degraded to the retry screen).
fn save_account(model: &mut Model) -> Command<Effect, Event> {
    let Some(prepared) = model.prepared.clone() else {
        return Command::done();
    };
    model.stage = Stage::Saving;
    request(
        model,
        ShellOperation::SaveAccount {
            account: prepared.account(),
        },
    )
}

/// Return to the form, optionally telling the user why. The draft is left
/// exactly as the caller set it: cleared for terminal outcomes, kept for
/// resumable ones.
fn fail_to_form(
    model: &mut Model,
    prompt: PromptKind,
    status: Option<StatusKey>,
) -> Command<Effect, Event> {
    model.stage = Stage::Form;
    model.status = status;
    let attempt = model.attempt;
    Command::all([
        Command::request_from_shell(ShellOperation::Prompt {
            kind: prompt,
            confirmable: false,
        })
        .then_send(move |result| Event::ShellCompleted { attempt, result }),
        render(),
    ])
}

/// Issue one operation, remembering how to abandon it. `attempt` is captured
/// here, so the result can be matched against the run that asked for it.
fn request(model: &mut Model, operation: ShellOperation) -> Command<Effect, Event> {
    let attempt = model.attempt;
    let command = Command::request_from_shell(operation)
        .then_send(move |result| Event::ShellCompleted { attempt, result });
    model.abort = Some(command.abort_handle());
    Command::all([command, render()])
}
