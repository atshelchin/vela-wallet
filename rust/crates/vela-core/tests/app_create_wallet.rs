//! Rules of wallet creation, one test per rule.
//!
//! Every one of these was previously only reachable by clicking through a
//! browser with a virtual authenticator. Each test names the rule it pins.

#![cfg(feature = "crux")]

mod support;

use support::{Driver, NOW};
use vela_core::app::create_wallet::{CreateStage, CreateWallet, Event, SubmitLabel};
use vela_core::app::shell::{ProofPurpose, ShellOperation, ShellResult};
use vela_core::app::{FailureKind, StatusKey};

const CRED: &str = "credential-1";

type Sut = Driver<CreateWallet>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn filled(name: &str) -> Sut {
    let mut sut = Sut::new();
    sut.dispatch(Event::Start);
    sut.dispatch(Event::NameChanged {
        name: name.to_owned(),
    });
    for index in 0..4 {
        sut.dispatch(Event::AckToggled { index });
    }
    sut
}

/// Form → registered passkey → waiting for the proof signature.
fn awaiting_proof(name: &str) -> Sut {
    let mut sut = filled(name);
    sut.dispatch(Event::Submit);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::registration(CRED),
        now_iso: NOW.to_owned(),
    });
    sut
}

/// …→ proof signed → pending record written → first upload attempt in flight.
fn uploading(name: &str) -> Sut {
    let mut sut = awaiting_proof(name);
    sut.resolve(ShellResult::ProofSigned {
        assertion: support::assertion(CRED),
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::PendingUploadSaved);
    sut
}

fn confirmed_record() -> ShellResult {
    ShellResult::IndexRecord {
        public_key_hex: support::expected_public_key_hex(),
        name: "Ann".to_owned(),
    }
}

fn is_save_account(operation: &ShellOperation) -> bool {
    matches!(operation, ShellOperation::SaveAccount { .. })
}

// ---------------------------------------------------------------------------
// Form rules
// ---------------------------------------------------------------------------

/// FR-015 — the acknowledgment gate is a business rule, not a UI decoration.
#[test]
fn submit_requires_every_acknowledgment() {
    let mut sut = Sut::new();
    sut.dispatch(Event::NameChanged {
        name: "Ann".to_owned(),
    });
    for index in 0..3 {
        sut.dispatch(Event::AckToggled { index });
    }
    assert!(!sut.view().can_submit, "three of four boxes must not pass");

    sut.dispatch(Event::AckToggled { index: 3 });
    assert!(sut.view().can_submit);
}

/// FR-015 — a name that cannot fit the WebAuthn user handle is rejected before
/// any ceremony starts, not deep inside one with a cryptic platform error.
#[test]
fn overlong_name_is_rejected_before_any_effect_is_requested() {
    let mut sut = filled("十个汉字就超过了预算啦"); // 33 UTF-8 bytes > 27

    assert!(sut.view().name_too_long);
    assert!(!sut.view().can_submit);
    assert!(
        sut.dispatch(Event::Submit).is_empty(),
        "no operation may be requested for a name that cannot be registered"
    );
}

// ---------------------------------------------------------------------------
// Registration and the proof of signing
// ---------------------------------------------------------------------------

/// FR-006 — nothing is persisted before the passkey proves it can sign.
#[test]
fn cancelling_registration_persists_nothing() {
    let mut sut = filled("Ann");
    sut.dispatch(Event::Submit);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    let next = sut.resolve(ShellResult::PasskeyFailed {
        kind: FailureKind::Cancelled,
        message: None,
    });

    assert!(
        next.is_empty(),
        "a cancelled registration asks the shell for nothing"
    );
    let view = sut.view();
    assert_eq!(view.status, Some(StatusKey::SetupCancelled));
    assert_eq!(view.submit_label, SubmitLabel::Create);
    assert!(!view.busy);
}

/// FR-007 — the rule that keeps a cancelled verification from minting a second
/// passkey for the same wallet.
#[test]
fn cancelled_verification_resumes_at_the_signature_and_never_re_registers() {
    let mut sut = awaiting_proof("Ann");
    sut.resolve(ShellResult::PasskeyFailed {
        kind: FailureKind::Cancelled,
        message: None,
    });

    let view = sut.view();
    assert_eq!(view.status, Some(StatusKey::VerifyCancelled));
    assert_eq!(view.submit_label, SubmitLabel::FinishVerify);
    assert!(view.show_start_over, "the escape hatch is offered");
    assert!(!view.name_editable, "the name is fixed once a draft exists");

    let requested = sut.dispatch(Event::Submit);
    assert_eq!(
        requested,
        vec![ShellOperation::SignProof {
            credential_id: CRED.to_owned(),
            purpose: ProofPurpose::Verify,
        }],
        "resume signs again — it must never request RegisterPasskey"
    );
}

/// FR-006, issue #1 — a device-local credential would sign here and be invisible
/// everywhere else, so the flow stops with nothing written.
#[test]
fn non_discoverable_credential_aborts_without_persisting() {
    let mut sut = filled("Ann");
    sut.dispatch(Event::Submit);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    let next = sut.resolve(ShellResult::PasskeyFailed {
        kind: FailureKind::NotDiscoverable,
        message: None,
    });

    assert!(
        matches!(
            next.as_slice(),
            [ShellOperation::Prompt {
                kind: vela_core::app::PromptKind::NotDiscoverable,
                confirmable: false
            }]
        ),
        "the user is told to use a different provider, and nothing else happens"
    );
    assert_eq!(sut.view().submit_label, SubmitLabel::Create, "no draft kept");
}

/// FR-009 — an incompatible provider is terminal, not resumable: retrying the
/// same signature could never produce a Safe-acceptable response.
#[test]
fn incompatible_provider_discards_the_draft() {
    let mut sut = awaiting_proof("Ann");
    let next = sut.resolve(ShellResult::ProofSigned {
        assertion: support::incompatible_assertion(CRED),
        now_iso: NOW.to_owned(),
    });

    assert!(matches!(
        next.as_slice(),
        [ShellOperation::Prompt {
            kind: vela_core::app::PromptKind::IncompatibleCreate,
            ..
        }]
    ));
    let view = sut.view();
    assert_eq!(view.submit_label, SubmitLabel::Create);
    assert!(!view.show_start_over, "there is nothing left to start over");
    assert!(view.name_editable);
}

/// FR-010 — the pending record exists before the first upload, so an
/// interrupted creation is retried on a later launch.
#[test]
fn pending_record_is_written_before_the_first_upload() {
    let mut sut = awaiting_proof("Ann");
    let next = sut.resolve(ShellResult::ProofSigned {
        assertion: support::assertion(CRED),
        now_iso: NOW.to_owned(),
    });

    match next.as_slice() {
        [ShellOperation::SavePendingUpload { record }] => {
            assert_eq!(record.id, CRED);
            assert_eq!(record.public_key_hex, support::expected_public_key_hex());
            assert_eq!(record.created_at_iso, NOW);
        }
        other => panic!("expected the pending record to be written first, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// The index-sync decision table (data-model.md)
// ---------------------------------------------------------------------------

/// Row 1 — create ok, query ok, key matches ⇒ confirmed.
#[test]
fn confirmed_upload_proceeds_to_the_wallet_reference_check() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    let next = sut.resolve(confirmed_record());

    assert!(matches!(
        next.as_slice(),
        [ShellOperation::IndexQueryByWalletRef { .. }]
    ));
}

/// Row 3 — the create call failed but the server holds the right key. This is
/// the "already exists" and "write landed, response lost" case: the stored
/// record is the source of truth, so it is a success.
#[test]
fn failed_create_is_forgiven_when_the_query_confirms_the_key() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexFailed {
        message: "HTTP 500".to_owned(),
        network: false,
    });
    let next = sut.resolve(confirmed_record());

    assert!(
        matches!(
            next.as_slice(),
            [ShellOperation::IndexQueryByWalletRef { .. }]
        ),
        "a failed create must not fail the run when the key is confirmed stored"
    );
}

/// Row 2 — the server holds a *different* key. Parity with today: the attempt
/// fails and is retried, and after three attempts the user gets the retry
/// screen rather than a silently wrong wallet.
#[test]
fn a_stored_key_that_does_not_match_fails_the_attempt() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    let next = sut.resolve(ShellResult::IndexRecord {
        public_key_hex: "04deadbeef".to_owned(),
        name: "Ann".to_owned(),
    });

    assert!(
        matches!(next.as_slice(), [ShellOperation::Wait { .. }]),
        "a mismatch never proceeds to saving"
    );
}

