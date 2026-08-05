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
use super::{address_from_public_key_hex, Account, Assertion, FailureKind, PromptKind};
use crate::primitives;
use crate::webauthn;

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// Probes before the index server is declared unreachable, and the gap between
/// them — today's `for (i = 0; i < 3; i++)` with a 2 s sleep.
const HEALTH_PROBES: u8 = 3;
const HEALTH_PROBE_GAP_MS: u32 = 2000;

/// Fallback when a credential carries no name this app can trust.
const FALLBACK_ACCOUNT_NAME: &str = "Wallet";

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
    QueryingIndex,
    /// Waiting for the user to accept or decline on-device recovery.
    AwaitingConsent,
    /// Waiting for the second signature that pins down the public key.
    Recovering,
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
    /// True when `pending` came from on-device recovery, which is the only case
    /// that owes the index server a background heal.
    recovered: bool,
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
    model.recovered = false;
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
                    model.stage = Stage::QueryingIndex;
                    request(
                        model,
                        ShellOperation::IndexQueryRecord {
                            credential_id: assertion.credential_id,
                        },
                    )
                }
            }
        }
        (Stage::LoadingAccounts, ShellResult::StorageFailed { message }) => {
            idle_with_prompt(model, PromptKind::SignInFailed { detail: message })
        }

        // -- resolution: index -------------------------------------------------
        (
            Stage::QueryingIndex,
            ShellResult::IndexRecord {
                public_key_hex,
                name,
            },
        ) => {
            let Some(assertion) = model.assertion.clone() else {
                return Command::done();
            };
            let address = match address_from_public_key_hex(&public_key_hex) {
                Ok(address) => address,
                Err(error) => {
                    return idle_with_prompt(
                        model,
                        PromptKind::SignInFailed {
                            detail: error.to_string(),
                        },
                    )
                }
            };
            let account = Account {
                id: assertion.credential_id.clone(),
                name: if name.is_empty() {
                    account_name(&assertion)
                } else {
                    name
                },
                address,
                public_key_hex,
                created_at_iso: model.observed_at.clone(),
            };
            begin_save(model, account, false)
        }
        // A *missing* record is not a dead end: the passkey itself can rebuild
        // the wallet. An unreachable server is a different thing entirely and
        // must not trigger recovery.
        (Stage::QueryingIndex, ShellResult::IndexMissing) => {
            model.stage = Stage::AwaitingConsent;
            request(
                model,
                ShellOperation::Prompt {
                    kind: PromptKind::RecoverOffer,
                    confirmable: true,
                },
            )
        }
        (Stage::QueryingIndex, ShellResult::IndexFailed { message, network }) => {
            if network {
                model.health.unreachable = true;
                model.stage = Stage::Idle;
                render()
            } else {
                idle_with_prompt(model, PromptKind::SignInFailed { detail: message })
            }
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
                Some(account) => begin_save(model, account, true),
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

        // -- persistence and handover -----------------------------------------
        (Stage::Saving, ShellResult::AccountSaved) => {
            let Some(account) = model.pending.clone() else {
                return Command::done();
            };
            model.stage = Stage::Completing;
            let complete = request(
                model,
                ShellOperation::CompleteOnboarding {
                    mode: CompletionMode::AddAccount {
                        account: account.clone(),
                    },
                },
            );
            if model.recovered {
                // Heal the index behind the user's back. Fire-and-forget by
                // construction: its result maps to an event that does nothing.
                let heal = Command::request_from_shell(ShellOperation::IndexCreateRecord {
                    credential_id: account.id,
                    public_key_hex: account.public_key_hex,
                    name: account.name,
                })
                .then_send(|_| Event::HealIgnored);
                Command::all([complete, heal])
            } else {
                complete
            }
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

fn begin_save(model: &mut Model, account: Account, recovered: bool) -> Command<Effect, Event> {
    model.pending = Some(account.clone());
    model.recovered = recovered;
    model.stage = Stage::Saving;
    request(model, ShellOperation::SaveAccount { account })
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
