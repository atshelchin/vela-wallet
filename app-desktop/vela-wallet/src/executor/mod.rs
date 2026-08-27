//! The only place onboarding touches the outside world.
//!
//! Each `ShellOperation` the core declares maps to exactly one call — a passkey
//! ceremony, a storage read or write, a registry request, a timer, a prompt.
//! There is no branching on business meaning here: **if this file ever grows an
//! `if` that decides what happens next, that decision belongs in the Rust
//! machine instead.**
//!
//! ## Failure contract
//!
//! Nothing propagates a failure outward. Every operation answers with the
//! result variant it owes, including for its failures — which is what lets the
//! core own classification instead of pattern-matching error strings.
//!
//! The web executor needs a second function for this (`operationFailure`),
//! because a thrown promise arrives without saying which operation it belonged
//! to. Rust has no such gap: every arm below returns a `ShellResult` on both
//! paths, so the mapping cannot go missing for an operation and cannot drift
//! from it. Adding an operation to the core stops this `match` from compiling,
//! which is the intended way to find out.
//!
//! ## Where the work happens
//!
//! [`perform`] BLOCKS: it opens a USB device, waits for a finger, does TLS.
//! Callers run it on gpui's background executor and hand the answer back to the
//! core on the main thread. Two of the eighteen operations are not performed
//! here at all — `Prompt` and `CompleteOnboarding` belong to the screen, which
//! is why [`Performed`] exists.

pub mod passkey;
pub mod proxy;
pub mod registry;
pub mod storage;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use vela_core::app::{FailureKind, KeyMethod};
use vela_core::app::session::{SessionOperation, SessionShellResult};
use vela_core::app::shell::{ProofPurpose, ShellOperation, ShellResult};
use vela_core::l10n::datetime::Civil;
use vela_core::primitives;
use vela_core::registry_proof::{build_member_proof, group_public_key_from_seed};

use passkey::{Ceremony, PasskeyFailure};

/// What performing an operation produced.
pub enum Performed {
    /// An answer for the core.
    Now(Box<ShellResult>),
    /// Not this module's business. The screen shows the prompt or performs the
    /// hand-off, and answers when it has — those are the two operations whose
    /// "outside world" is the user interface itself.
    Screen,
}