/// Row 5 — the query could not confirm, so the attempt is unresolved and retried.
#[test]
fn a_missing_record_retries_rather_than_saving() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    let next = sut.resolve(ShellResult::IndexMissing);

    assert!(matches!(next.as_slice(), [ShellOperation::Wait { ms: 1000 }]));
}

/// FR-011 — three attempts, with the same 1s/2s backoff as today.
#[test]
fn upload_retries_exactly_three_times_with_increasing_waits() {
    let mut sut = uploading("Ann");
    let mut waits = Vec::new();

    for _ in 0..3 {
        sut.resolve(ShellResult::IndexFailed {
            message: "offline".to_owned(),
            network: true,
        });
        let next = sut.resolve(ShellResult::IndexMissing);
        match next.as_slice() {
            [ShellOperation::Wait { ms }] => {
                waits.push(*ms);
                sut.resolve(ShellResult::Waited);
            }
            [] => break,
            other => panic!("unexpected operation between attempts: {other:?}"),
        }
    }

    assert_eq!(waits, vec![1000, 2000], "1s then 2s, then no fourth attempt");
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::SyncFailed);
    assert_eq!(view.sync_error_detail.as_deref(), Some("offline"));
    assert!(!view.can_go_back, "the back arrow is hidden while sync-failed");
}

