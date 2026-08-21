//! Machine B — signing in with an existing passkey, and recovering when the
//! index server has never heard of it.
//!
//! ```text
//! Idle ─sign in─► support ─► authenticate ─► Safe-compat check
//!                                                  │
//!            local account ◄────── load accounts ──┘
//!                  │                     │ no local match
//!                  │                     ▼
//!                  │             query index ──record──► save ─► enter
//!                  │                     │ 404
//!                  │                     ▼
//!                  │            offer on-device recovery ─accept─► 2nd signature
//!                  ▼                                                    │
//!               enter ◄───────────────── save ◄─── rebuild public key ◄──┘
//!                                          └─► re-publish to the index (background)
//! ```
//!
//! The recovery branch is what keeps the index server a **cache** rather than a
//! single point of failure: two signatures from the same credential pin down
//! exactly one public key, and therefore exactly one Safe address, entirely
//! on-device. And because the wallet being recovered may already hold funds,
//! reaching it must never block on a server — the index is healed in the
//! background, after the user is already inside.

use crux_core::{command::AbortHandle, render::render, App, Command};
use serde::{Deserialize, Serialize};

use super::shell::{CompletionMode, Effect, ProofPurpose, ShellOperation, ShellResult};
use super::{
    address_from_public_key_hex, Account, Assertion, FailureKind, PromptKind, RegistryPublishMember,
};
use crate::error::CoreError;
use crate::primitives;
use crate::registry_metadata::{RegistryMetadata, REGISTRY_METADATA_VERSION};
use crate::webauthn;

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// Probes before the index server is declared unreachable, and the gap between
/// them — today's `for (i = 0; i < 3; i++)` with a 2 s sleep.
const HEALTH_PROBES: u8 = 3;
const HEALTH_PROBE_GAP_MS: u32 = 2000;

/// Fallback when a credential carries no name this app can trust.
const FALLBACK_ACCOUNT_NAME: &str = "Wallet";