/// Perform one onboarding operation. Never fails outward; see the module note.
pub fn perform(operation: &ShellOperation, ceremony: &Ceremony) -> Performed {
    let result = match operation {
        ShellOperation::CheckPasskeySupport => ShellResult::PasskeySupport {
            supported: passkey::supported(),
        },

        ShellOperation::RegisterPasskey {
            name,
            exclude_credential_ids,
            method,
        } => match passkey::register(name, exclude_credential_ids, *method, ceremony) {
            Ok(registration) => ShellResult::PasskeyRegistered {
                registration,
                now_iso: now_iso(),
            },
            Err(failure) => passkey_failed(failure),
        },

        ShellOperation::SignProof {
            credential_id,
            // This client runs the ceremony itself — a cable, or Windows Hello
            // — so it routes on its own build rather than on a transport hint.
            // Named to keep the match exhaustive and the omission deliberate.
            transports: _,
            purpose,
        } => match passkey::assert(&challenge_for(*purpose), Some(credential_id), KeyMethod::SecurityKey, ceremony) {
            Ok(assertion) => ShellResult::ProofSigned {
                assertion,
                now_iso: now_iso(),
            },
            Err(failure) => passkey_failed(failure),
        },

        ShellOperation::GenerateGroupKey => {
            // The one-time software group key — the only randomness in the flow
            // that is not a challenge, and it stays in the shell. The core only
            // echoes it into the final publish.
            let seed_hex = primitives::to_hex(&passkey::random(32), false);
            match group_public_key_from_seed(&seed_hex) {
                Ok(group_public_key_hex) => ShellResult::GroupKeyGenerated {
                    seed_hex,
                    group_public_key_hex,
                },
                // A seed the P-256 scalar field rejects is a CSPRNG that is not
                // one. It is reported as a storage failure because that is the
                // variant this operation owes; the message says what happened.
                Err(error) => ShellResult::StorageFailed {
                    message: format!("could not derive the group key: {error}"),
                },
            }
        }

        ShellOperation::SignMemberProof {
            credential_id,
            public_key_hex,
            attestation_hex,
            transports: _,
            group_public_key_hex,
        } => {
            // Mixed failure modes: the challenge fetch and the ceremony can each
            // fail, and the core branches differently on the two. Classify by
            // what actually failed rather than by which operation it was.
            match registry::member_challenge(group_public_key_hex, public_key_hex, attestation_hex)
            {
                Err(error) => index_failed(error),
                Ok(challenge) => match primitives::from_hex(&challenge) {
                    Err(error) => ShellResult::IndexFailed {
                        message: format!("the registry challenge is not hex: {error}"),
                        network: false,
                    },
                    Ok(bytes) => match passkey::assert(&bytes, Some(credential_id), KeyMethod::SecurityKey, ceremony) {
                        Err(failure) => passkey_failed(failure),
                        Ok(assertion) => match build_member_proof(
                            &assertion.authenticator_data_hex,
                            &assertion.client_data_json_hex,
                            &assertion.signature_der_hex,
                        ) {
                            Ok(proof) => ShellResult::MemberProofSigned { proof },
                            Err(error) => ShellResult::IndexFailed {
                                message: format!("could not assemble the member proof: {error}"),
                                network: false,
                            },
                        },
                    },
                },
            }
        }

        ShellOperation::LookupLegacyName { credential_id } => ShellResult::LegacyName {
            name: registry::legacy_name(credential_id),
        },

        // The method is the person's sign-in choice, and now it routes: the scan
        // method signs in through a phone over caBLE, every other method through
        // the plugged-in security key. `passkey::assert` owns the branch.
        ShellOperation::AuthenticatePasskey { method } => {
            match passkey::assert(&passkey::random(32), None, *method, ceremony) {
                Ok(assertion) => ShellResult::PasskeyAuthenticated {
                    assertion,
                    now_iso: now_iso(),
                },
                Err(failure) => passkey_failed(failure),
            }
        }

        ShellOperation::LoadAccounts => match storage::load_accounts() {
            Ok(accounts) => ShellResult::AccountsLoaded { accounts },
            Err(error) => ShellResult::StorageFailed {
                message: error.to_string(),
            },
        },

        ShellOperation::SaveAccount { account } => match storage::save_account(account) {
            Ok(()) => ShellResult::AccountSaved,
            Err(error) => ShellResult::StorageFailed {
                message: error.to_string(),
            },
        },

        ShellOperation::SavePendingUpload { record } => {
            match storage::save_pending_upload(record) {
                Ok(()) => ShellResult::PendingUploadSaved,
                Err(error) => ShellResult::StorageFailed {
                    message: error.to_string(),
                },
            }
        }

        ShellOperation::RemovePendingUpload { credential_id } => {
            match storage::remove_pending_upload(credential_id) {
                Ok(()) => ShellResult::PendingUploadRemoved,
                Err(error) => ShellResult::StorageFailed {
                    message: error.to_string(),
                },
            }
        }

        ShellOperation::RegistryPublish {
            metadata_hex,
            members,
            group_seed_hex,
            group_public_key_hex,
        } => match registry::publish(
            metadata_hex,
            members,
            group_seed_hex,
            group_public_key_hex,
            ceremony,
        ) {
            Ok(()) => ShellResult::RegistryPublished,
            Err(error) => index_failed(error),
        },

        ShellOperation::RegistryQueryByPublicKey { public_key_hex } => {
            match registry::query_by_public_key(public_key_hex) {
                Ok(status) => ShellResult::RegistryKeyStatus {
                    registered: status.registered,
                    unit_ids: status.unit_ids,
                },
                Err(error) => index_failed(error),
            }
        }

        ShellOperation::RegistryQueryUnit { unit_id } => match registry::query_unit(*unit_id) {
            Ok(unit) => ShellResult::RegistryUnit {
                metadata_hex: unit.metadata_hex,
                members: unit.members,
            },
            Err(error) => index_failed(error),
        },

        ShellOperation::ProbeIndexHealth => ShellResult::IndexHealth {
            ok: registry::probe_health(),
        },

        ShellOperation::Wait { ms } => {
            // `wait` is the core's only clock, and it is a real sleep on this
            // task's own background thread. It is not cancellable and does not
            // need to be: the machines keep one operation in flight per
            // pipeline and drop a superseded answer by attempt, so a timer that
            // fires after the screen moved on is discarded on arrival (see
            // `core_host.rs`).
            std::thread::sleep(Duration::from_millis(u64::from(*ms)));
            ShellResult::Waited
        }

        // The two the screen owns.
        ShellOperation::Prompt { .. } | ShellOperation::CompleteOnboarding { .. } => {
            return Performed::Screen;
        }
    };
    Performed::Now(Box::new(result))
}

