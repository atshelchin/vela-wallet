//! Rules of wallet creation, one test per rule.
//!
//! Every one of these was previously only reachable by clicking through a
//! browser with a virtual authenticator. Each test names the rule it pins.

#![cfg(feature = "crux")]

mod support;

use support::{Driver, NOW};
use vela_core::app::create_wallet::{CreateStage, CreateWallet, Event, SubmitLabel, ACK_COUNT};
use vela_core::app::shell::{ShellOperation, ShellResult};
use vela_core::app::{FailureKind, KeyMethod, StatusKey};

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
    for index in 0..ACK_COUNT {
        sut.dispatch(Event::AckToggled { index });
    }
    sut
}

const GROUP_SEED: &str = "5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed";
const GROUP_KEY: &str = "04feedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed\
feedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed01";

fn group_key_generated() -> ShellResult {
    ShellResult::GroupKeyGenerated {
        seed_hex: GROUP_SEED.to_owned(),
        group_public_key_hex: GROUP_KEY.to_owned(),
    }
}

/// Form → group key minted → key 1 registered AND its membership confirmed
/// (interleaved: one create + one get per key) → the key list. The set is
/// frozen by `FinishKeys`, after which the publish needs NO prompts.
fn registered(name: &str) -> Sut {
    let mut sut = filled(name);
    sut.dispatch(Event::Submit);
    let next = sut.resolve(ShellResult::PasskeySupport { supported: true });
    assert!(
        matches!(next.as_slice(), [ShellOperation::GenerateGroupKey]),
        "the group key anchors every member proof, so it is minted first; got {next:?}"
    );
    let next = sut.resolve(group_key_generated());
    assert!(matches!(
        next.as_slice(),
        [ShellOperation::RegisterPasskey { .. }]
    ));
    let next = sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::registration(CRED),
        now_iso: NOW.to_owned(),
    });
    match next.as_slice() {
        [ShellOperation::SignMemberProof {
            credential_id,
            group_public_key_hex,
            ..
        }] => {
            assert_eq!(credential_id, CRED);
            assert_eq!(group_public_key_hex, GROUP_KEY);
        }
        other => panic!("registration flows straight into its membership get; got {other:?}"),
    }
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k1"),
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
    for index in 0..ACK_COUNT - 1 {
        sut.dispatch(Event::AckToggled { index });
    }
    assert!(
        !sut.view().can_submit,
        "all but one box ticked must not pass"
    );

    sut.dispatch(Event::AckToggled {
        index: ACK_COUNT - 1,
    });
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
    sut.resolve(group_key_generated());
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
    sut.resolve(group_key_generated());
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
    let mut sut = registered("Ann");
    // Registration + confirmation land on the key list; nothing is derived
    // or persisted yet.
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::AddKeys);
    assert_eq!(view.keys.len(), 1);
    assert_eq!(view.keys[0].name, "Ann");
    assert!(view.keys[0].confirmed, "the interleaved get already ran");

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

/// …→ two founding keys drafted AND confirmed, back at the key list.
fn two_keys(name: &str) -> Sut {
    let mut sut = registered(name);
    let next = sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
        method: KeyMethod::SecurityKey,
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
    let next = sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::second_registration(CRED2),
        now_iso: NOW.to_owned(),
    });
    assert!(
        matches!(next.as_slice(), [ShellOperation::SignMemberProof { .. }]),
        "each key confirms while its authenticator is in hand; got {next:?}"
    );
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k2"),
    });
    sut
}

/// The add method is the person's choice, and it has to survive the round trip
/// through the shell — the ceremony is selected from it, and the key row is
/// labelled by it. A method that arrives at the shell as `Platform` when the
/// person asked for a security key runs the wrong ceremony.
#[test]
fn the_chosen_add_method_reaches_the_shell_and_the_key_row() {
    let mut sut = registered("Ann");

    let next = sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
        method: KeyMethod::SecurityKey,
    });
    match next.as_slice() {
        [ShellOperation::RegisterPasskey { method, .. }] => {
            assert_eq!(
                *method,
                KeyMethod::SecurityKey,
                "the ceremony must be selected from what the person chose"
            );
        }
        other => panic!("expected a registration, got {other:?}"),
    }

    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::second_registration(CRED2),
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k2"),
    });

    let keys = sut.view().keys;
    assert_eq!(keys.len(), 2);
    assert_eq!(
        keys[0].method,
        KeyMethod::Platform,
        "the first key is the one the shell chooses, and it defaults to the platform"
    );
    assert_eq!(
        keys[1].method,
        KeyMethod::SecurityKey,
        "the row must be labelled by the choice, not by what the authenticator reported"
    );
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
        method: KeyMethod::SecurityKey,
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

// ---------------------------------------------------------------------------
// Interleaved confirmation (create → sign, per key)
// ---------------------------------------------------------------------------

/// A cancelled membership get leaves the key DRAFTED but unconfirmed: its row
/// offers a retry, and the set cannot be frozen until every key confirmed.
#[test]
fn a_cancelled_confirmation_gates_finish_and_retries_per_row() {
    let mut sut = registered("Ann");
    sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
        method: KeyMethod::SecurityKey,
    });
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::second_registration(CRED2),
        now_iso: NOW.to_owned(),
    });
    // The membership get for key 2 is cancelled.
    let next = sut.resolve(ShellResult::PasskeyFailed {
        kind: FailureKind::Cancelled,
        message: None,
    });
    assert!(next.is_empty());
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::AddKeys);
    assert_eq!(view.keys.len(), 2, "the minted passkey stays drafted");
    assert!(view.keys[0].confirmed);
    assert!(!view.keys[1].confirmed);
    assert!(!view.can_finish, "an unconfirmed key must gate the freeze");
    assert!(
        sut.dispatch(Event::FinishKeys).is_empty(),
        "freezing with an unconfirmed key is refused"
    );

    // The row's own retry re-runs exactly that key's confirmation.
    let next = sut.dispatch(Event::ConfirmKey { index: 1 });
    match next.as_slice() {
        [ShellOperation::SignMemberProof { credential_id, .. }] => {
            assert_eq!(credential_id, CRED2);
        }
        other => panic!("expected the per-key confirmation retry, got {other:?}"),
    }
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k2-retry"),
    });
    let view = sut.view();
    assert!(view.keys[1].confirmed);
    assert!(view.can_finish);
}