/// The Safe deployment this wallet uses, recorded in the registry metadata.
const WALLET_VERSION: &str = "safe-1.4.1";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "LoginEvent"))]
pub enum Event {
    /// Screen mounted — starts the reachability probe.
    Start,
    /// "I already have a wallet".
    SignIn,
    /// Internal: a sign-in effect resolved, tagged with the attempt that asked.
    #[serde(skip)]
    ShellCompleted { attempt: u64, result: ShellResult },
    /// Internal: a health-probe effect resolved. Deliberately a separate
    /// channel — probing runs independently of sign-in, so it must not be
    /// discarded when a sign-in attempt supersedes.
    #[serde(skip)]
    HealthCompleted { result: ShellResult },
    /// Internal: the background index heal finished. Ignored by construction —
    /// the user is already in the wallet and nothing about it may change state.
    #[serde(skip)]
    HealIgnored,
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum Stage {
    #[default]
    Idle,
    CheckingSupport,
    Authenticating,
    LoadingAccounts,
    /// Waiting for the user to accept or decline on-device recovery.
    AwaitingConsent,
    /// Waiting for the second signature that pins down the public key.
    Recovering,
    /// Asking the registry whether the recovered key is already published.
    CheckingRegistry,
    /// Running the possession-proven publish before entering (option B).
    Publishing,
    Saving,
    Completing,
}

#[derive(Clone, Debug, Default)]
pub struct Health {
    probes_done: u8,
    unreachable: bool,
}

#[derive(Default)]
pub struct Model {
    stage: Stage,
    /// The assertion this attempt authenticated with. In the recovery branch it
    /// is also the *first* of the two signatures.
    assertion: Option<Assertion>,
    /// Wall clock observed during authentication, used for `created_at`.
    observed_at: String,
    /// The account about to be persisted.
    pending: Option<Account>,
    attempt: u64,
    health: Health,
    abort: Option<AbortHandle>,
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct LoginView {
    /// A sign-in is in flight — the welcome button shows its spinner.
    pub busy: bool,
    /// The index server did not answer its health probe. The screen surfaces
    /// the endpoint settings so the user can point the app somewhere reachable.
    pub endpoint_unreachable: bool,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Login;

impl App for Login {
    type Event = Event;
    type Model = Model;
    type ViewModel = LoginView;
    type Effect = Effect;

    fn update(&self, event: Event, model: &mut Model) -> Command<Effect, Event> {
        match event {
            Event::Start => {
                model.health = Health::default();
                Command::all([probe_health(), render()])
            }
            Event::SignIn => sign_in(model),
            Event::HealthCompleted { result } => accept_health(model, result),
            Event::HealIgnored => Command::done(),
            Event::ShellCompleted { attempt, result } => {
                if attempt != model.attempt {
                    return Command::done(); // belongs to a superseded attempt
                }
                accept(model, result)
            }
        }
    }

    fn view(&self, model: &Model) -> LoginView {
        LoginView {
            busy: model.stage != Stage::Idle,
            endpoint_unreachable: model.health.unreachable,
        }
    }
}

// ---------------------------------------------------------------------------
// Reachability probe
// ---------------------------------------------------------------------------

fn accept_health(model: &mut Model, result: ShellResult) -> Command<Effect, Event> {
    match result {
        ShellResult::IndexHealth { ok: true } => {
            // Reachable — stop probing and say nothing.
            model.health.probes_done = HEALTH_PROBES;
            Command::done()
        }
        ShellResult::IndexHealth { ok: false } => {
            model.health.probes_done += 1;
            if model.health.probes_done >= HEALTH_PROBES {
                model.health.unreachable = true;
                render()
            } else {
                Command::request_from_shell(ShellOperation::Wait {
                    ms: HEALTH_PROBE_GAP_MS,
                })
                .then_send(|result| Event::HealthCompleted { result })
            }
        }
        ShellResult::Waited => probe_health(),
        _ => Command::done(),
    }
}

fn probe_health() -> Command<Effect, Event> {
    Command::request_from_shell(ShellOperation::ProbeIndexHealth)
        .then_send(|result| Event::HealthCompleted { result })
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

fn sign_in(model: &mut Model) -> Command<Effect, Event> {
    if model.stage != Stage::Idle {
        return Command::done(); // one ceremony at a time
    }
    model.attempt += 1;
    model.assertion = None;
    model.pending = None;
    model.stage = Stage::CheckingSupport;
    request(model, ShellOperation::CheckPasskeySupport)
}

fn accept(model: &mut Model, result: ShellResult) -> Command<Effect, Event> {
    match (&model.stage, result) {
        // -- support probe ---------------------------------------------------
        (Stage::CheckingSupport, ShellResult::PasskeySupport { supported }) => {
            if supported {
                model.stage = Stage::Authenticating;
                request(model, ShellOperation::AuthenticatePasskey)
            } else {
                idle_with_prompt(model, PromptKind::NotSupportedLogin)
            }
        }

        // -- authentication --------------------------------------------------
        (Stage::Authenticating, ShellResult::PasskeyAuthenticated { assertion, now_iso }) => {
            // Before any resolution or persistence: can this provider's
            // signatures ever satisfy the Safe contracts?
            if !assertion.is_safe_compatible() {
                return idle_with_prompt(model, PromptKind::IncompatibleLogin);
            }
            model.assertion = Some(assertion);
            model.observed_at = now_iso;
            model.stage = Stage::LoadingAccounts;
            request(model, ShellOperation::LoadAccounts)
        }

        // -- resolution: local ------------------------------------------------
        (Stage::LoadingAccounts, ShellResult::AccountsLoaded { accounts }) => {
            let Some(assertion) = model.assertion.clone() else {
                return Command::done();
            };
            match accounts
                .iter()
                .position(|account| account.id == assertion.credential_id)
            {
                Some(active_index) => {
                    // Already known here: enter immediately, no server involved.
                    model.stage = Stage::Completing;
                    request(
                        model,
                        ShellOperation::CompleteOnboarding {
                            mode: CompletionMode::SetWallet {
                                accounts,
                                active_index,
                            },
                        },
                    )
                }
                None => {
                    // The registry cannot be looked up by credential id, so a
                    // key unknown on this device goes straight to on-device
                    // recovery — two signatures rebuild the public key, and
                    // therefore the address, without any server.
                    model.stage = Stage::AwaitingConsent;
                    request(
                        model,
                        ShellOperation::Prompt {
                            kind: PromptKind::RecoverOffer,
                            confirmable: true,
                        },
                    )
                }
            }
        }
        (Stage::LoadingAccounts, ShellResult::StorageFailed { message }) => {
            idle_with_prompt(model, PromptKind::SignInFailed { detail: message })
        }

        // -- recovery ----------------------------------------------------------
        (Stage::AwaitingConsent, ShellResult::PromptAnswered { accepted }) => {
            let Some(assertion) = model.assertion.clone() else {
                return Command::done();
            };
            if !accepted {
                model.stage = Stage::Idle;
                return render();
            }
            model.stage = Stage::Recovering;
            request(
                model,
                ShellOperation::SignProof {
                    credential_id: assertion.credential_id,
                    purpose: ProofPurpose::RecoverSecond,
                },
            )
        }
        (
            Stage::Recovering,
            ShellResult::ProofSigned {
                assertion: second, ..
            },
        ) => {
            let Some(first) = model.assertion.clone() else {
                return Command::done();
            };
            match recover_account(&first, &second, &model.observed_at) {
                Some(account) => begin_registry_check(model, account),
                // The two signatures did not pin down exactly one key (or the
                // bytes would not parse). Nothing is persisted on a guess.
                None => idle_with_prompt(model, PromptKind::RecoverFailed),
            }
        }
        (Stage::Recovering, ShellResult::PasskeyFailed { kind, .. }) => match kind {
            FailureKind::Cancelled => {
                model.stage = Stage::Idle;
                render()
            }
            _ => idle_with_prompt(model, PromptKind::RecoverFailed),
        },

        // -- publish before entering (option B) --------------------------------
        // Already on-chain: no re-publish, no extra signature.
        (Stage::CheckingRegistry, ShellResult::RegistryKeyStatus { registered: true }) => {
            match model.pending.clone() {
                Some(account) => begin_save(model, account),
                None => Command::done(),
            }
        }
        // Not yet on-chain: publish it before handing over the wallet.
        (Stage::CheckingRegistry, ShellResult::RegistryKeyStatus { registered: false }) => {
            begin_publish(model)
        }
        // Registry unreachable: cannot confirm, so do not block reaching the
        // wallet — the recovered account is valid on its own.
        (Stage::CheckingRegistry, ShellResult::IndexFailed { .. }) => match model.pending.clone() {
            Some(account) => begin_save(model, account),
            None => Command::done(),
        },
        // Publish landed (or the identical group was already there): enter.
        (Stage::Publishing, ShellResult::RegistryPublished) => match model.pending.clone() {
            Some(account) => begin_save(model, account),
            None => Command::done(),
        },
        // Publish failed: the recovered wallet is still valid; enter anyway.
        (Stage::Publishing, ShellResult::IndexFailed { .. }) => match model.pending.clone() {
            Some(account) => begin_save(model, account),
            None => Command::done(),
        },

        // -- persistence and handover -----------------------------------------
        // Publishing to the registry already happened before this point
        // (option B), so save simply hands the wallet over.
        (Stage::Saving, ShellResult::AccountSaved) => {
            let Some(account) = model.pending.clone() else {
                return Command::done();
            };
            model.stage = Stage::Completing;
            request(
                model,
                ShellOperation::CompleteOnboarding {
                    mode: CompletionMode::AddAccount { account },
                },
            )
        }
        (Stage::Saving, ShellResult::StorageFailed { message }) => {
            idle_with_prompt(model, PromptKind::SignInFailed { detail: message })
        }
        (Stage::Completing, ShellResult::OnboardingCompleted) => Command::done(),

        // -- ceremony failures anywhere else ------------------------------------
        (_, ShellResult::PasskeyFailed { kind, message }) => match kind {
            // The user closed the sheet. Not an error, not an alert.
            FailureKind::Cancelled => {
                model.stage = Stage::Idle;
                render()
            }
            FailureKind::NotSupported => idle_with_prompt(model, PromptKind::NotSupportedLogin),
            _ => idle_with_prompt(
                model,
                PromptKind::SignInFailed {
                    detail: message.unwrap_or_default(),
                },
            ),
        },

        _ => Command::done(),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Rebuild the wallet from two signatures by the same credential.
fn recover_account(first: &Assertion, second: &Assertion, now_iso: &str) -> Option<Account> {
    let (a, b) = (first.to_core().ok()?, second.to_core().ok()?);
    let key = webauthn::recover_public_key_from_assertions(&a, &b).ok()??;
    let public_key_hex = format!(
        "04{}{}",
        primitives::to_hex(&key.x, false),
        primitives::to_hex(&key.y, false)
    );
    let address = address_from_public_key_hex(&public_key_hex).ok()?;
    Some(Account {
        id: first.credential_id.clone(),
        name: account_name(first),
        address,
        public_key_hex,
        created_at_iso: now_iso.to_owned(),
    })
}

/// The name to show, from the credential's own user handle when the index has
/// none. Never a raw foreign handle — see `Assertion::user_name`.
fn account_name(assertion: &Assertion) -> String {
    assertion
        .user_name()
        .unwrap_or_else(|| FALLBACK_ACCOUNT_NAME.to_owned())
}

fn begin_save(model: &mut Model, account: Account) -> Command<Effect, Event> {
    model.pending = Some(account.clone());
    model.stage = Stage::Saving;
    request(model, ShellOperation::SaveAccount { account })
}

/// After recovery, ask the registry whether this key is already published
/// before deciding to publish (option B: publish precedes wallet entry).
fn begin_registry_check(model: &mut Model, account: Account) -> Command<Effect, Event> {
    let public_key_hex = account.public_key_hex.clone();
    model.pending = Some(account);
    model.stage = Stage::CheckingRegistry;
    request(model, ShellOperation::RegistryQueryByPublicKey { public_key_hex })
}

/// Emit the possession-proven publish for the pending account. A metadata
/// encoding failure never blocks reaching the wallet.
fn begin_publish(model: &mut Model) -> Command<Effect, Event> {
    let Some(account) = model.pending.clone() else {
        return Command::done();
    };
    match registry_publish_op(&account) {
        Ok(operation) => {
            model.stage = Stage::Publishing;
            request(model, operation)
        }
        Err(_) => begin_save(model, account),
    }
}

/// Build the single-key registry publish operation for an account.
fn registry_publish_op(account: &Account) -> Result<ShellOperation, CoreError> {
    let metadata = RegistryMetadata {
        version: REGISTRY_METADATA_VERSION,
        address: account.address.clone(),
        wallet_version: WALLET_VERSION.to_owned(),
        key_names: vec![account.name.clone()],
        created_at_iso: account.created_at_iso.clone(),
    };
    Ok(ShellOperation::RegistryPublish {
        metadata_hex: metadata.encode_hex()?,
        members: vec![RegistryPublishMember {
            credential_id: account.id.clone(),
            public_key_hex: account.public_key_hex.clone(),
            attestation_hex: String::new(),
        }],
    })
}

fn idle_with_prompt(model: &mut Model, prompt: PromptKind) -> Command<Effect, Event> {
    model.stage = Stage::Idle;
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

fn request(model: &mut Model, operation: ShellOperation) -> Command<Effect, Event> {
    let attempt = model.attempt;
    let command = Command::request_from_shell(operation)
        .then_send(move |result| Event::ShellCompleted { attempt, result });
    model.abort = Some(command.abort_handle());
    Command::all([command, render()])
}
