//! Rules of the address book, one test per rule.
//!
//! Ports the jest vectors from `src/__tests__/services/contacts.test.ts` and
//! `contact-io.test.ts` (the import half — file parsing stays in the shell),
//! plus the trust/risk semantics from `RecipientTrust.tsx` and
//! `recipient-risk.ts`. The TS `_writeChain` write lock and the implicit
//! `clearContactsCache()` have no equivalents here: the core is
//! single-threaded and the account switch is an explicit event.

#![cfg(feature = "crux")]

mod support;

use support::DomainDriver;
use vela_core::app::contacts::{
    contact_display_name, is_address, matches_query, sort_contacts, Contact, ContactGroup,
    ContactGroupInput, ContactHistoryTx, ContactIdentity, ContactImportEntry, ContactImportGroup,
    ContactImportReport, ContactKind, ContactOperation as Op, ContactSaveInput,
    ContactShellResult as Res, ContactSource, ContactTombstone, ContactTxKind, Contacts,
    ContactsView,
};

type Sut = DomainDriver<Contacts>;

const A: &str = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B: &str = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C: &str = "0xcccccccccccccccccccccccccccccccccccccccc";
const ME: &str = "0x1111111111111111111111111111111111111111";
const ZERO: &str = "0x0000000000000000000000000000000000000000";

#[test]
fn fixture_addresses_are_well_formed() {
    for addr in [A, B, C, ME, ZERO] {
        assert!(is_address(addr), "bad fixture: {addr}");
    }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

fn tx(kind: Option<ContactTxKind>, to: &str, ts: f64) -> ContactHistoryTx {
    ContactHistoryTx {
        kind,
        to: Some(to.to_owned()),
        to_name: None,
        timestamp_ms: Some(ts),
    }
}

fn send(to: &str, ts: f64) -> ContactHistoryTx {
    tx(Some(ContactTxKind::Send), to, ts)
}

fn named_send(to: &str, ts: f64, name: &str) -> ContactHistoryTx {
    ContactHistoryTx {
        to_name: Some(name.to_owned()),
        ..send(to, ts)
    }
}

fn manual(address: &str, name: Option<&str>, favorite: bool, last_used: f64) -> Contact {
    Contact {
        address: address.to_owned(),
        name: name.map(str::to_owned),
        resolved_name: None,
        resolved_source: None,
        kind: ContactKind::Unknown,
        favorite,
        note: None,
        tx_count: 0,
        last_used_ms: last_used,
        first_seen_ms: last_used,
        source: ContactSource::Manual,
    }
}

fn group(id: &str, name: &str, members: &[&str]) -> ContactGroup {
    ContactGroup {
        id: id.to_owned(),
        name: name.to_owned(),
        color: None,
        members: members.iter().map(|m| (*m).to_owned()).collect(),
    }
}

fn save_input(address: &str, name: Option<&str>) -> ContactSaveInput {
    ContactSaveInput {
        address: address.to_owned(),
        name: name.map(str::to_owned),
        note: None,
        favorite: None,
        kind: None,
        resolved_name: None,
        resolved_source: None,
    }
}

fn gin(id: Option<&str>, name: &str, members: Option<&[&str]>) -> ContactGroupInput {
    ContactGroupInput {
        id: id.map(str::to_owned),
        name: name.to_owned(),
        color: None,
        members: members.map(|m| m.iter().map(|a| (*a).to_owned()).collect()),
    }
}

fn entry(address: &str, name: Option<&str>) -> ContactImportEntry {
    ContactImportEntry {
        address: address.to_owned(),
        name: name.map(str::to_owned),
        note: None,
        favorite: None,
    }
}

fn identity(name: &str, source: &str) -> ContactIdentity {
    ContactIdentity {
        name: name.to_owned(),
        source: source.to_owned(),
    }
}

use vela_core::app::contacts::Event;

/// Boot a session for `ME` and land the given store + history.
fn booted(
    saved: Vec<Contact>,
    tombstones: Vec<ContactTombstone>,
    groups: Vec<ContactGroup>,
    history: Vec<ContactHistoryTx>,
) -> Sut {
    let mut sut = Sut::new();
    let ops = sut.dispatch(Event::AccountSwitched {
        my_address: Some(ME.to_owned()),
    });
    assert_eq!(ops, vec![Op::ReadStore, Op::LoadSendHistory]);
    let ops = sut.resolve(Res::StoreLoaded {
        contacts: saved,
        tombstones,
        groups,
    });
    assert!(ops.is_empty());
    let ops = sut.resolve(Res::HistoryLoaded { txs: history });
    assert!(ops.is_empty());
    sut
}

fn booted_empty() -> Sut {
    booted(vec![], vec![], vec![], vec![])
}

/// Acknowledge `count` best-effort writes (they never change state).
fn ack_writes(sut: &mut Sut, count: usize) {
    for _ in 0..count {
        let ops = sut.resolve(Res::Written);
        assert!(ops.is_empty(), "a write ack must not trigger new work");
    }
}

fn addresses(view: &ContactsView) -> Vec<String> {
    view.contacts.iter().map(|c| c.address.clone()).collect()
}

fn find<'v>(view: &'v ContactsView, addr: &str) -> &'v Contact {
    view.contacts
        .iter()
        .find(|c| c.address == addr)
        .unwrap_or_else(|| panic!("contact {addr} not in view"))
}

