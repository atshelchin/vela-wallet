//! Rules of signing in and recovering, one test per rule.
//!
//! The sign-in flow has no end-to-end coverage today, so these are the only
//! automated tests that exercise its branches at all.

#![cfg(feature = "crux")]

mod support;

use support::{Driver, NOW};
use vela_core::app::login::{Event, Login};
use vela_core::app::shell::{CompletionMode, ProofPurpose, ShellOperation, ShellResult};
use vela_core::app::{FailureKind, PromptKind};

const CRED: &str = "credential-1";

type Sut = Driver<Login>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Mounted, with the health probe answered so it is out of the way.
fn mounted() -> Sut {
    let mut sut = Sut::new();
    sut.dispatch(Event::Start);
    sut.resolve(ShellResult::IndexHealth { ok: true });
    sut
}

/// …→ signed in with a genuine, Safe-compatible assertion, accounts loaded next.
fn authenticated() -> Sut {
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(ShellResult::PasskeyAuthenticated {
        assertion: support::assertion(CRED),
        now_iso: NOW.to_owned(),
    });
    sut
}

// ---------------------------------------------------------------------------
// Reachability probe (FR-023)
// ---------------------------------------------------------------------------

/// Three failed probes, spaced, before the endpoint settings are surfaced.
#[test]
fn three_failed_probes_declare_the_index_unreachable() {
    let mut sut = Sut::new();
    let first = sut.dispatch(Event::Start);
    assert_eq!(first, vec![ShellOperation::ProbeIndexHealth]);

    let mut waits = 0;
    for _ in 0..3 {
        match sut
            .resolve(ShellResult::IndexHealth { ok: false })
            .as_slice()
        {
            [ShellOperation::Wait { ms: 2000 }] => {
                waits += 1;
                sut.resolve(ShellResult::Waited);
            }
            [] => break,
            other => panic!("unexpected operation while probing: {other:?}"),
        }
    }

    assert_eq!(waits, 2, "two gaps between three probes");
    assert!(sut.view().endpoint_unreachable);
}

/// A server that answers on the second try is not unreachable, and the user is
/// never told anything.
#[test]
fn a_probe_that_succeeds_leaves_the_endpoint_alone() {
    let mut sut = Sut::new();
    sut.dispatch(Event::Start);
    sut.resolve(ShellResult::IndexHealth { ok: false });
    sut.resolve(ShellResult::Waited);
    let next = sut.resolve(ShellResult::IndexHealth { ok: true });

    assert!(next.is_empty(), "probing stops");
    assert!(!sut.view().endpoint_unreachable);
}

// ---------------------------------------------------------------------------
// Resolution order (FR-016, FR-017)
// ---------------------------------------------------------------------------

/// A credential this device already knows opens the wallet with no server call
/// at all — the index is a cache, not a gate.
#[test]
fn a_locally_known_credential_opens_the_wallet_without_the_index() {
    let mut sut = authenticated();
    let accounts = vec![
        support::account(
            "other",
            "Other",
            "0x1111111111111111111111111111111111111111",
        ),
        support::account(CRED, "Ann", "0x2222222222222222222222222222222222222222"),
    ];

    let next = sut.resolve(ShellResult::AccountsLoaded { accounts });

    match next.as_slice() {
        [ShellOperation::CompleteOnboarding {
            mode:
                CompletionMode::SetWallet {
                    accounts,
                    active_index,
                },
        }] => {
            assert_eq!(*active_index, 1, "the matching account is the active one");
            assert_eq!(accounts.len(), 2, "the whole list is restored");
        }
        other => panic!("expected immediate completion, got {other:?}"),
    }
}

/// No local account, but the index has the key: derive the address from it,
/// persist, and enter.
#[test]
fn an_indexed_credential_is_resolved_persisted_and_entered() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    let next = sut.resolve(ShellResult::IndexRecord {
        public_key_hex: support::expected_public_key_hex(),
        name: "Ann".to_owned(),
    });

    match next.as_slice() {
        [ShellOperation::SaveAccount { account }] => {
            assert_eq!(account.id, CRED);
            assert_eq!(account.name, "Ann");
            assert!(account.address.starts_with("0x"));
        }
        other => panic!("expected the account to be saved, got {other:?}"),
    }

    let next = sut.resolve(ShellResult::AccountSaved);
    assert!(matches!(
        next.as_slice(),
        [ShellOperation::CompleteOnboarding {
            mode: CompletionMode::AddAccount { .. }
        }]
    ));
}

