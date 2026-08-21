//! Rules of wallet creation, one test per rule.
//!
//! Every one of these was previously only reachable by clicking through a
//! browser with a virtual authenticator. Each test names the rule it pins.

#![cfg(feature = "crux")]

mod support;

use support::{Driver, NOW};
use vela_core::app::create_wallet::{CreateStage, CreateWallet, Event, SubmitLabel};
use vela_core::app::shell::{ShellOperation, ShellResult};
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

/// Form → key 1 registered → the key list. The passkey's public key comes
/// from the attestation directly (no separate verification signature); the
/// set is frozen by `FinishKeys`.
fn registered(name: &str) -> Sut {
    let mut sut = filled(name);
    sut.dispatch(Event::Submit);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::registration(CRED),
        now_iso: NOW.to_owned(),
    });
    sut
}

/// …→ set frozen: the pending-record write is in flight.
fn finished(name: &str) -> Sut {
    let mut sut = registered(name);
    sut.dispatch(Event::FinishKeys);
    sut
}

/// …→ pending record written → the registry publish (one get per key) in
/// flight.
fn uploading(name: &str) -> Sut {
    let mut sut = finished(name);
    sut.resolve(ShellResult::PendingUploadSaved);
    sut
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

// The old separate "verification" signature is gone: the register member
// proof (a single get) is itself proof the passkey can sign, so a cancelled
// publish resumes via RetryUpload — see
// retry_upload_resumes_at_the_publish_never_at_registration.

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
    assert_eq!(
        sut.view().submit_label,
        SubmitLabel::Create,
        "no draft kept"
    );
}

// An incompatible provider is no longer caught by a separate verification
// signature (create mints an ES256 key by construction); an unusable key
// would fail the register member proof and land on the retry screen instead.