// ---------------------------------------------------------------------------
// Boot & session boundaries
// ---------------------------------------------------------------------------

/// Session start reads all three stores and the send history, and nothing
/// renders as loaded until the store answers.
#[test]
fn boot_reads_stores_and_history() {
    let mut sut = Sut::new();
    let ops = sut.dispatch(Event::AccountSwitched {
        my_address: Some(ME.to_owned()),
    });
    assert_eq!(ops, vec![Op::ReadStore, Op::LoadSendHistory]);
    assert!(!sut.view().loaded);

    sut.resolve(Res::StoreLoaded {
        contacts: vec![manual(A, Some("Alice"), false, 1_000.0)],
        tombstones: vec![],
        groups: vec![],
    });
    assert!(sut.view().loaded);
    assert_eq!(addresses(&sut.view()), vec![A.to_owned()]);
}

/// The TS equivalent was every mutator `await`ing its lazy load; here a
/// mutation before the store answered is dropped, never applied to an
/// unloaded book.
#[test]
fn mutations_before_load_are_dropped() {
    let mut sut = Sut::new();
    assert!(sut
        .dispatch(Event::Save {
            input: save_input(A, Some("Alice")),
            now_ms: 1_000.0,
        })
        .is_empty());
    assert!(sut
        .dispatch(Event::GroupSave {
            input: gin(None, "Team", None),
        })
        .is_empty());

    // Mid-boot (store still in flight) is equally unloaded.
    sut.dispatch(Event::AccountSwitched {
        my_address: Some(ME.to_owned()),
    });
    assert!(sut
        .dispatch(Event::Delete {
            address: A.to_owned(),
            now_ms: 1_000.0,
        })
        .is_empty());
    assert!(!sut.view().loaded);
    assert!(sut.view().contacts.is_empty());
}

/// Integration note: a previous account's read landing after a switch is
/// dropped — that IS the "books never cross accounts" rule.
#[test]
fn stale_results_from_a_previous_account_are_dropped() {
    let mut sut = Sut::new();
    sut.dispatch(Event::AccountSwitched {
        my_address: Some(ME.to_owned()),
    });
    sut.dispatch(Event::AccountSwitched {
        my_address: Some(B.to_owned()),
    });

    // The FIRST session's store + history answer late — both stale.
    let ops = sut.resolve(Res::StoreLoaded {
        contacts: vec![manual(A, Some("Old Book Alice"), false, 1_000.0)],
        tombstones: vec![],
        groups: vec![],
    });
    assert!(ops.is_empty());
    assert!(
        !sut.view().loaded,
        "a stale store read must not load the book"
    );
    sut.resolve(Res::HistoryLoaded {
        txs: vec![send(A, 100.0)],
    });
    assert!(sut.view().contacts.is_empty());

    // The CURRENT session's answers land normally.
    sut.resolve(Res::StoreLoaded {
        contacts: vec![],
        tombstones: vec![],
        groups: vec![],
    });
    assert!(sut.view().loaded);
    sut.resolve(Res::HistoryLoaded { txs: vec![] });
    assert!(sut.view().contacts.is_empty());
}

/// The event-driven replacement for `clearContactsCache()`: switching wipes
/// the ledger AND the identity/classification caches, so nothing from the
/// previous account can feed the new book.
#[test]
fn account_switch_clears_ledger_and_caches() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    assert_eq!(ops.len(), 2);
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: Some("0x".to_owned()),
    });
    sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: Some(identity("alice.eth", "ENS")),
    });
    // Cached: a repeat inspect asks for nothing.
    assert!(sut
        .dispatch(Event::InspectRecipient {
            chain_id: 1,
            address: A.to_owned(),
        })
        .is_empty());

    let ops = sut.dispatch(Event::AccountSwitched {
        my_address: Some(B.to_owned()),
    });
    assert_eq!(ops, vec![Op::ReadStore, Op::LoadSendHistory]);
    assert!(
        sut.view().recipient.is_none(),
        "the inspected recipient does not survive a switch"
    );
    sut.resolve(Res::StoreLoaded {
        contacts: vec![],
        tombstones: vec![],
        groups: vec![],
    });
    sut.resolve(Res::HistoryLoaded { txs: vec![] });

    // Caches are gone: the same recipient is looked up afresh.
    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    assert_eq!(
        ops,
        vec![
            Op::ClassifyRecipient {
                chain_id: 1,
                address: A.to_owned(),
            },
            Op::ResolveIdentity {
                address: A.to_owned(),
            },
        ]
    );
}

/// contacts.ts:286-290 — `loadTransactions` throwing yields no suggestions.
#[test]
fn history_failure_yields_no_suggestions() {
    let mut sut = booted(vec![], vec![], vec![], vec![send(A, 100.0)]);
    assert_eq!(addresses(&sut.view()), vec![A.to_owned()]);

    let ops = sut.dispatch(Event::HistoryChanged);
    assert_eq!(ops, vec![Op::LoadSendHistory]);
    sut.resolve(Res::HistoryFailed);
    assert!(sut.view().contacts.is_empty());
}