/// FR-013 — retry resumes at the upload. Re-registering would mint a second
/// passkey for a wallet that already has one.
#[test]
fn retry_upload_resumes_at_the_upload_never_at_registration() {
    let mut sut = uploading("Ann");
    for _ in 0..3 {
        sut.resolve(ShellResult::IndexFailed {
            message: "offline".to_owned(),
            network: true,
        });
        if let [ShellOperation::Wait { .. }] = sut.resolve(ShellResult::IndexMissing).as_slice() {
            sut.resolve(ShellResult::Waited);
        }
    }
    assert_eq!(sut.view().stage, CreateStage::SyncFailed);

    let requested = sut.dispatch(Event::RetryUpload);
    assert!(matches!(
        requested.as_slice(),
        [ShellOperation::IndexCreateRecord { .. }]
    ));
}

// ---------------------------------------------------------------------------
// Persistence ordering — the fund-safety invariant
// ---------------------------------------------------------------------------

/// FR-012 — the account is written only after the server confirms the key, and
/// the address is shown only after that.
#[test]
fn the_account_is_saved_only_after_the_server_confirms_and_the_address_follows() {
    let mut sut = uploading("Ann");
    assert!(sut.view().address.is_none());

    sut.resolve(ShellResult::IndexCreated);
    assert!(sut.view().address.is_none());
    sut.resolve(confirmed_record());
    assert!(sut.view().address.is_none());

    let next = sut.resolve(ShellResult::WalletRef { resolved: true });
    assert!(matches!(
        next.as_slice(),
        [ShellOperation::RemovePendingUpload { .. }]
    ));
    let next = sut.resolve(ShellResult::PendingUploadRemoved);
    assert!(next.iter().any(is_save_account));
    assert!(
        sut.view().address.is_none(),
        "not even a requested save may reveal the address"
    );

    sut.resolve(ShellResult::AccountSaved);
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::Created);
    assert!(view.address.is_some());
}