/// FR-010 — the pending record exists before the publish, so an interrupted
/// creation is retried.
#[test]
fn pending_record_is_written_before_the_first_upload() {
    let mut sut = filled("Ann");
    sut.dispatch(Event::Submit);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    // Registration lands on the key list; nothing is derived or persisted yet.
    let next = sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::registration(CRED),
        now_iso: NOW.to_owned(),
    });
    assert!(
        next.is_empty(),
        "registration alone persists nothing; the set is not frozen"
    );
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::AddKeys);
    assert_eq!(view.keys.len(), 1);
    assert_eq!(view.keys[0].name, "Ann");

    // Freezing the set derives and writes the pending record first.
    let next = sut.dispatch(Event::FinishKeys);
    match next.as_slice() {
        [ShellOperation::SavePendingUpload { record }] => {
            assert_eq!(record.id, CRED);
            assert_eq!(record.public_key_hex, support::expected_public_key_hex());
            assert_eq!(record.created_at_iso, NOW);
            assert_eq!(record.members.len(), 1, "one member per founding key");
            assert_eq!(record.members[0].credential_id, CRED);
        }
        other => panic!("expected the pending record to be written first, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Registry publish (option B: publish before entering)
// ---------------------------------------------------------------------------

/// The pending record written, the possession-proven publish is the next step.
#[test]
fn the_pending_record_is_followed_by_the_registry_publish() {
    let mut sut = finished("Ann");
    let next = sut.resolve(ShellResult::PendingUploadSaved);

    assert!(
        matches!(next.as_slice(), [ShellOperation::RegistryPublish { .. }]),
        "publishing runs before entry; got {next:?}"
    );
}

/// N=1 stays the historical single-key publish: one member, `key_names` is
/// exactly the wallet name.
#[test]
fn a_single_key_wallet_publishes_the_historical_payload() {
    let mut sut = finished("Ann");
    let next = sut.resolve(ShellResult::PendingUploadSaved);

    match next.as_slice() {
        [ShellOperation::RegistryPublish { members, .. }] => {
            assert_eq!(members.len(), 1);
            assert_eq!(members[0].credential_id, CRED);
            assert_eq!(
                members[0].public_key_hex,
                support::expected_public_key_hex()
            );
        }
        other => panic!("expected the publish, got {other:?}"),
    }
}

/// A published group clears the pending record, saves, and only then reveals
/// the address — the fund-safety ordering, now gated on the publish.
#[test]
fn a_published_group_removes_the_pending_saves_and_reveals_the_address() {
    let mut sut = uploading("Ann");
    assert!(sut.view().address.is_none());

    let next = sut.resolve(ShellResult::RegistryPublished);
    assert!(
        matches!(
            next.as_slice(),
            [ShellOperation::RemovePendingUpload { .. }]
        ),
        "a published group clears its pending record; got {next:?}"
    );
    assert!(sut.view().address.is_none());

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

/// A publish failure has no silent retry (it needs a signature), so it surfaces
/// the retry screen with the reason, keeping the passkey and its draft.
#[test]
fn a_failed_publish_shows_the_retry_screen() {
    let mut sut = uploading("Ann");

    let next = sut.resolve(ShellResult::IndexFailed {
        message: "offline".to_owned(),
        network: true,
    });
    assert!(next.is_empty() || next.iter().all(|op| !is_save_account(op)));

    let view = sut.view();
    assert_eq!(view.stage, CreateStage::SyncFailed);
    assert_eq!(view.sync_error_detail.as_deref(), Some("offline"));
    assert!(
        !view.can_go_back,
        "the back arrow is hidden while sync-failed"
    );
}

/// FR-013 — retry resumes at the publish. Re-registering would mint a second
/// passkey for a wallet that already has one.
#[test]
fn retry_upload_resumes_at_the_publish_never_at_registration() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::IndexFailed {
        message: "offline".to_owned(),
        network: true,
    });
    assert_eq!(sut.view().stage, CreateStage::SyncFailed);

    let requested = sut.dispatch(Event::RetryUpload);
    assert!(matches!(
        requested.as_slice(),
        [ShellOperation::RegistryPublish { .. }]
    ));
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

/// FR-014 — entering the wallet is a state transition, not another ceremony.
#[test]
fn entering_the_wallet_requires_no_further_ceremony() {
    let mut sut = uploading("Ann");
    sut.resolve(ShellResult::RegistryPublished);
    sut.resolve(ShellResult::PendingUploadRemoved);
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

    // The publish that was in flight when the user gave up now comes back.
    let next = sut.resolve(ShellResult::RegistryPublished);

    assert!(
        next.is_empty(),
        "the abandoned run may not request anything"
    );
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
    sut.resolve(ShellResult::RegistryPublished);
    sut.resolve(ShellResult::PendingUploadRemoved);
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

// ---------------------------------------------------------------------------
// Multi-key founding set
// ---------------------------------------------------------------------------

const CRED2: &str = "credential-2";

/// …→ two founding keys drafted, back at the key list.
fn two_keys(name: &str) -> Sut {
    let mut sut = registered(name);
    let next = sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
    });
    match next.as_slice() {
        [ShellOperation::RegisterPasskey {
            exclude_credential_ids,
            ..
        }] => {
            assert_eq!(
                exclude_credential_ids.as_slice(),
                [CRED.to_owned()],
                "the provider must refuse to reuse founding credentials"
            );
        }
        other => panic!("expected a second registration, got {other:?}"),
    }
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::second_registration(CRED2),
        now_iso: NOW.to_owned(),
    });
    sut
}

/// The multi-key oracle: what the FULL founding set derives to.
fn expected_multi_address() -> String {
    let keys = [
        vela_core::safe::parse_public_key(&support::expected_public_key_hex()).unwrap(),
        vela_core::safe::parse_public_key(&support::second_public_key_hex()).unwrap(),
    ];
    vela_core::safe::compute_safe_address_multi(&keys)
        .unwrap()
        .address
}