// ---------------------------------------------------------------------------
// Derivation from send history — invariant ①
// ---------------------------------------------------------------------------

/// Invariant ① — only `type: 'send'` rows suggest. dApp contract calls,
/// receives and legacy untyped rows never pollute the trust signal.
#[test]
fn only_send_txs_become_suggestions_never_dapp_calls() {
    let sut = booted(
        vec![],
        vec![],
        vec![],
        vec![
            send(A, 100.0),
            tx(Some(ContactTxKind::DappTx), B, 200.0),
            tx(Some(ContactTxKind::Receive), ME, 300.0),
            tx(None, C, 400.0), // legacy untyped — never a suggestion
        ],
    );
    let view = sut.view();
    assert_eq!(addresses(&view), vec![A.to_owned()]);
    assert_eq!(view.contacts[0].source, ContactSource::Auto);
    assert_eq!(view.contacts[0].tx_count, 1);
}

#[test]
fn derivation_dedupes_counts_and_tracks_recency() {
    let sut = booted(
        vec![],
        vec![],
        vec![],
        vec![send(A, 100.0), send(A, 300.0), send(A, 200.0)],
    );
    let view = sut.view();
    assert_eq!(view.contacts.len(), 1);
    let a = &view.contacts[0];
    assert_eq!(a.tx_count, 3);
    assert_eq!(a.last_used_ms, 300.0);
    assert_eq!(a.first_seen_ms, 100.0);
}

#[test]
fn derivation_skips_self_and_malformed_recipients() {
    let sut = booted(
        vec![],
        vec![],
        vec![],
        vec![
            send(ME, 100.0),
            send("0x123", 150.0),
            send(A, 200.0),
            ContactHistoryTx {
                kind: Some(ContactTxKind::Send),
                to: None,
                to_name: None,
                timestamp_ms: Some(250.0),
            },
        ],
    );
    assert_eq!(addresses(&sut.view()), vec![A.to_owned()]);
}

#[test]
fn derivation_carries_to_name_as_resolved_name() {
    let sut = booted(
        vec![],
        vec![],
        vec![],
        vec![named_send(A, 100.0, "vitalik.eth")],
    );
    assert_eq!(
        sut.view().contacts[0].resolved_name.as_deref(),
        Some("vitalik.eth")
    );
}

// ---------------------------------------------------------------------------
// Merge of saved ⊕ history
// ---------------------------------------------------------------------------

/// Saved entries win on identity/name; recency and count refresh from history
/// so a saved contact still sorts by recent use.
#[test]
fn saved_wins_name_recency_refreshed_from_history() {
    let sut = booted(
        vec![manual(A, Some("Alice"), false, 1_000.0)],
        vec![],
        vec![],
        vec![send(A, 2_000.0), send(A, 1_500.0)],
    );
    let view = sut.view();
    assert_eq!(view.contacts.len(), 1);
    let a = &view.contacts[0];
    assert_eq!(a.name.as_deref(), Some("Alice"));
    assert_eq!(a.source, ContactSource::Manual);
    assert_eq!(a.tx_count, 2);
    assert_eq!(a.last_used_ms, 2_000.0);
}

#[test]
fn saved_only_contact_still_appears() {
    let sut = booted(
        vec![manual(B, Some("Bob"), false, 1_000.0)],
        vec![],
        vec![],
        vec![send(A, 100.0)],
    );
    let mut got = addresses(&sut.view());
    got.sort();
    assert_eq!(got, vec![A.to_owned(), B.to_owned()]);
}

// ---------------------------------------------------------------------------
// Delete tombstones — invariant ②
// ---------------------------------------------------------------------------

/// Invariant ② — regression from TS: a deleted contact with send history used
/// to re-appear as an `auto` suggestion. The tombstone buries it for good.
#[test]
fn deleted_recipient_never_resurrects_without_new_interaction() {
    let mut sut = booted(
        vec![manual(A, Some("Alice"), true, 900.0)],
        vec![],
        vec![],
        vec![send(A, 500.0)],
    );
    assert_eq!(addresses(&sut.view()), vec![A.to_owned()]);

    let ops = sut.dispatch(Event::Delete {
        address: A.to_owned(),
        now_ms: 1_000.0,
    });
    assert_eq!(ops.len(), 2, "contacts + tombstones both persist");
    assert!(matches!(&ops[0], Op::WriteContacts { contacts } if contacts.is_empty()));
    assert!(matches!(&ops[1], Op::WriteDismissed { tombstones }
            if tombstones.len() == 1 && tombstones[0].address == A && tombstones[0].dismissed_at_ms == 1_000.0));
    ack_writes(&mut sut, 2);
    assert!(
        sut.view().contacts.is_empty(),
        "the send at 500 <= dismissal at 1000 stays buried"
    );
}