/// Confirming an already-confirmed key is a no-op — no wasted prompt.
#[test]
fn confirming_a_confirmed_key_asks_for_nothing() {
    let mut sut = registered("Ann");
    assert!(sut.dispatch(Event::ConfirmKey { index: 0 }).is_empty());
}

/// A duplicate authenticator (same credential material behind a new id) is
/// refused THE MOMENT it registers — not at FinishKeys.
#[test]
fn a_duplicate_founding_key_is_refused_at_registration() {
    let mut sut = registered("Ann");
    sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
        method: KeyMethod::SecurityKey,
    });
    // The provider returns the SAME public key under a different credential.
    let next = sut.resolve(ShellResult::PasskeyRegistered {
        registration: vela_core::app::Registration {
            credential_id: CRED2.to_owned(),
            ..support::registration(CRED)
        },
        now_iso: NOW.to_owned(),
    });
    assert!(
        matches!(
            next.as_slice(),
            [ShellOperation::Prompt {
                kind: vela_core::app::PromptKind::CreateFailed { .. },
                ..
            }]
        ),
        "a duplicate key is refused immediately; got {next:?}"
    );
    let view = sut.view();
    assert_eq!(view.keys.len(), 1, "the duplicate was never drafted");
    assert_eq!(view.stage, CreateStage::AddKeys);
}

/// StartOver abandons the group key too: the next run gets a fresh one, so a
/// stale seed can never anchor a new wallet's proofs.
#[test]
fn start_over_mints_a_fresh_group_key() {
    let mut sut = registered("Ann");
    sut.dispatch(Event::StartOver);
    // Name and acks survive StartOver; only the drafts and group key reset.
    sut.dispatch(Event::Submit);
    let next = sut.resolve(ShellResult::PasskeySupport { supported: true });
    assert!(
        matches!(next.as_slice(), [ShellOperation::GenerateGroupKey]),
        "a fresh run mints a fresh group key; got {next:?}"
    );
}

// ---------------------------------------------------------------------------
// Second-key gate (a device-bound sole key must not become a wallet alone)
// ---------------------------------------------------------------------------

/// Register key 1 as a DEVICE-BOUND credential (no BE/BS) and confirm it.
fn device_bound_registered(name: &str) -> Sut {
    let mut sut = filled(name);
    sut.dispatch(Event::Submit);
    sut.resolve(ShellResult::PasskeySupport { supported: true });
    sut.resolve(group_key_generated());
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::device_bound_registration(CRED),
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k1"),
    });
    sut
}

/// A sole device-bound key is one lost device from an unrecoverable wallet:
/// the freeze is refused and the view says a second key is needed.
#[test]
fn a_sole_device_bound_key_cannot_finish_alone() {
    let mut sut = device_bound_registered("Ann");
    let view = sut.view();
    assert_eq!(view.stage, CreateStage::AddKeys);
    assert!(view.keys[0].confirmed);
    assert!(!view.keys[0].synced, "flags 0x45 carries no BS bit");
    assert!(view.needs_second_key);
    assert!(!view.can_finish);
    assert!(
        sut.dispatch(Event::FinishKeys).is_empty(),
        "freezing a sole unsynced key is refused"
    );
}

/// Adding ANY second key — even another device-bound one — breaks the single
/// point of failure and unlocks the freeze.
#[test]
fn a_second_key_satisfies_the_device_bound_gate() {
    let mut sut = device_bound_registered("Ann");
    sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
        method: KeyMethod::SecurityKey,
    });
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::second_registration(CRED2),
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k2"),
    });
    let view = sut.view();
    assert!(!view.needs_second_key);
    assert!(view.can_finish);
    assert!(matches!(
        sut.dispatch(Event::FinishKeys).as_slice(),
        [ShellOperation::SavePendingUpload { .. }]
    ));
}

/// …and removing back down to the sole device-bound key re-arms the gate.
#[test]
fn removing_back_to_a_sole_device_bound_key_rearms_the_gate() {
    let mut sut = device_bound_registered("Ann");
    sut.dispatch(Event::AddKey {
        name: "Backup".to_owned(),
        method: KeyMethod::SecurityKey,
    });
    sut.resolve(ShellResult::PasskeyRegistered {
        registration: support::second_registration(CRED2),
        now_iso: NOW.to_owned(),
    });
    sut.resolve(ShellResult::MemberProofSigned {
        proof: support::member_proof("k2"),
    });
    sut.dispatch(Event::RemoveKey { index: 1 });
    let view = sut.view();
    assert!(view.needs_second_key);
    assert!(!view.can_finish);
}

/// A SYNCED sole key is the common happy path and is never gated; the row
/// also carries the sync signal for the UI badge.
#[test]
fn a_synced_sole_key_finishes_alone() {
    let sut = registered("Ann");
    let view = sut.view();
    assert!(
        view.keys[0].synced,
        "the default fixture is a synced passkey"
    );
    assert!(!view.needs_second_key);
    assert!(view.can_finish);
}