/// A two-key wallet publishes both members in founding order and derives the
/// address from the FULL set — never from keys[0] alone.
#[test]
fn a_two_key_wallet_publishes_both_members_and_the_multi_address() {
    let mut sut = two_keys("Ann");
    assert_eq!(sut.view().keys.len(), 2);
    assert_eq!(sut.view().keys[1].name, "Backup");

    let next = sut.dispatch(Event::FinishKeys);
    match next.as_slice() {
        [ShellOperation::SavePendingUpload { record }] => {
            assert_eq!(
                record.id, CRED,
                "the pending record keys off the pinned first key"
            );
            assert_eq!(record.members.len(), 2);
            assert_eq!(record.members[0].credential_id, CRED);
            assert_eq!(record.members[1].credential_id, CRED2);
            assert_eq!(record.members[1].name, "Backup");
        }
        other => panic!("expected the pending record, got {other:?}"),
    }

    let next = sut.resolve(ShellResult::PendingUploadSaved);
    match next.as_slice() {
        [ShellOperation::RegistryPublish { members, .. }] => {
            assert_eq!(members.len(), 2, "one possession proof per founding key");
            assert_eq!(members[0].credential_id, CRED);
            assert_eq!(members[1].credential_id, CRED2);
        }
        other => panic!("expected the publish, got {other:?}"),
    }

    sut.resolve(ShellResult::RegistryPublished);
    let requested = sut.resolve(ShellResult::PendingUploadRemoved);
    match requested
        .iter()
        .find(|op| matches!(op, ShellOperation::SaveAccount { .. }))
    {
        Some(ShellOperation::SaveAccount { account }) => {
            assert_eq!(account.address, expected_multi_address());
            assert_eq!(account.keys.len(), 2);
            assert_eq!(account.id, CRED);
            assert_eq!(account.public_key_hex, support::expected_public_key_hex());
        }
        other => panic!("expected the account save, got {other:?}"),
    }
}

/// Cancelling an ADDED key's ceremony keeps the existing drafts — the minted
/// passkeys are real; only StartOver abandons them.
#[test]
fn cancelling_an_added_key_keeps_the_existing_drafts() {
    let mut sut = registered("Ann");
    sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
    });
    let next = sut.resolve(ShellResult::PasskeyFailed {
        kind: FailureKind::Cancelled,
        message: None,
    });
    assert!(next.is_empty());

    let view = sut.view();
    assert_eq!(view.stage, CreateStage::AddKeys);
    assert_eq!(view.keys.len(), 1, "key 1 survives the cancelled add");
    assert_eq!(view.status, Some(StatusKey::SetupCancelled));
}

/// A drafted extra key can be removed; the pinned first key cannot.
#[test]
fn remove_key_drops_extras_but_never_the_first() {
    let mut sut = two_keys("Ann");
    assert!(sut.dispatch(Event::RemoveKey { index: 0 }).is_empty());
    assert_eq!(sut.view().keys.len(), 2, "index 0 is not removable");

    sut.dispatch(Event::RemoveKey { index: 1 });
    assert_eq!(sut.view().keys.len(), 1);

    // The set still freezes fine as a single key afterwards.
    let next = sut.dispatch(Event::FinishKeys);
    assert!(matches!(
        next.as_slice(),
        [ShellOperation::SavePendingUpload { .. }]
    ));
}

/// A publish failure on a multi-key set keeps every draft and retries the
/// FULL publish — all member proofs run again.
#[test]
fn a_failed_multi_publish_retries_every_member() {
    let mut sut = two_keys("Ann");
    sut.dispatch(Event::FinishKeys);
    sut.resolve(ShellResult::PendingUploadSaved);
    sut.resolve(ShellResult::IndexFailed {
        message: "offline".to_owned(),
        network: true,
    });
    assert_eq!(sut.view().stage, CreateStage::SyncFailed);

    let requested = sut.dispatch(Event::RetryUpload);
    match requested.as_slice() {
        [ShellOperation::RegistryPublish { members, .. }] => {
            assert_eq!(members.len(), 2);
        }
        other => panic!("expected the full republish, got {other:?}"),
    }
}