/// A send AFTER the deletion lifts the tombstone: `lastUsed > dismissedAt`.
#[test]
fn a_send_after_deletion_resurfaces_the_recipient() {
    let mut sut = booted(vec![], vec![], vec![], vec![send(A, 500.0)]);
    let ops = sut.dispatch(Event::Delete {
        address: A.to_owned(),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());
    assert!(sut.view().contacts.is_empty());

    sut.dispatch(Event::HistoryChanged);
    sut.resolve(Res::HistoryLoaded {
        txs: vec![send(A, 500.0), send(A, 2_000.0)],
    });
    let view = sut.view();
    assert_eq!(addresses(&view), vec![A.to_owned()]);
    assert_eq!(view.contacts[0].tx_count, 2);
}

/// Invariant ② second half — re-saving clears the tombstone (and persists the
/// cleared tombstone set).
#[test]
fn resaving_a_deleted_address_clears_the_tombstone() {
    let mut sut = booted(vec![], vec![], vec![], vec![send(A, 500.0)]);
    let ops = sut.dispatch(Event::Delete {
        address: A.to_owned(),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());
    assert!(sut.view().contacts.is_empty());

    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 2_000.0,
    });
    assert_eq!(ops.len(), 2);
    assert!(matches!(&ops[0], Op::WriteContacts { .. }));
    assert_eq!(
        ops[1],
        Op::WriteDismissed { tombstones: vec![] },
        "the tombstone is gone from the persisted set"
    );
    ack_writes(&mut sut, 2);

    let view = sut.view();
    let a = find(&view, A);
    assert_eq!(a.name.as_deref(), Some("Alice"));
    assert_eq!(a.source, ContactSource::Manual);
}

// ---------------------------------------------------------------------------
// Saved CRUD
// ---------------------------------------------------------------------------

/// contacts.ts:183-209 — keyed on the lowercased address; a second save
/// merges instead of duplicating.
#[test]
fn save_is_idempotent_on_lowercased_address() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(&A.to_uppercase().replace("0X", "0x"), Some("Alice")),
        now_ms: 1_000.0,
    });
    assert_eq!(
        ops.len(),
        1,
        "no tombstone to clear, only the contacts write"
    );
    ack_writes(&mut sut, 1);
    let view = sut.view();
    assert_eq!(addresses(&view), vec![A.to_owned()]);
    assert_eq!(view.contacts[0].source, ContactSource::Manual);

    let ops = sut.dispatch(Event::Save {
        input: ContactSaveInput {
            note: Some("hi".to_owned()),
            ..save_input(A, Some("Alice 2"))
        },
        now_ms: 5_000.0,
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    assert_eq!(view.contacts.len(), 1, "still one — keyed by address");
    let a = &view.contacts[0];
    assert_eq!(a.name.as_deref(), Some("Alice 2"));
    assert_eq!(a.note.as_deref(), Some("hi"));
    assert_eq!(a.first_seen_ms, 1_000.0, "merge keeps the original stamps");
}

/// contacts.ts:238-245 — a saved contact flips in place; an unsaved
/// suggestion is promoted to a starred saved contact.
#[test]
fn toggle_favorite_flips_saved_and_promotes_suggestion() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::ToggleFavorite {
        address: A.to_owned(),
        now_ms: 2_000.0,
    });
    assert_eq!(ops.len(), 1);
    ack_writes(&mut sut, 1);
    assert!(find(&sut.view(), A).favorite);

    // B was never saved → promoted via the full save path.
    let ops = sut.dispatch(Event::ToggleFavorite {
        address: B.to_owned(),
        now_ms: 3_000.0,
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    let b = find(&view, B);
    assert!(b.favorite);
    assert_eq!(b.source, ContactSource::Manual);
}

/// The single-threaded core replaces `_writeChain`: every write carries the
/// whole ledger, so back-to-back mutations can never drop each other.
#[test]
fn sequential_saves_never_lose_each_others_writes() {
    let mut sut = booted_empty();
    sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 1_000.0,
    });
    // The second save fires BEFORE the first write is acknowledged.
    let ops = sut.dispatch(Event::Save {
        input: save_input(B, Some("Bob")),
        now_ms: 2_000.0,
    });
    let Op::WriteContacts { contacts } = &ops[0] else {
        panic!("expected a contacts write");
    };
    let mut got: Vec<&str> = contacts.iter().map(|c| c.address.as_str()).collect();
    got.sort();
    assert_eq!(got, vec![A, B], "the second write carries both contacts");
}

// ---------------------------------------------------------------------------
// Groups — invariants ③ and ⑥
// ---------------------------------------------------------------------------

/// Invariant ③ — members are lowercased, invalid dropped, first-wins deduped.
#[test]
fn group_members_are_normalized_lowercased_deduped_valid_only() {
    let mut sut = booted_empty();
    let upper = A.to_uppercase().replace("0X", "0x");
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Payroll", Some(&[&upper, A, B, "0xnope"])),
    });
    assert_eq!(ops.len(), 1);
    assert!(matches!(&ops[0], Op::WriteGroups { .. }));
    ack_writes(&mut sut, 1);

    let view = sut.view();
    assert_eq!(view.groups.len(), 1);
    assert_eq!(view.groups[0].id, "grp_1");
    assert_eq!(view.groups[0].name, "Payroll");
    let members: Vec<&str> = view.groups[0]
        .members
        .iter()
        .map(|c| c.address.as_str())
        .collect();
    assert_eq!(
        members,
        vec![A, B],
        "upper-cased dup dropped, invalid dropped"
    );
}