/// Issue #89 — the credential record existing is not the signal to clear the
/// pending entry; only the wallet-reference reveal is. Onboarding must not wait
/// for it either.
#[test]
fn an_unresolved_wallet_reference_keeps_the_pending_entry_and_still_completes() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    sut.resolve(confirmed_record());
    let next = sut.resolve(ShellResult::WalletRef { resolved: false });

    assert!(
        !next
            .iter()
            .any(|op| matches!(op, ShellOperation::RemovePendingUpload { .. })),
        "the pending entry must survive so a later launch retries the reveal"
    );
    assert!(next.iter().any(is_save_account), "and the wallet still opens");
}

/// The wallet-reference check is best-effort: a failing index must not block a
/// wallet whose key is already confirmed.
#[test]
fn a_failing_wallet_reference_check_does_not_block_the_wallet() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    sut.resolve(confirmed_record());
    let next = sut.resolve(ShellResult::IndexFailed {
        message: "index down".to_owned(),
        network: true,
    });

    assert!(next.iter().any(is_save_account));
}

/// FR-014 — entering the wallet is a state transition, not another ceremony.
#[test]
fn entering_the_wallet_requires_no_further_ceremony() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    sut.resolve(confirmed_record());
    sut.resolve(ShellResult::WalletRef { resolved: false });
    sut.resolve(ShellResult::AccountSaved);

    let requested = sut.dispatch(Event::EnterWallet);
    match requested.as_slice() {
        [ShellOperation::CompleteOnboarding { mode }] => {
            assert!(matches!(
                mode,
                vela_core::app::shell::CompletionMode::AddAccount { .. }
            ));
        }
        other => panic!("expected completion, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Races (FR-033)
// ---------------------------------------------------------------------------

/// A result belonging to an abandoned draft must never resurrect it. This is
/// exactly the class of bug that was unreachable in a browser test.
#[test]
fn late_upload_result_after_start_over_is_ignored() {
    let mut sut = uploading("Ann");
    sut.dispatch(Event::StartOver);

    let view = sut.view();
    assert_eq!(view.submit_label, SubmitLabel::Create);
    assert!(view.name_editable);

    // The upload that was in flight when the user gave up now comes back.
    let next = sut.resolve(ShellResult::IndexCreated);

    assert!(next.is_empty(), "the abandoned run may not request anything");
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::Form);
    assert_eq!(view.submit_label, SubmitLabel::Create);
    assert!(view.address.is_none());
}

/// FR-024 — one ceremony at a time. A double tap must not mint two passkeys.
#[test]
fn submit_while_busy_is_a_no_op() {
    let mut sut = filled("Ann");
    let first = sut.dispatch(Event::Submit);
    let second = sut.dispatch(Event::Submit);

    assert_eq!(first.len(), 1);
    assert!(second.is_empty(), "the second tap asks for nothing");
    assert!(sut.view().busy);
}

/// A draft outlives a successful creation, and `Created` is not a "busy" stage —
/// so submit must be refused by *stage*, not merely by busyness. Otherwise a
/// stray submit after the wallet exists would start a second ceremony for it.
///
/// (Found by the extraction: invisible while the rule lived inside a component
/// that simply never rendered the button in that state.)
#[test]
fn submit_after_the_wallet_exists_is_refused() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexCreated);
    sut.resolve(confirmed_record());
    sut.resolve(ShellResult::WalletRef { resolved: false });
    sut.resolve(ShellResult::AccountSaved);
    assert_eq!(sut.view().stage, CreateStage::Created);

    assert!(
        sut.dispatch(Event::Submit).is_empty(),
        "the wallet is already made; no further ceremony may start"
    );
    assert_eq!(sut.view().stage, CreateStage::Created);
}

/// The same guard on the retry button.
#[test]
fn retry_upload_is_ignored_unless_the_flow_is_sync_failed() {
    let mut sut = uploading("Ann");
    assert!(sut.dispatch(Event::RetryUpload).is_empty());
}
