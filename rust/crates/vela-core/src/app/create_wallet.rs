//! Machine A — creating a wallet.
//!
//! ```text
//! Form ─submit─► CheckingSupport ─► Registering(key 1) ─► AddKeys
//!   ▲                                    ▲                  │ ▲
//!   │ cancel-at-register KEEPS drafts    └──add_key(≤7)─────┘ │
//!   │                                                finish_keys
//!   │                                                        ▼
//!   └────────────── SavingPending ─► Syncing{publish → remove pending}
//!                                                        ─► Saving ─► Created
//! ```
//!
//! The ordering is the product. The passkey must first produce a valid
//! signature (a provider can report `create()` success and still have stored
//! nothing — issue #1). A wallet is 1..=7 founding passkeys, all minted here:
//! the Safe address is a function of the FULL key set, so keys can never be
//! added later. The wallet is then published to the registry as a
//! possession-proven group *before* it is entered (option B): the same key set
//! that derives the address is the group's membership. For a multi-key wallet
//! that publish is load-bearing for recovery — a sibling device can only
//! reconstruct the address from the registry group — which is exactly why the
//! account is saved and enterable only after the publish has landed on-chain.
//! A publish failure surfaces the retry screen while the passkeys and their
//! drafts are kept; a single key additionally stays recoverable on-device
//! from two signatures.

use crux_core::{command::AbortHandle, render::render, App, Command};
use serde::{Deserialize, Serialize};

use super::shell::{CompletionMode, Effect, ShellOperation, ShellResult};
use super::{
    name_fits_user_handle, public_key_hex_from_attestation, Account, AccountKey, FailureKind,
    PendingUpload, PromptKind, RegistryPublishMember, StatusKey,
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
    /// From the key list: mint one more founding passkey with this label
    /// (empty ⇒ "Key N"). Capped at `MAX_MULTI_KEYS`.
    AddKey {
        name: String,
    },
    /// Drop a not-yet-published draft key. Index 0 (the wallet's pinned first
    /// key) is only removable via `StartOver`.
    RemoveKey {
        index: usize,
    },
    /// Relabel a draft key. Index 0's label is the wallet name itself.
    KeyNameChanged {
        index: usize,
        name: String,
    },
    /// Done adding keys — derive the address from the FULL set and publish.
    FinishKeys,
    /// Abandon the drafted passkeys and start from a clean form.
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
    /// Browser-reported display hints from the create() credential.
    pub authenticator_attachment: String,
    pub transports: String,
}

/// One derived founding key, canonical founding order.
#[derive(Clone, Debug, Default)]
pub struct PreparedKey {
    pub credential_id: String,
    /// The per-key label; `keys[0].name` is the wallet name.
    pub name: String,
    pub public_key_hex: String,
    /// The full attestation object (hex) — kept for the pending record.
    pub attestation_object_hex: String,
    /// The 20-byte versioned attestation extracted from the attestation
    /// object, or empty when it could not be extracted. Bound into the
    /// registry member proof.
    pub attestation_hex: String,
    /// Browser-reported display hints captured from the create() credential.
    pub authenticator_attachment: String,
    pub transports: String,
}

/// Derived from the drafts, not yet persisted anywhere. `keys[0]` is the
/// pinned shared-signer key; the address is a function of the FULL set.
#[derive(Clone, Debug, Default)]
pub struct Prepared {
    pub keys: Vec<PreparedKey>,
    pub address: String,
    pub created_at_iso: String,
}

impl Prepared {
    /// The first (pinned) key — the wallet's stable identity.
    fn first(&self) -> &PreparedKey {
        &self.keys[0]
    }