/// Invariant ⑥ — ids derive from the max persisted suffix, never a clock or a
/// process counter, so a cold reload can't mint a colliding id.
#[test]
fn group_ids_are_deterministic_and_never_collide_across_cold_reload() {
    // The store already holds grp_9 plus ids a counter would misread.
    let mut sut = booted(
        vec![],
        vec![],
        vec![
            group("grp_9", "Nine", &[]),
            group("custom", "X", &[]), // parseInt('custom') → NaN, ignored
            group("grp_3x", "Y", &[]), // parseInt('3x') → 3
        ],
        vec![],
    );
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Ten", None),
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    assert_eq!(view.groups.len(), 4);
    assert_eq!(view.groups[3].id, "grp_10");
}

/// contacts.ts:337-360 — updating keeps the id; a blank rename keeps the old
/// name; omitting members leaves the membership untouched.
#[test]
fn group_update_in_place_keeps_id_blank_rename_keeps_name() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Team", Some(&[A])),
    });
    ack_writes(&mut sut, ops.len());

    // Blank rename + no members: nothing changes but the write still lands.
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(Some("grp_1"), "   ", None),
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    assert_eq!(view.groups[0].name, "Team");
    assert_eq!(view.groups[0].members.len(), 1);

    let ops = sut.dispatch(Event::GroupSave {
        input: gin(Some("grp_1"), "Team Renamed", Some(&[B, C])),
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    assert_eq!(view.groups.len(), 1, "updated in place, not duplicated");
    assert_eq!(view.groups[0].id, "grp_1");
    assert_eq!(view.groups[0].name, "Team Renamed");
    let members: Vec<&str> = view.groups[0]
        .members
        .iter()
        .map(|c| c.address.as_str())
        .collect();
    assert_eq!(members, vec![B, C]);
}

#[test]
fn set_group_members_replaces_whole_list() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Team", Some(&[A])),
    });
    ack_writes(&mut sut, ops.len());
    let ops = sut.dispatch(Event::SetGroupMembers {
        id: "grp_1".to_owned(),
        members: vec![C.to_owned(), B.to_owned(), C.to_owned()],
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    let members: Vec<&str> = view.groups[0]
        .members
        .iter()
        .map(|c| c.address.as_str())
        .collect();
    assert_eq!(members, vec![C, B], "replaced, normalized, first-wins");
}

/// contacts.ts:362-366 — deleting a group never touches the contacts.
#[test]
fn group_delete_never_touches_contacts() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Team", Some(&[A])),
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::GroupDelete {
        id: "grp_1".to_owned(),
    });
    assert_eq!(ops.len(), 1);
    assert!(matches!(&ops[0], Op::WriteGroups { groups } if groups.is_empty()));
    ack_writes(&mut sut, 1);
    let view = sut.view();
    assert!(view.groups.is_empty());
    assert_eq!(find(&view, A).name.as_deref(), Some("Alice"));
}

/// Invariant ③ — deleting a contact cascades it out of every group; groups
/// are only written when one actually held the address.
#[test]
fn deleting_a_contact_cascades_out_of_every_group() {
    let mut sut = booted_empty();
    for (addr, name) in [(A, "Alice"), (B, "Bob"), (C, "Cara")] {
        let ops = sut.dispatch(Event::Save {
            input: save_input(addr, Some(name)),
            now_ms: 1_000.0,
        });
        ack_writes(&mut sut, ops.len());
    }
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Payroll", Some(&[A, B])),
    });
    ack_writes(&mut sut, ops.len());
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Friends", Some(&[A])),
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::Delete {
        address: A.to_owned(),
        now_ms: 2_000.0,
    });
    assert_eq!(ops.len(), 3, "contacts + tombstones + groups all persist");
    assert!(matches!(&ops[2], Op::WriteGroups { .. }));
    ack_writes(&mut sut, 3);

    let view = sut.view();
    let payroll = &view.groups[0];
    let friends = &view.groups[1];
    assert_eq!(
        payroll
            .members
            .iter()
            .map(|c| c.address.as_str())
            .collect::<Vec<_>>(),
        vec![B]
    );
    assert!(friends.members.is_empty(), "empty, never dangling");

    // C belongs to no group: deleting it must NOT write groups.
    let ops = sut.dispatch(Event::Delete {
        address: C.to_owned(),
        now_ms: 3_000.0,
    });
    assert_eq!(ops.len(), 2, "no group held C, so no group write");
}

/// contacts.ts:396-410 — a member with a saved contact carries its name; a
/// bare-address member is synthesised, never silently dropped from a payout.
#[test]
fn group_view_resolves_saved_and_synthesises_unsaved_members() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Team", Some(&[A, B])),
    });
    ack_writes(&mut sut, ops.len());

    let view = sut.view();
    let members = &view.groups[0].members;
    assert_eq!(members.len(), 2, "order kept, nothing dropped");
    assert_eq!(members[0].name.as_deref(), Some("Alice"));
    assert_eq!(members[0].source, ContactSource::Manual);
    assert_eq!(members[1].address, B);
    assert_eq!(members[1].source, ContactSource::Auto);
}

// ---------------------------------------------------------------------------
// Import — invariant ⑤ (existing-wins)
// ---------------------------------------------------------------------------

