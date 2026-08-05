//! The vocabulary both onboarding machines use to ask the outside world for
//! something, and the vocabulary the outside world answers in.
//!
//! Shared on purpose: six of these operations are used by both flows, so the web
//! shell implements **one** executor and the generated TypeScript has one union
//! instead of two overlapping ones.
//!
//! Nothing here performs the work. `RegisterPasskey` is a *sentence*, not a
//! ceremony; `SaveAccount` is a *request*, not a write. The shell owns `rpId`,
//! endpoint URLs, timeouts, challenge material and the clock — none of which
//! appear in this file, which is why no core test can depend on a domain, a
//! network condition or the time of day.

use crux_core::capability::Operation;
use crux_core::macros::effect;
use crux_core::render::RenderOperation;
use serde::{Deserialize, Serialize};

use super::{Account, Assertion, FailureKind, PendingUpload, PromptKind, Registration};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// Why a signature is being requested. The shell mints a fresh challenge per
/// request; the purpose only selects which challenge label it uses, preserving
/// today's `vela-verify-…` / `vela-recover-…` strings.
///
/// The "two recovery signatures must differ" invariant is **not** trust in the
/// shell: `recover_public_key_from_assertions` returns `None` unless the two
/// assertions pin down exactly one key, so a repeated challenge fails closed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum ProofPurpose {
    /// Prove a freshly registered passkey can actually sign (issue #1).
    Verify,
    /// First of the two signatures that rebuild a lost public key.
    RecoverFirst,
    /// Second of the two — over a different challenge.
    RecoverSecond,
}

/// How onboarding hands the wallet over to the app.
///
/// Two shapes because sign-in resolves differently: a locally known credential
/// restores the whole account list with the right one selected, everything else
/// appends the single account it just established.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum CompletionMode {
    SetWallet {
        accounts: Vec<Account>,
        active_index: usize,
    },
    AddAccount {
        account: Account,
    },
}

/// Everything below this line must be performed by a platform shell.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum ShellOperation {
    /// Is a passkey authenticator available at all?
    CheckPasskeySupport,
    /// `navigator.credentials.create()` — mint a passkey for this name.
    RegisterPasskey { name: String },
    /// `navigator.credentials.get()` against a known credential.
    SignProof {
        credential_id: String,
        purpose: ProofPurpose,
    },
    /// `navigator.credentials.get()` with no credential hint — "who are you?".
    AuthenticatePasskey,
    /// Read every locally stored account.
    LoadAccounts,
    SaveAccount { account: Account },
    SavePendingUpload { record: PendingUpload },
    RemovePendingUpload { credential_id: String },
    /// Publish a public key to the index server.
    IndexCreateRecord {
        credential_id: String,
        public_key_hex: String,
        name: String,
    },
    /// Look a credential up in the index server.
    IndexQueryRecord { credential_id: String },
    /// Has the index server's on-chain reveal landed for this wallet yet?
    IndexQueryByWalletRef { address: String },
    /// One health probe of the index server.
    ProbeIndexHealth,
    /// Wait, without the core owning a clock. Used for retry backoff.
    ///
    /// `u32`, not `u64`: the wire is JSON and `JSON.parse` yields a `number`, so
    /// a 64-bit type would generate a TypeScript `bigint` the shell never
    /// actually receives.
    Wait { ms: u32 },
    /// Ask (or tell) the user something. `confirmable` selects a two-button
    /// dialog whose answer is a business decision.
    Prompt {
        kind: PromptKind,
        confirmable: bool,
    },
    /// Hand the wallet to the app and leave onboarding.
    CompleteOnboarding { mode: CompletionMode },
}

impl Operation for ShellOperation {
    type Output = ShellResult;
}

/// What the shell observed. Failures arrive as *variants*, never as exceptions:
/// the executor converts every rejected promise into the failure result that
/// belongs to the operation, which is what lets the core own classification
/// instead of pattern-matching error strings.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum ShellResult {
    PasskeySupport {
        supported: bool,
    },
    /// `now_iso` is the wall clock the shell observed while doing the work —
    /// reported alongside the observation so the core stays a pure function of
    /// its inputs (no clock effect, no clock in tests).
    PasskeyRegistered {
        registration: Registration,
        now_iso: String,
    },
    ProofSigned {
        assertion: Assertion,
        now_iso: String,
    },
    PasskeyAuthenticated {
        assertion: Assertion,
        now_iso: String,
    },
    PasskeyFailed {
        kind: FailureKind,
        /// The platform's own words, forwarded verbatim for the
        /// "something went wrong" alert. Absent for classified failures, whose
        /// copy comes from the classification.
        message: Option<String>,
    },
    AccountsLoaded {
        accounts: Vec<Account>,
    },
    AccountSaved,
    PendingUploadSaved,
    PendingUploadRemoved,
    StorageFailed {
        message: String,
    },
    IndexCreated,
    IndexRecord {
        public_key_hex: String,
        name: String,
    },
    /// The index server answered, and it has no record for this credential.
    /// Distinct from `IndexFailed`: a *missing* record is recoverable on-device,
    /// an unreachable server is not.
    IndexMissing,
    IndexFailed {
        message: String,
        /// True when the request never reached the server (transport failure or
        /// abort). Only the shell can tell that from a 4xx, so this one bit of
        /// classification is delegated.
        network: bool,
    },
    WalletRef {
        resolved: bool,
    },
    IndexHealth {
        ok: bool,
    },
    Waited,
    PromptAnswered {
        accepted: bool,
    },
    OnboardingCompleted,
}

/// Render, or ask the shell for something. Shared by both machines.
#[effect]
pub enum Effect {
    Render(RenderOperation),
    Shell(ShellOperation),
}