/// Perform one session operation.
///
/// Five of the seven are best effort by contract: the session is already in the
/// state the write was meant to record, and a failed write cannot put it back.
/// That is why so many arms here discard their error — deliberately, and only
/// where the contract says the shell swallows it.
pub fn perform_session(operation: &SessionOperation) -> SessionShellResult {
    match operation {
        SessionOperation::LoadAccounts => match storage::load_accounts() {
            Ok(accounts) => SessionShellResult::AccountsLoaded { accounts },
            Err(_) => SessionShellResult::AccountsUnavailable,
        },
        SessionOperation::LoadActiveIndex => SessionShellResult::ActiveIndexLoaded {
            index: storage::load_active_index(),
        },
        SessionOperation::SaveAccount { account } => {
            let _ = storage::save_account(account);
            SessionShellResult::AccountSaved
        }
        SessionOperation::SaveActiveIndex { index } => {
            let _ = storage::save_active_index(*index);
            SessionShellResult::ActiveIndexSaved
        }
        SessionOperation::CheckPendingUploads => match storage::has_pending_uploads() {
            Ok(has_pending) => SessionShellResult::PendingUploads { has_pending },
            // Fail closed: the sign-out dialog simply does not open, so no
            // unwarned logout path appears.
            Err(_) => SessionShellResult::PendingUploadsUnavailable,
        },
        SessionOperation::ClearSignedInWallet => {
            let _ = storage::clear_signed_in_wallet();
            SessionShellResult::SignedInWalletCleared
        }
        SessionOperation::ClearExtensionCache => {
            // A no-op wherever no extension exists, which is every desktop: the
            // Safari extension's account snapshot is an iOS artifact. Answered
            // rather than skipped, because the core is waiting for the ack.
            SessionShellResult::ExtensionCacheCleared
        }
    }
}

// ---------------------------------------------------------------------------
// The small conversions
// ---------------------------------------------------------------------------

fn passkey_failed(failure: PasskeyFailure) -> ShellResult {
    ShellResult::PasskeyFailed {
        kind: failure.kind,
        // A classified failure's copy comes from the classification; only
        // `other` — and the desktop's own `not_supported`, which has to be able
        // to say "plug in your key" — carries words, and those are forwarded
        // verbatim because they go into the bug report.
        message: match failure.kind {
            FailureKind::Other | FailureKind::NotSupported | FailureKind::NotDiscoverable => {
                failure.message
            }
            FailureKind::Cancelled => None,
        },
    }
}

fn index_failed(error: registry::RegistryError) -> ShellResult {
    ShellResult::IndexFailed {
        message: error.message,
        network: error.network,
    }
}

/// The challenge a proof purpose signs over.
///
/// The label strings are preserved verbatim from the shipping clients — they
/// are part of the wire, not decoration. The two recovery purposes share a
/// label on purpose: what must differ between the two signatures is the
/// challenge BYTES, and the millisecond tail supplies that. The invariant is
/// not trusted to the shell either way — `recover_public_key_from_assertions`
/// returns nothing unless the two assertions pin down exactly one key, so a
/// repeated challenge fails closed in the core.
fn challenge_for(purpose: ProofPurpose) -> Vec<u8> {
    let label = match purpose {
        ProofPurpose::Verify => "vela-verify-",
        ProofPurpose::RecoverFirst | ProofPurpose::RecoverSecond => "vela-recover-",
    };
    format!("{label}{}", unix_millis()).into_bytes()
}

fn unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// The wall clock this shell observed, as the core's clients all spell it.
///
/// It travels WITH the observation rather than being asked for separately,
/// which is what keeps the core a pure function of its inputs: no clock effect,
/// and no clock in any core test. UTC, because a stored `created_at_iso` that
/// carries a local offset is a record that means something different when the
/// laptop moves.
fn now_iso() -> String {
    let civil = Civil::from_unix_millis(unix_millis(), 0);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        civil.year,
        civil.month,
        civil.day,
        civil.hour,
        civil.minute,
        civil.second,
        unix_millis().rem_euclid(1_000)
    )
}