/// contact-io.ts:203-223 — import only ADDS; a row whose address already
/// exists is skipped untouched, an invalid address is counted, never stored.
#[test]
fn import_is_existing_wins_never_overwrites_local() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: ContactSaveInput {
            favorite: Some(true),
            ..save_input(A, Some("Local Alice"))
        },
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::ImportParsed {
        contacts: vec![
            entry(A, Some("Imported Alice")), // exists → skipped, local wins
            entry(B, Some("Bob")),            // new → added
            entry("0xnope", Some("Bad")),     // invalid → dropped
        ],
        groups: vec![],
        now_ms: 2_000.0,
    });
    assert_eq!(
        ops.len(),
        1,
        "one contacts write, no group/tombstone writes"
    );
    ack_writes(&mut sut, 1);

    let view = sut.view();
    assert_eq!(
        view.last_import,
        Some(ContactImportReport {
            added: 1,
            skipped: 1,
            invalid: 1,
            groups_created: 0,
        })
    );
    let a = find(&view, A);
    assert_eq!(a.name.as_deref(), Some("Local Alice"), "untouched");
    assert!(a.favorite);
    assert_eq!(find(&view, B).name.as_deref(), Some("Bob"));
    assert!(view.contacts.iter().all(|c| c.address != "0xnope"));
}

/// Invariant ⑤ — a duplicate address within the same file is added once
/// (first row wins).
#[test]
fn import_duplicate_within_file_added_once() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::ImportParsed {
        contacts: vec![entry(A, Some("One")), entry(A, Some("Two"))],
        groups: vec![],
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());
    let view = sut.view();
    assert_eq!(
        view.last_import,
        Some(ContactImportReport {
            added: 1,
            skipped: 1,
            invalid: 0,
            groups_created: 0,
        })
    );
    assert_eq!(view.contacts.len(), 1);
    assert_eq!(view.contacts[0].name.as_deref(), Some("One"));
}

/// contact-io.ts:225-241 — groups are additive: created if missing, attaching
/// ONLY the newly-added members; a pre-existing contact's memberships are
/// never altered by an import.
#[test]
fn import_creates_missing_groups_attaching_only_new_members() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Local Alice")),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::ImportParsed {
        contacts: vec![entry(A, None), entry(B, None), entry(C, None)],
        groups: vec![ContactImportGroup {
            name: "Payroll".to_owned(),
            color: None,
            members: vec![A.to_owned(), B.to_owned(), C.to_owned()],
        }],
        now_ms: 2_000.0,
    });
    assert_eq!(ops.len(), 2);
    assert!(matches!(&ops[0], Op::WriteContacts { .. }));
    assert!(matches!(&ops[1], Op::WriteGroups { .. }));
    ack_writes(&mut sut, 2);

    let view = sut.view();
    assert_eq!(
        view.last_import,
        Some(ContactImportReport {
            added: 2,
            skipped: 1,
            invalid: 0,
            groups_created: 1,
        })
    );
    let payroll = &view.groups[0];
    assert_eq!(payroll.name, "Payroll");
    let members: Vec<&str> = payroll.members.iter().map(|c| c.address.as_str()).collect();
    assert_eq!(members, vec![B, C], "pre-existing A is NOT attached");
}

/// contact-io.ts:231-235 — a same-named group (case-insensitive) unions the
/// new members in, keeping the current ones.
#[test]
fn import_unions_new_members_into_existing_same_named_group() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());
    let ops = sut.dispatch(Event::GroupSave {
        input: gin(None, "Payroll", Some(&[A])),
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::ImportParsed {
        contacts: vec![entry(B, None)],
        groups: vec![ContactImportGroup {
            name: "payroll".to_owned(), // lower-case on purpose
            color: None,
            members: vec![B.to_owned()],
        }],
        now_ms: 2_000.0,
    });
    ack_writes(&mut sut, ops.len());

    let view = sut.view();
    assert_eq!(view.groups.len(), 1, "unioned into grp_1, not duplicated");
    assert_eq!(view.groups[0].id, "grp_1");
    let members: Vec<&str> = view.groups[0]
        .members
        .iter()
        .map(|c| c.address.as_str())
        .collect();
    assert_eq!(members, vec![A, B], "A kept, B unioned in");
    assert_eq!(
        view.last_import.map(|r| r.groups_created),
        Some(0),
        "no group was created"
    );
}

/// An import that adds nothing writes nothing — but the report still renders.
#[test]
fn import_with_nothing_new_writes_nothing() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::Save {
        input: save_input(A, Some("Alice")),
        now_ms: 1_000.0,
    });
    ack_writes(&mut sut, ops.len());

    let ops = sut.dispatch(Event::ImportParsed {
        contacts: vec![entry(A, Some("Shadow Alice"))],
        groups: vec![ContactImportGroup {
            name: "Payroll".to_owned(),
            color: None,
            members: vec![A.to_owned()],
        }],
        now_ms: 2_000.0,
    });
    assert!(ops.is_empty(), "no store changed, so nothing is written");
    let view = sut.view();
    assert_eq!(
        view.last_import,
        Some(ContactImportReport {
            added: 0,
            skipped: 1,
            invalid: 0,
            groups_created: 0,
        })
    );
    assert!(view.groups.is_empty(), "existing memberships untouched");
    assert_eq!(find(&view, A).name.as_deref(), Some("Alice"));
}