/// FR-020 — when the index has no name, the credential's own user handle
/// supplies it, decoded strictly.
#[test]
fn a_nameless_index_record_falls_back_to_the_credential_handle() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    let next = sut.resolve(ShellResult::IndexRecord {
        public_key_hex: support::expected_public_key_hex(),
        name: String::new(),
    });

    match next.as_slice() {
        [ShellOperation::SaveAccount { account }] => assert_eq!(account.name, "Ann"),
        other => panic!("expected a save, got {other:?}"),
    }
}

/// FR-016 — compatibility is checked before anything is resolved or written.
#[test]
fn an_incompatible_provider_stops_before_any_resolution() {
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    sut.resolve(ShellResult::PasskeySupport { supported: true });

    let next = sut.resolve(ShellResult::PasskeyAuthenticated {
        assertion: support::incompatible_assertion(CRED),
        now_iso: NOW.to_owned(),
    });

    assert!(
        matches!(
            next.as_slice(),
            [ShellOperation::Prompt {
                kind: PromptKind::IncompatibleLogin,
                ..
            }]
        ),
        "no accounts are loaded, no index is queried, nothing is saved"
    );
    assert!(!sut.view().busy);
}

// ---------------------------------------------------------------------------
// Recovery (FR-018, FR-019)
// ---------------------------------------------------------------------------

/// A missing record offers on-device recovery; declining leaves no trace.
#[test]
fn a_missing_record_offers_recovery_and_declining_persists_nothing() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    let next = sut.resolve(ShellResult::IndexMissing);
    assert!(matches!(
        next.as_slice(),
        [ShellOperation::Prompt {
            kind: PromptKind::RecoverOffer,
            confirmable: true
        }]
    ));

    let next = sut.resolve(ShellResult::PromptAnswered { accepted: false });
    assert!(next.is_empty(), "declining asks for nothing");
    assert!(!sut.view().busy);
}

/// Accepting asks for the second signature, rebuilds the key on-device, opens
/// the wallet, and only then re-publishes to the index.
#[test]
fn accepted_recovery_rebuilds_the_wallet_and_heals_the_index_afterwards() {
    let (first, second) = support::assertion_pair(CRED);
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(ShellResult::PasskeyAuthenticated {
        assertion: first,
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });
    sut.resolve(ShellResult::IndexMissing);

    let next = sut.resolve(ShellResult::PromptAnswered { accepted: true });
    assert_eq!(
        next,
        vec![ShellOperation::SignProof {
            credential_id: CRED.to_owned(),
            purpose: ProofPurpose::RecoverSecond,
        }]
    );

    let next = sut.resolve(ShellResult::ProofSigned {
        assertion: second,
        now_iso: NOW.to_owned(),
    });
    match next.as_slice() {
        [ShellOperation::SaveAccount { account }] => {
            assert_eq!(
                account.public_key_hex,
                support::expected_public_key_hex(),
                "the key rebuilt from two signatures is the credential's real key"
            );
        }
        other => panic!("expected the recovered account to be saved, got {other:?}"),
    }

    let next = sut.resolve(ShellResult::AccountSaved);
    assert!(
        next.iter()
            .any(|op| matches!(op, ShellOperation::CompleteOnboarding { .. })),
        "the wallet opens"
    );
    assert!(
        next.iter()
            .any(|op| matches!(op, ShellOperation::IndexCreateRecord { .. })),
        "and the index is healed in the background"
    );
}

