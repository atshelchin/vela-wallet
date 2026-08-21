//! Rules of signing in and recovering, one test per rule.
//!
//! The sign-in flow has no end-to-end coverage today, so these are the only
//! automated tests that exercise its branches at all.

#![cfg(feature = "crux")]

mod support;

use support::{Driver, NOW};
use vela_core::app::login::{Event, Login};
use vela_core::app::shell::{CompletionMode, ProofPurpose, ShellOperation, ShellResult};
use vela_core::app::{Assertion, FailureKind, PromptKind};

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

/// No local account: the registry cannot be looked up by credential id, so
/// sign-in goes straight to the on-device recovery offer — no index query.
#[test]
fn no_local_account_goes_straight_to_recovery() {
    let mut sut = authenticated();

    let next = sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    assert!(
        matches!(
            next.as_slice(),
            [ShellOperation::Prompt {
                kind: PromptKind::RecoverOffer,
                confirmable: true
            }]
        ),
        "the index is never queried by credential id; got {next:?}"
    );
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

/// Declining the recovery offer leaves no trace.
#[test]
fn declining_recovery_persists_nothing() {
    let mut sut = authenticated();
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });

    let next = sut.resolve(ShellResult::PromptAnswered { accepted: false });
    assert!(next.is_empty(), "declining asks for nothing");
    assert!(!sut.view().busy);
}

/// …→ recovery accepted, the second signature requested.
fn awaiting_second_signature(first: Assertion) -> Sut {
    let mut sut = mounted();
    sut.dispatch(Event::SignIn);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(ShellResult::PasskeyAuthenticated {
        assertion: first,
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::AccountsLoaded { accounts: vec![] });
    let next = sut.resolve(ShellResult::PromptAnswered { accepted: true });
    assert_eq!(
        next,
        vec![ShellOperation::SignProof {
            credential_id: CRED.to_owned(),
            purpose: ProofPurpose::RecoverSecond,
        }],
        "accepting asks for the disambiguating second signature"
    );
    sut
}

/// Accepting rebuilds the key on-device, then — option B — publishes the group
/// to the registry BEFORE entering, and only then opens the wallet.
#[test]
fn accepted_recovery_publishes_then_enters() {
    let (first, second) = support::assertion_pair(CRED);
    let mut sut = awaiting_second_signature(first);

    // The second signature pins down the real key; the wallet is queried
    // against the registry before any publish.
    let next = sut.resolve(ShellResult::ProofSigned {
        assertion: second,
        now_iso: NOW.to_owned(),
    });
    match next.as_slice() {
        [ShellOperation::RegistryQueryByPublicKey { public_key_hex }] => assert_eq!(
            *public_key_hex,
            support::expected_public_key_hex(),
            "the key rebuilt from two signatures is the credential's real key"
        ),
        other => panic!("expected a registry query, got {other:?}"),
    }

    // Not yet on-chain → publish the possession-proven group.
    let next = sut.resolve(ShellResult::RegistryKeyStatus { registered: false });
    assert!(
        matches!(next.as_slice(), [ShellOperation::RegistryPublish { .. }]),
        "an unpublished key is registered before entry; got {next:?}"
    );

    // Published → save the account and enter.
    let next = sut.resolve(ShellResult::RegistryPublished);
    assert!(matches!(
        next.as_slice(),
        [ShellOperation::SaveAccount { .. }]
    ));
    let next = sut.resolve(ShellResult::AccountSaved);
    assert!(
        next.iter()
            .any(|op| matches!(op, ShellOperation::CompleteOnboarding { .. })),
        "the wallet opens"
    );
}

/// A key the registry already knows is entered without a re-publish (and
/// without the extra signature a publish would need).
#[test]
fn an_already_registered_key_skips_the_publish() {
    let (first, second) = support::assertion_pair(CRED);
    let mut sut = awaiting_second_signature(first);
    sut.resolve(ShellResult::ProofSigned {
        assertion: second,
        now_iso: NOW.to_owned(),
    });

    let next = sut.resolve(ShellResult::RegistryKeyStatus { registered: true });
    assert!(
        matches!(next.as_slice(), [ShellOperation::SaveAccount { .. }]),
        "an already-registered key is saved directly; got {next:?}"
    );
}

/// A publish that fails must not trap the user out of a wallet they have
/// already recovered: it still saves and enters.
#[test]
fn a_failed_publish_still_enters() {
    let (first, second) = support::assertion_pair(CRED);
    let mut sut = awaiting_second_signature(first);
    sut.resolve(ShellResult::ProofSigned {
        assertion: second,
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::RegistryKeyStatus { registered: false });

    let next = sut.resolve_matching(
        |op| matches!(op, ShellOperation::RegistryPublish { .. }),
        ShellResult::IndexFailed {
            message: "still down".to_owned(),
            network: true,
        },
    );
    assert!(
        matches!(next.as_slice(), [ShellOperation::SaveAccount { .. }]),
        "a failed publish still saves and enters; got {next:?}"
    );
}

/// Two signatures that do not pin down exactly one key must fail closed —
/// never guess an address, never query or publish.
#[test]
fn an_unrecoverable_signature_pair_persists_nothing() {
    let mut sut = awaiting_second_signature(support::assertion(CRED));

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

// Resolution no longer performs a credential-id index query, so the old
// "transport failure surfaces settings" and "server error is reported"
// branches at resolution time no longer exist. Endpoint reachability is now
// surfaced solely by the health probe (see the reachability tests above); a
// publish/query failure after recovery degrades to entry (a_failed_publish…).

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