// ---------------------------------------------------------------------------
// Recipient trust & risk — invariant ⑦, RecipientTrust.tsx semantics
// ---------------------------------------------------------------------------

/// RecipientTrust.tsx:5-8 — saved **and** starred is the ONLY state that
/// earns the green check; a poisoned look-alike is never a starred contact.
#[test]
fn green_check_requires_saved_and_starred() {
    let mut sut = booted(
        vec![manual(A, Some("Alice"), false, 1_000.0)],
        vec![],
        vec![],
        vec![],
    );
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert!(recipient.saved);
    assert!(!recipient.verified, "saved but unstarred: no green check");

    let ops = sut.dispatch(Event::ToggleFavorite {
        address: A.to_owned(),
        now_ms: 2_000.0,
    });
    assert_eq!(ops.len(), 1);
    let recipient = sut.view().recipient.expect("recipient projected");
    assert!(recipient.verified, "saved ∧ starred earns the check");

    // An unsaved recipient can never be verified, whatever else resolves.
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: B.to_owned(),
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert!(!recipient.saved);
    assert!(!recipient.verified);
}

/// Contact name → contact resolved name → live identity → None.
#[test]
fn display_name_prefers_contact_name_over_identity() {
    let mut sut = booted(
        vec![manual(A, Some("Alice"), false, 1_000.0)],
        vec![],
        vec![],
        vec![],
    );
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: Some("0x".to_owned()),
    });
    let ops = sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: Some(identity("alice.eth", "ENS")),
    });
    assert!(ops.is_empty(), "a named contact is never written back over");

    let recipient = sut.view().recipient.expect("recipient projected");
    assert_eq!(recipient.display_name.as_deref(), Some("Alice"));
    assert_eq!(
        recipient.identity.map(|i| i.name),
        Some("alice.eth".to_owned()),
        "the live identity still rides along for the source tag"
    );
}

/// Invariant ⑦ — an EIP-7702 delegated EOA (`0xef0100 ++ addr`, 23 bytes) is
/// a person's wallet and must NOT be badged "Contract"; the address-book
/// `kind` still reads it as a smart account (contacts.ts:438, ported
/// verbatim).
#[test]
fn eip7702_delegated_eoa_is_never_badged_contract() {
    let mut sut = booted_empty();
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    let delegation = format!("0xef0100{}", "ab".repeat(20));
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: Some(delegation),
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert_eq!(
        recipient.is_contract,
        Some(false),
        "a wallet, not a contract"
    );
    assert_eq!(
        recipient.kind,
        ContactKind::Account,
        "the book's kind projection keeps the TS behaviour verbatim"
    );
}

/// recipient-risk.ts:50 / contacts.ts:438 — real bytecode is a contract and a
/// smart account; empty code is an EOA.
#[test]
fn contract_code_classifies_account_and_contract() {
    let mut sut = booted_empty();
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: Some("0x60016002".to_owned()),
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert_eq!(recipient.is_contract, Some(true));
    assert_eq!(recipient.kind, ContactKind::Account);

    sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: None,
    });
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: B.to_owned(),
    });
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: B.to_owned(),
        code: Some("0x".to_owned()),
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert_eq!(recipient.is_contract, Some(false));
    assert_eq!(recipient.kind, ContactKind::Eoa);
}

/// Invariant ⑦ — RPC unreachable is unknown, NOT a verdict: never a false
/// alarm, never cached, so the next inspect retries.
#[test]
fn unreachable_classification_is_unknown_and_never_cached() {
    let mut sut = booted_empty();
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: None,
    });
    sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: None,
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert_eq!(recipient.is_contract, None, "unknown, not false");

    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    assert_eq!(
        ops,
        vec![
            Op::ClassifyRecipient {
                chain_id: 1,
                address: A.to_owned(),
            },
            Op::ResolveIdentity {
                address: A.to_owned(),
            },
        ],
        "both failed lookups are re-asked"
    );
}

/// recipient-identity.ts:232-267 / invariant ⑦ — only positive resolutions
/// are cached; a `None` answer is re-asked next time.
#[test]
fn only_positive_identity_resolutions_are_cached() {
    let mut sut = booted_empty();
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: Some("0x".to_owned()),
    });
    sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: None,
    });

    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    assert_eq!(
        ops,
        vec![Op::ResolveIdentity {
            address: A.to_owned(),
        }],
        "the verdict is cached, the negative identity is not"
    );
    sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: Some(identity("alice.eth", "ENS")),
    });

    assert!(
        sut.dispatch(Event::InspectRecipient {
            chain_id: 1,
            address: A.to_owned(),
        })
        .is_empty(),
        "a positive resolution IS cached"
    );
}