/// FR-019 — the heal is fire-and-forget: the wallet may already hold funds, so
/// reaching it must never depend on a server that was already missing the key.
#[test]
fn a_failed_background_heal_changes_nothing() {
    let (first, second) = support::assertion_pair(CRED);
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(ShellResult::PasskeyAuthenticated {
        assertion: first,
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });
    sut.resolve(ShellResult::IndexMissing);
    sut.resolve(ShellResult::PromptAnswered { accepted: true });
    sut.resolve(ShellResult::ProofSigned {
        assertion: second,
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::AccountSaved);

    let before = sut.view().busy;
    let next = sut.resolve_matching(
        |op| matches!(op, ShellOperation::IndexCreateRecord { .. }),
        ShellResult::IndexFailed {
            message: "still down".to_owned(),
            network: true,
        },
    );

    assert!(next.is_empty(), "a failed heal asks for nothing");
    assert_eq!(sut.view().busy, before);
    assert!(
        !sut.view().endpoint_unreachable,
        "a background failure must not raise the endpoint warning either"
    );
}

/// Two signatures that do not pin down exactly one key must fail closed —
/// never guess an address.
#[test]
fn an_unrecoverable_signature_pair_persists_nothing() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });
    sut.resolve(ShellResult::IndexMissing);
    sut.resolve(ShellResult::PromptAnswered { accepted: true });

    // The same signature twice: the candidate sets are ambiguous by design.
    let next = sut.resolve(ShellResult::ProofSigned {
        assertion: support::assertion(CRED),
        now_iso: NOW.to_owned(),
    });

    assert!(matches!(
        next.as_slice(),
        [ShellOperation::Prompt {
            kind: PromptKind::RecoverFailed,
            ..
        }]
    ));
}

// ---------------------------------------------------------------------------
// Failure classification (FR-021, FR-022)
// ---------------------------------------------------------------------------

/// A dismissed OS sheet is not an error and must not raise an alert.
#[test]
fn a_cancelled_ceremony_is_silent() {
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    sut.resolve(ShellResult::PasskeySupport { supported: true });

    let next = sut.resolve(ShellResult::PasskeyFailed {
        kind: FailureKind::Cancelled,
        message: None,
    });

    assert!(next.is_empty(), "no prompt, no error state");
    assert!(!sut.view().busy);
}

/// FR-018/FR-022 — an unreachable server is not a missing record. Offering
/// recovery there would ask for a signature the user does not need.
#[test]
fn a_transport_failure_surfaces_settings_and_never_offers_recovery() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    let next = sut.resolve(ShellResult::IndexFailed {
        message: "Network request failed".to_owned(),
        network: true,
    });

    assert!(next.is_empty(), "no recovery offer, no alert");
    assert!(sut.view().endpoint_unreachable);
    assert!(!sut.view().busy);
}

/// A server that answers with an error is a different thing again: the user is
/// told what happened rather than sent to the endpoint settings.
#[test]
fn a_server_error_is_reported_rather_than_blamed_on_the_endpoint() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    let next = sut.resolve(ShellResult::IndexFailed {
        message: "HTTP 500".to_owned(),
        network: false,
    });

    assert!(matches!(
        next.as_slice(),
        [ShellOperation::Prompt {
            kind: PromptKind::SignInFailed { .. },
            ..
        }]
    ));
    assert!(!sut.view().endpoint_unreachable);
}

// ---------------------------------------------------------------------------
// Races (FR-033)
// ---------------------------------------------------------------------------

/// FR-025 — a result belonging to a superseded attempt cannot move the machine.
///
/// The realistic shape: an alert from a failed attempt is still on screen when
/// the user starts a fresh sign-in. Its dismissal arrives late, and must not be
/// mistaken for an answer the *new* attempt is waiting for.
#[test]
fn late_result_after_supersede_cannot_overwrite() {
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    let stale_prompt = sut.resolve(ShellResult::PasskeySupport { supported: false });
    assert!(matches!(
        stale_prompt.as_slice(),
        [ShellOperation::Prompt { .. }]
    ));

    // A new attempt starts while the alert is still up.
    let fresh = sut.dispatch(Event::SignIn);
    assert_eq!(fresh, vec![ShellOperation::CheckPasskeySupport]);

    // The old alert is dismissed now.
    let next = sut.resolve_matching(
        |op| matches!(op, ShellOperation::Prompt { .. }),
        ShellResult::PromptAnswered { accepted: true },
    );

    assert!(next.is_empty(), "the stale answer is dropped");
    assert!(sut.view().busy, "the new attempt is still in flight");

    // …and the new attempt proceeds normally.
    let next = sut.resolve_matching(
        |op| matches!(op, ShellOperation::CheckPasskeySupport),
        ShellResult::PasskeySupport { supported: true },
    );
    assert_eq!(next, vec![ShellOperation::AuthenticatePasskey]);
}

/// FR-024 — one ceremony at a time on the welcome screen too.
#[test]
fn sign_in_while_busy_is_a_no_op() {
    let mut sut = mounted();
    let first = sut.dispatch(Event::SignIn);
    let second = sut.dispatch(Event::SignIn);

    assert_eq!(first.len(), 1);
    assert!(second.is_empty());
}