    fn account(&self) -> Account {
        let first = self.first();
        Account {
            id: first.credential_id.clone(),
            name: first.name.clone(),
            address: self.address.clone(),
            public_key_hex: first.public_key_hex.clone(),
            created_at_iso: self.created_at_iso.clone(),
            keys: self
                .keys
                .iter()
                .map(|key| AccountKey {
                    credential_id: key.credential_id.clone(),
                    public_key_hex: key.public_key_hex.clone(),
                    name: key.name.clone(),
                })
                .collect(),
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
    /// The key list between registration and derivation: add, relabel or
    /// remove founding keys, then `FinishKeys` freezes the set.
    AddKeys,
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
        !matches!(
            self,
            Stage::Form | Stage::AddKeys | Stage::SyncFailed | Stage::Created
        )
    }
}

#[derive(Default)]
pub struct Model {
    name: String,
    acks: [bool; ACK_COUNT],
    /// Founding-order draft keys; `drafts[0]` is the pinned first key.
    drafts: Vec<Draft>,
    /// The label of the registration currently in flight, claimed by the
    /// `PasskeyRegistered` result.
    registering_label: String,
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
    /// The founding-key list: rows in `keys`, plus add/relabel/remove and the
    /// finish button. Also shown (busy) while an added key's registration is
    /// in flight.
    AddKeys,
    SyncFailed,
    Created,
}

/// One row of the founding-key list.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct CreateKeyRow {
    /// The per-key label; row 0 carries the wallet name.
    pub name: String,
    /// Browser-reported display hints ("platform"/"cross-platform", comma-
    /// joined transports) — purely informational.
    pub authenticator_attachment: String,
    pub transports: String,
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
    /// The drafted founding keys, founding order. Non-empty from the moment
    /// the first registration lands.
    pub keys: Vec<CreateKeyRow>,
    /// May one more key be added (below the cap, nothing in flight)?
    pub can_add_key: bool,
    /// May the key set be frozen and published (≥1 key, nothing in flight)?
    pub can_finish: bool,
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
                if model.stage.is_busy() || !model.drafts.is_empty() {
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
            Event::AddKey { name } => add_key(model, name),
            Event::RemoveKey { index } => remove_key(model, index),
            Event::KeyNameChanged { index, name } => key_name_changed(model, index, name),
            Event::FinishKeys => finish_keys(model),
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
        let has_draft = !model.drafts.is_empty();

        let stage = match model.stage {
            Stage::SyncFailed => CreateStage::SyncFailed,
            Stage::Created | Stage::Completing => CreateStage::Created,
            Stage::AddKeys => CreateStage::AddKeys,
            // A key i≥2 registration in flight keeps the key list on screen.
            Stage::Registering if has_draft => CreateStage::AddKeys,
            _ => CreateStage::Form,
        };

        let at_key_list = model.stage == Stage::AddKeys;
        CreateView {
            stage,
            name: model.name.clone(),
            name_editable: !busy && !has_draft,
            name_too_long,
            acks: model.acks.to_vec(),
            can_submit: !busy
                && model.stage == Stage::Form
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
            keys: model
                .drafts
                .iter()
                .map(|draft| CreateKeyRow {
                    name: draft.name.clone(),
                    authenticator_attachment: draft.authenticator_attachment.clone(),
                    transports: draft.transports.clone(),
                })
                .collect(),
            can_add_key: at_key_list && model.drafts.len() < crate::safe::MAX_MULTI_KEYS,
            can_finish: at_key_list && has_draft,
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

    if !model.drafts.is_empty() {
        // Resume: passkeys already exist (never re-registered). Return to the
        // key list — the publish's member proofs are the gets.
        model.stage = Stage::AddKeys;
        model.status = None;
        return render();
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

/// The passkey-provider display name for an added key: the wallet name plus
/// the key's label, degraded to the label alone when the composition would
/// not fit the WebAuthn user-handle budget. Key 1 always uses the wallet
/// name itself, keeping N=1 byte-identical to the single-key flow.
fn passkey_display_name(wallet: &str, label: &str) -> String {
    let composed = format!("{wallet} · {label}");
    if name_fits_user_handle(&composed) {
        composed
    } else {
        label.to_owned()
    }
}

fn add_key(model: &mut Model, label: String) -> Command<Effect, Event> {
    if model.stage != Stage::AddKeys || model.drafts.len() >= crate::safe::MAX_MULTI_KEYS {
        return Command::done();
    }
    let label = label.trim().to_owned();
    let label = if label.is_empty() {
        format!("Key {}", model.drafts.len() + 1)
    } else {
        label
    };
    if !name_fits_user_handle(&label) {
        return Command::done();
    }
    model.attempt += 1;
    model.registering_label = label.clone();
    model.stage = Stage::Registering;
    model.status = Some(StatusKey::SettingUpIdentity);
    let name = passkey_display_name(model.name.trim(), &label);
    // The provider must refuse to reuse an already-founding authenticator
    // entry — a silent replacement would drop a key the address depends on.
    let exclude_credential_ids = model
        .drafts
        .iter()
        .map(|draft| draft.credential_id.clone())
        .collect();
    request(
        model,
        ShellOperation::RegisterPasskey {
            name,
            exclude_credential_ids,
        },
    )
}

fn remove_key(model: &mut Model, index: usize) -> Command<Effect, Event> {
    // Index 0 is the pinned first key — removable only via StartOver.
    if model.stage != Stage::AddKeys || index == 0 || index >= model.drafts.len() {
        return Command::done();
    }
    model.drafts.remove(index);
    render()
}

fn key_name_changed(model: &mut Model, index: usize, name: String) -> Command<Effect, Event> {
    // Row 0's label IS the wallet name; it is not editable here.
    if model.stage != Stage::AddKeys || index == 0 || index >= model.drafts.len() {
        return Command::done();
    }
    let label = name.trim().to_owned();
    if label.is_empty() || !name_fits_user_handle(&label) {
        return Command::done();
    }
    model.drafts[index].name = label;
    render()
}

/// Freeze the founding set: extract every public key, derive the address from
/// ALL of them, and write the pending-sync record — all before a single byte
/// of account state exists.
fn finish_keys(model: &mut Model) -> Command<Effect, Event> {
    if model.stage != Stage::AddKeys || model.drafts.is_empty() {
        return Command::done();
    }
    model.attempt += 1;

    model.status = Some(StatusKey::ExtractingKey);
    let mut keys = Vec::with_capacity(model.drafts.len());
    for draft in model.drafts.clone() {
        let public_key_hex = match public_key_hex_from_attestation(&draft.attestation_object_hex) {
            Ok(hex) => hex,
            Err(error) => {
                return fail_to_add_keys(
                    model,
                    PromptKind::CreateFailed {
                        detail: error.to_string(),
                    },
                )
            }
        };
        // The attestation is best-effort: a passkey with no attested-credential
        // data still registers, just without a stored attestation.
        let attestation_hex =
            crate::webauthn::extract_attestation(&draft.attestation_object_hex).unwrap_or_default();
        keys.push(PreparedKey {
            credential_id: draft.credential_id,
            name: draft.name,
            public_key_hex,
            attestation_object_hex: draft.attestation_object_hex,
            attestation_hex,
            authenticator_attachment: draft.authenticator_attachment,
            transports: draft.transports,
        });
    }

    model.status = Some(StatusKey::ComputingAddress);
    let hexes: Vec<String> = keys.iter().map(|key| key.public_key_hex.clone()).collect();
    // Also rejects duplicate keys — two providers returning the same
    // credential material would otherwise mint an undeployable address.
    let address = match super::address_from_public_key_hexes(&hexes) {
        Ok(address) => address,
        Err(error) => {
            return fail_to_add_keys(
                model,
                PromptKind::CreateFailed {
                    detail: error.to_string(),
                },
            )
        }
    };

    // The wallet's creation moment is the first key's mint time — no clock
    // lives in the core.
    let created_at_iso = model.drafts[0].registered_at_iso.clone();
    let first = keys[0].clone();
    let members = keys
        .iter()
        .map(|key| super::PendingUploadMember {
            credential_id: key.credential_id.clone(),
            name: key.name.clone(),
            public_key_hex: key.public_key_hex.clone(),
            attestation_object_hex: key.attestation_object_hex.clone(),
            authenticator_attachment: key.authenticator_attachment.clone(),
            transports: key.transports.clone(),
        })
        .collect();
    model.prepared = Some(Prepared {
        keys,
        address,
        created_at_iso: created_at_iso.clone(),
    });
    model.stage = Stage::SavingPending;
    request(
        model,
        ShellOperation::SavePendingUpload {
            record: PendingUpload {
                id: first.credential_id,
                name: first.name,
                public_key_hex: first.public_key_hex,
                attestation_object_hex: first.attestation_object_hex,
                created_at_iso,
                authenticator_attachment: first.authenticator_attachment,
                transports: first.transports,
                members,
            },
        },
    )
}

fn start_over(model: &mut Model) -> Command<Effect, Event> {
    // Abandon the drafted passkeys. Nothing about them was persisted (no
    // account, and the pending upload only exists once the set is frozen), so
    // this is a clean reset; the orphaned authenticator entries are inert.
    model.attempt += 1;
    if let Some(handle) = model.abort.take() {
        handle.abort();
    }
    model.drafts.clear();
    model.registering_label = String::new();
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
                // Key 1's provider display name IS the wallet name (N=1 stays
                // byte-identical to the single-key flow); its label too.
                let name = model.name.trim().to_owned();
                model.registering_label = name.clone();
                request(
                    model,
                    ShellOperation::RegisterPasskey {
                        name,
                        exclude_credential_ids: Vec::new(),
                    },
                )
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
            model.drafts.push(Draft {
                credential_id: registration.credential_id,
                attestation_object_hex: registration.attestation_object_hex,
                name: model.registering_label.clone(),
                registered_at_iso: now_iso,
                authenticator_attachment: registration.authenticator_attachment,
                transports: registration.transports,
            });
            // No separate verification signature: the register member proof is
            // itself a get() that proves the passkey can sign (and that the
            // COSE public key matches the signing key). One get per key, not
            // two. The user reviews the set and freezes it with FinishKeys.
            model.stage = Stage::AddKeys;
            model.status = None;
            render()
        }
        (Stage::Registering, ShellResult::PasskeyFailed { kind, message }) => match kind {
            FailureKind::Cancelled => {
                // Cancelling an ADDED key's ceremony returns to the key list
                // with the existing drafts intact; cancelling the first one
                // returns to the form.
                model.stage = if model.drafts.is_empty() {
                    Stage::Form
                } else {
                    Stage::AddKeys
                };
                model.status = Some(StatusKey::SetupCancelled);
                render()
            }
            // The authenticator made a device-local credential: it would sign
            // fine here but never appear at sign-in or sync for recovery. Stop
            // now — nothing has been persisted (issue #1).
            FailureKind::NotDiscoverable => fail_registration(model, PromptKind::NotDiscoverable),
            FailureKind::NotSupported => fail_registration(model, PromptKind::NotSupportedCreate),
            FailureKind::Other => fail_registration(
                model,
                PromptKind::CreateFailed {
                    detail: message.unwrap_or_default(),
                },
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
                    credential_id: prepared.first().credential_id.clone(),
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

/// Build the registry publish operation for a prepared wallet: one member per
/// founding key, `key_names` in the same canonical founding order. For N=1
/// this is exactly the historical single-key operation.
fn registry_publish_op(prepared: &Prepared) -> Result<ShellOperation, CoreError> {
    let metadata = RegistryMetadata {
        version: REGISTRY_METADATA_VERSION,
        address: prepared.address.clone(),
        wallet_version: WALLET_VERSION.to_owned(),
        key_names: prepared.keys.iter().map(|key| key.name.clone()).collect(),
        created_at_iso: prepared.created_at_iso.clone(),
    };
    Ok(ShellOperation::RegistryPublish {
        metadata_hex: metadata.encode_hex()?,
        members: prepared
            .keys
            .iter()
            .map(|key| RegistryPublishMember {
                credential_id: key.credential_id.clone(),
                public_key_hex: key.public_key_hex.clone(),
                attestation_hex: key.attestation_hex.clone(),
                authenticator_attachment: key.authenticator_attachment.clone(),
                transports: key.transports.clone(),
            })
            .collect(),
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

/// A registration failure returns to wherever the drafts live: the key list
/// when founding keys already exist (they stay intact), the form otherwise.
fn fail_registration(model: &mut Model, prompt: PromptKind) -> Command<Effect, Event> {
    if model.drafts.is_empty() {
        fail_to_form(model, prompt, None)
    } else {
        fail_to_add_keys(model, prompt)
    }
}

/// Return to the key list, telling the user why. The drafts are kept — the
/// minted passkeys are real and the user decides what to do with the set.
fn fail_to_add_keys(model: &mut Model, prompt: PromptKind) -> Command<Effect, Event> {
    model.stage = Stage::AddKeys;
    model.status = None;
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