/// RecipientTrust.tsx:78-84 — a saved-but-unnamed contact adopts the resolved
/// identity and the adoption is persisted, so the picker shows the real name.
#[test]
fn identity_write_back_names_a_saved_unnamed_contact() {
    let mut sut = booted(
        vec![manual(A, None, false, 1_000.0)],
        vec![],
        vec![],
        vec![],
    );
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    sut.resolve(Res::RecipientClassified {
        chain_id: 1,
        address: A.to_owned(),
        code: Some("0x".to_owned()),
    });
    let ops = sut.resolve(Res::IdentityResolved {
        address: A.to_owned(),
        identity: Some(identity("alice.eth", "ENS")),
    });
    assert_eq!(ops.len(), 1, "the adopted name is persisted");
    let Op::WriteContacts { contacts } = &ops[0] else {
        panic!("expected a contacts write");
    };
    assert_eq!(contacts[0].resolved_name.as_deref(), Some("alice.eth"));
    assert_eq!(contacts[0].resolved_source.as_deref(), Some("ENS"));

    let view = sut.view();
    assert_eq!(find(&view, A).resolved_name.as_deref(), Some("alice.eth"));
    let recipient = view.recipient.expect("recipient projected");
    assert_eq!(recipient.display_name.as_deref(), Some("alice.eth"));
}

/// recipient-risk.ts:59-69 — prior interaction counts sends, dApp txs AND
/// legacy untyped rows (verbatim: broader than what may suggest).
#[test]
fn first_interaction_counts_sends_dapp_and_legacy_rows() {
    let mut sut = booted(
        vec![],
        vec![],
        vec![],
        vec![
            send(&A.to_uppercase().replace("0X", "0x"), 100.0), // case-blind match
            tx(Some(ContactTxKind::DappTx), B, 200.0),
            tx(None, C, 300.0), // legacy untyped
            tx(Some(ContactTxKind::Receive), ME, 400.0),
        ],
    );
    for addr in [A, B, C] {
        sut.dispatch(Event::InspectRecipient {
            chain_id: 1,
            address: addr.to_owned(),
        });
        let recipient = sut.view().recipient.expect("recipient projected");
        assert!(
            !recipient.first_interaction,
            "{addr} has prior outgoing history"
        );
    }
    sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: ME.to_owned(),
    });
    let recipient = sut.view().recipient.expect("recipient projected");
    assert!(
        recipient.first_interaction,
        "a receive is not an outgoing interaction — the poisoning tell fires"
    );
}

/// recipient-risk.ts:76-78 — a malformed address gets no lookups and the
/// `{is_contract: null, first_interaction: false}` shape.
#[test]
fn invalid_recipient_gets_no_lookups_and_null_verdict() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: "0xnope".to_owned(),
    });
    assert!(ops.is_empty(), "no RPC for garbage");
    let recipient = sut.view().recipient.expect("recipient projected");
    assert!(!recipient.saved);
    assert_eq!(recipient.is_contract, None);
    assert!(!recipient.first_interaction);
}

/// recipient-identity.ts:233-236 — the zero address is a mint/burn
/// counterparty: classification still runs, identity is never asked.
#[test]
fn zero_address_skips_identity_lookup() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: ZERO.to_owned(),
    });
    assert_eq!(
        ops,
        vec![Op::ClassifyRecipient {
            chain_id: 1,
            address: ZERO.to_owned(),
        }]
    );
}

/// The core-side replacement for the TS hook's module-level inflight merge:
/// a second inspect while lookups are in flight issues nothing.
#[test]
fn inflight_lookups_are_not_duplicated() {
    let mut sut = booted_empty();
    let ops = sut.dispatch(Event::InspectRecipient {
        chain_id: 1,
        address: A.to_owned(),
    });
    assert_eq!(ops.len(), 2);
    assert!(
        sut.dispatch(Event::InspectRecipient {
            chain_id: 1,
            address: A.to_owned(),
        })
        .is_empty(),
        "both lookups are already in flight"
    );
}

// ---------------------------------------------------------------------------
// Sort & search (pure projections)
// ---------------------------------------------------------------------------

/// contacts.ts:452-458 — favourites first (despite older lastUsed), then
/// most-recently-used.
#[test]
fn sort_favorites_first_then_most_recent() {
    let sut = booted(
        vec![
            manual(A, None, false, 100.0),
            manual(B, None, false, 200.0),
            manual(C, None, true, 50.0),
        ],
        vec![],
        vec![],
        vec![],
    );
    assert_eq!(
        addresses(&sut.view()),
        vec![C.to_owned(), B.to_owned(), A.to_owned()]
    );
}

#[test]
fn sort_ties_break_on_display_name_then_address() {
    let sorted = sort_contacts(vec![
        manual(B, Some("bob"), false, 100.0),
        manual(A, Some("Alice"), false, 100.0),
        manual(C, None, false, 100.0), // no name → empty display name first
    ]);
    let names: Vec<String> = sorted.iter().map(contact_display_name).collect();
    assert_eq!(
        names,
        vec![String::new(), "Alice".to_owned(), "bob".to_owned()]
    );
}

/// contacts.ts:461-469.
#[test]
fn matches_query_on_address_name_resolved_name() {
    let mut c = manual(A, Some("Alice"), false, 0.0);
    c.resolved_name = Some("alice.eth".to_owned());
    assert!(matches_query(&c, ""));
    assert!(matches_query(&c, "ali"));
    assert!(matches_query(&c, "ALI"), "query is lowercased");
    assert!(matches_query(&c, ".eth"));
    assert!(matches_query(&c, "aaaa"), "address substring");
    assert!(!matches_query(&c, "zzz"));
}
