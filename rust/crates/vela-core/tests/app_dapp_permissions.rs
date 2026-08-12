//! Rules of the dApp permission machine, one test per rule — inventory
//! `### dapp_permissions (P2)` invariants ①–⑩, plus the popup entry's
//! drifted decision and the origin-security helpers.

#![cfg(feature = "crux")]

mod support;

use support::DomainDriver;
use vela_core::app::dapp_permissions::{
    decide_popup_request, hex_chain_id, is_connect_method, is_insecure_public_origin,
    is_signing_method, origin_of, DappPermissions, DpermGrant, DpermOperation as Op,
    DpermPageEvent, DpermPopupDecision, DpermPopupOutcome, DpermPopupView,
    DpermRejectReason as Reason, DpermRespondPayload as Payload, DpermShellResult as Res, Event,
};

type Sut = DomainDriver<DappPermissions>;

const T0: f64 = 1_754_700_000_000.0;
const ORIGIN: &str = "https://dapp.example";
const OTHER: &str = "https://other.example";
const A1: &str = "0x1111111111111111111111111111111111111111";
const A2: &str = "0x2222222222222222222222222222222222222222";
const A3: &str = "0x3333333333333333333333333333333333333333";

fn provider(id: &str, method: &str, origin: &str, is_main_frame: bool) -> Event {
    Event::ProviderRequest {
        id: id.to_owned(),
        method: method.to_owned(),
        params_json: "[]".to_owned(),
        origin: origin.to_owned(),
        is_main_frame,
    }
}

fn grant(address: &str) -> DpermGrant {
    DpermGrant {
        origin: ORIGIN.to_owned(),
        address: address.to_owned(),
        chain_id: 8453,
        granted_at_ms: T0,
    }
}

fn err(id: &str, code: u32, reason: Reason) -> Op {
    Op::Respond {
        id: id.to_owned(),
        payload: Payload::Error { code, reason },
    }
}

fn accounts(id: &str, addresses: &[&str]) -> Op {
    Op::Respond {
        id: id.to_owned(),
        payload: Payload::Accounts {
            addresses: addresses.iter().map(|a| (*a).to_owned()).collect(),
        },
    }
}

/// Wallet loaded: two accounts, A1 active, chain 8453. No navigation yet.
fn fresh() -> Sut {
    let mut sut = Sut::new();
    assert!(sut
        .dispatch(Event::AccountsUpdated {
            addresses: Some(vec![A1.to_owned(), A2.to_owned()]),
        })
        .is_empty());
    assert!(sut
        .dispatch(Event::AccountSwitched {
            address: A1.to_owned(),
            now_ms: T0,
        })
        .is_empty());
    assert!(sut
        .dispatch(Event::ChainChanged { chain_id: 8453 })
        .is_empty());
    sut
}

/// Navigate `sut` to `url` and answer the grant read with `stored`.
fn navigate(sut: &mut Sut, url: &str, origin: &str, stored: Option<DpermGrant>) {
    let ops = sut.dispatch(Event::NavigationStarted {
        url: url.to_owned(),
    });
    assert_eq!(
        ops,
        vec![
            Op::SettleForwarded {
                code: 4900,
                reason: Reason::NavigatedAway,
            },
            Op::ReadGrant {
                origin: origin.to_owned(),
            },
        ],
    );
    assert!(sut.resolve(Res::Ack).is_empty());
    let ops = sut.resolve(Res::GrantRead {
        origin: origin.to_owned(),
        grant: stored,
    });
    assert!(ops.is_empty(), "a nav grant read only refreshes the view");
}

/// Wallet loaded and on `ORIGIN` with no stored grant.
fn ready() -> Sut {
    let mut sut = fresh();
    navigate(&mut sut, "https://dapp.example/swap", ORIGIN, None);
    sut
}

/// Wallet loaded and on `ORIGIN` with a stored grant for `address`.
fn ready_granted(address: &str) -> Sut {
    let mut sut = fresh();
    navigate(
        &mut sut,
        "https://dapp.example/swap",
        ORIGIN,
        Some(grant(address)),
    );
    sut
}

/// Open the consent sheet with one `eth_requestAccounts` (id `r1`) and
/// approve it, draining the five approve operations.
fn connected() -> Sut {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());
    let ops = sut.dispatch(Event::ConsentApproved {
        now_ms: T0 + 1_000.0,
    });
    assert_eq!(ops.len(), 5, "write, record, respond, two page events");
    for _ in 0..5 {
        assert!(sut.resolve(Res::Ack).is_empty());
    }
    sut
}

// ---------------------------------------------------------------------------
// ① — a cross-origin iframe never gets accounts
// ---------------------------------------------------------------------------

/// A subframe gets the disconnected view instantly — no store read, even when
/// a grant for its origin exists.
#[test]
fn iframe_sees_disconnected_view_without_a_store_read() {
    let mut sut = ready_granted(A1);
    let ops = sut.dispatch(provider("i1", "eth_accounts", OTHER, false));
    assert_eq!(ops, vec![accounts("i1", &[])]);
    assert!(
        !sut.outstanding()
            .iter()
            .any(|op| matches!(op, Op::ReadGrant { .. })),
        "no ReadGrant for a subframe"
    );
}

/// A subframe connect is rejected 4100 — it can never open the sheet.
#[test]
fn iframe_connect_rejected_4100() {
    let mut sut = ready();
    let ops = sut.dispatch(provider("i2", "eth_requestAccounts", OTHER, false));
    assert_eq!(ops, vec![err("i2", 4100, Reason::UnauthorizedFrame)]);
    assert!(sut.view().consent.is_none());
}

/// Subframe provider traffic never reaches the signing pipeline
/// (`webview-transport.ts:116-120`, converged into the decision).
#[test]
fn iframe_forwarded_method_rejected_4100() {
    let mut sut = ready();
    let ops = sut.dispatch(provider("i3", "eth_sendTransaction", OTHER, false));
    assert_eq!(ops, vec![err("i3", 4100, Reason::UnauthorizedFrame)]);
}

// ---------------------------------------------------------------------------
// ② — a transient empty account read never drops a grant
// ---------------------------------------------------------------------------

/// Cold load: addresses unknown (`None`) — the grant is trusted, exposed, and
/// NOT physically removed.
#[test]
fn cold_load_trusts_the_grant() {
    let mut sut = Sut::new();
    navigate(
        &mut sut,
        "https://dapp.example/swap",
        ORIGIN,
        Some(grant(A1)),
    );
    assert_eq!(sut.view().connected_address.as_deref(), Some(A1));

    let ops = sut.dispatch(provider("c1", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("c1", &[A1])], "no RemoveGrant, no []");
}

/// A loaded-but-empty account list is the same transient state as `None`.
#[test]
fn empty_account_list_also_trusts_the_grant() {
    let mut sut = Sut::new();
    assert!(sut
        .dispatch(Event::AccountsUpdated {
            addresses: Some(Vec::new()),
        })
        .is_empty());
    navigate(
        &mut sut,
        "https://dapp.example/swap",
        ORIGIN,
        Some(grant(A1)),
    );
    let ops = sut.dispatch(provider("c2", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("c2", &[A1])]);
}

/// Only a KNOWN account list that lost the granted address drops the grant —
/// and then physically removes it from the store.
#[test]
fn deleted_account_drops_the_grant_once() {
    let mut sut = ready_granted(A3); // A3 is not in [A1, A2]
    let ops = sut.dispatch(provider("d1", "eth_accounts", ORIGIN, true));
    assert_eq!(
        ops,
        vec![
            Op::RemoveGrant {
                origin: ORIGIN.to_owned(),
            },
            accounts("d1", &[]),
        ],
    );
    assert!(sut.resolve(Res::Ack).is_empty());
    assert!(sut.resolve(Res::Ack).is_empty());

    // The mirror already knows — the second request removes nothing twice.
    let ops = sut.dispatch(provider("d2", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("d2", &[])]);
}

// ---------------------------------------------------------------------------
// ③ — signing on public http is refused; IP exemptions are fully anchored
// ---------------------------------------------------------------------------

fn http_origin_sut(url: &str, origin: &str) -> Sut {
    let mut sut = fresh();
    navigate(&mut sut, url, origin, None);
    sut
}

#[test]
fn public_http_signing_blocked_4100() {
    let mut sut = http_origin_sut("http://insecure.example/dapp", "http://insecure.example");
    let ops = sut.dispatch(provider(
        "s1",
        "eth_sendTransaction",
        "http://insecure.example",
        true,
    ));
    assert_eq!(ops, vec![err("s1", 4100, Reason::InsecureOrigin)]);
}

/// `10.0.0.1.evil.com` is a registrable public FQDN, not a private IP.
#[test]
fn ip_lookalike_fqdn_is_not_exempt() {
    let origin = "http://10.0.0.1.evil.com";
    let mut sut = http_origin_sut("http://10.0.0.1.evil.com/", origin);
    let ops = sut.dispatch(provider("s2", "personal_sign", origin, true));
    assert_eq!(ops, vec![err("s2", 4100, Reason::InsecureOrigin)]);
}

#[test]
fn private_lan_and_loopback_http_still_sign() {
    for (url, origin) in [
        ("http://192.168.1.7:8080/x", "http://192.168.1.7:8080"),
        ("http://localhost:3000/", "http://localhost:3000"),
        ("http://[::1]:8545/", "http://[::1]:8545"),
    ] {
        let mut sut = http_origin_sut(url, origin);
        let ops = sut.dispatch(provider("s3", "personal_sign", origin, true));
        assert_eq!(
            ops,
            vec![Op::ForwardToSigning {
                id: "s3".to_owned(),
                method: "personal_sign".to_owned(),
                params_json: "[]".to_owned(),
                origin: origin.to_owned(),
            }],
            "{origin} must be exempt",
        );
    }
}

/// Only SIGNING methods are blocked on insecure origins — reads still flow.
#[test]
fn read_only_rpc_on_insecure_origin_still_forwards() {
    let mut sut = http_origin_sut("http://insecure.example/dapp", "http://insecure.example");
    let ops = sut.dispatch(provider("s4", "eth_call", "http://insecure.example", true));
    assert_eq!(
        ops,
        vec![Op::ForwardToSigning {
            id: "s4".to_owned(),
            method: "eth_call".to_owned(),
            params_json: "[]".to_owned(),
            origin: "http://insecure.example".to_owned(),
        }],
    );
}

#[test]
fn insecure_origin_classification_table() {
    // insecure
    for origin in [
        "http://dapp.example",
        "http://10.0.0.1.evil.com",
        "http://999.1.1.1",  // not a valid quad → hostname → public
        "http://172.32.0.1", // just past the 172.16–31 private block
        "not a url",
        "",
    ] {
        assert!(is_insecure_public_origin(origin), "{origin}");
    }
    // exempt / secure
    for origin in [
        "https://dapp.example",
        "http://localhost",
        "http://dev.local",
        "http://127.0.0.1",
        "http://10.0.0.1",
        "http://192.168.0.10",
        "http://172.31.255.255",
        "http://169.254.1.1",
        "http://[::1]",
        "http://[fd12::1]",
        "http://[fe80::2]",
    ] {
        assert!(!is_insecure_public_origin(origin), "{origin}");
    }
}

// ---------------------------------------------------------------------------
// ④ — same-origin connects coalesce; a second origin is refused 4001
// ---------------------------------------------------------------------------

#[test]
fn same_origin_connects_merge_into_one_sheet() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());
    assert!(sut
        .dispatch(provider("r2", "wallet_requestPermissions", ORIGIN, true))
        .is_empty());

    let consent = sut.view().consent.expect("one sheet");
    assert_eq!(consent.origin, ORIGIN);
    assert_eq!(
        consent.methods,
        vec!["eth_requestAccounts", "wallet_requestPermissions"]
    );

    // Approve answers BOTH, each with its method-appropriate result — and
    // each id exactly once (⑩).
    let ops = sut.dispatch(Event::ConsentApproved { now_ms: T0 + 500.0 });
    let responds: Vec<&Op> = ops
        .iter()
        .filter(|op| matches!(op, Op::Respond { .. }))
        .collect();
    assert_eq!(
        responds,
        vec![
            &accounts("r1", &[A1]),
            &Op::Respond {
                id: "r2".to_owned(),
                payload: Payload::Permissions { granted: true },
            },
        ],
    );
}

#[test]
fn colliding_second_origin_rejected_4001() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());

    // A main-frame connect from another origin parks on its grant read, then
    // hits the busy sheet.
    let ops = sut.dispatch(provider("x1", "eth_requestAccounts", OTHER, true));
    assert_eq!(
        ops,
        vec![Op::ReadGrant {
            origin: OTHER.to_owned(),
        }],
    );
    let ops = sut.resolve(Res::GrantRead {
        origin: OTHER.to_owned(),
        grant: None,
    });
    assert_eq!(ops, vec![err("x1", 4001, Reason::ConsentBusy)]);

    // The first sheet is untouched.
    assert_eq!(sut.view().consent.expect("still open").origin, ORIGIN);
}

// ---------------------------------------------------------------------------
// ⑤ — navigation settles with 4900, never 4001
// ---------------------------------------------------------------------------

#[test]
fn navigation_settles_consent_with_4900_never_4001() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());

    // Reload (same origin): everything in flight settles as unknown-pending.
    let ops = sut.dispatch(Event::NavigationStarted {
        url: "https://dapp.example/other".to_owned(),
    });
    assert_eq!(
        ops,
        vec![
            Op::SettleForwarded {
                code: 4900,
                reason: Reason::NavigatedAway,
            },
            err("r1", 4900, Reason::NavigatedAway),
        ],
    );
    for op in &ops {
        let code = match op {
            Op::SettleForwarded { code, .. } => *code,
            Op::Respond {
                payload: Payload::Error { code, .. },
                ..
            } => *code,
            other => unreachable!("unexpected op {other:?}"),
        };
        assert_ne!(code, 4001, "a dApp retries 4001 — double-spend risk");
    }
    assert!(sut.view().consent.is_none());
}

/// The user's own rejection IS 4001 — the two codes must never swap.
#[test]
fn user_rejection_is_4001() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());
    let ops = sut.dispatch(Event::ConsentRejected);
    assert_eq!(ops, vec![err("r1", 4001, Reason::UserRejected)]);
    assert!(sut.view().consent.is_none());
    assert!(sut.view().connected_address.is_none());
}

/// A same-origin reload never re-reads the grant (the chip keeps its state).
#[test]
fn same_origin_reload_does_not_reread_the_grant() {
    let mut sut = ready();
    let ops = sut.dispatch(Event::NavigationStarted {
        url: "https://dapp.example/two".to_owned(),
    });
    assert_eq!(
        ops,
        vec![Op::SettleForwarded {
            code: 4900,
            reason: Reason::NavigatedAway,
        }],
    );
}

// ---------------------------------------------------------------------------
// ⑥ — an approve that lands after navigation is inert
// ---------------------------------------------------------------------------

#[test]
fn late_approve_after_navigation_responds_nothing_and_leaks_nothing() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());

    let ops = sut.dispatch(Event::NavigationStarted {
        url: "https://dapp.example/next".to_owned(),
    });
    assert_eq!(ops.len(), 2); // settle + the 4900 for r1
    assert!(sut.resolve(Res::Ack).is_empty());
    assert!(sut.resolve(Res::Ack).is_empty());

    // The tap raced the navigation and lost: no respond, no WriteGrant, no
    // accountsChanged into the new document.
    let ops = sut.dispatch(Event::ConsentApproved {
        now_ms: T0 + 2_000.0,
    });
    assert!(ops.is_empty());
    assert!(sut.view().connected_address.is_none());

    // And no grant was persisted: the origin still reads as disconnected.
    let ops = sut.dispatch(provider("q1", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("q1", &[])]);
}

// ---------------------------------------------------------------------------
// ⑦ — addresses never leak to an unconnected origin
// ---------------------------------------------------------------------------

#[test]
fn switching_accounts_while_unconnected_emits_nothing() {
    let mut sut = ready();
    let ops = sut.dispatch(Event::AccountSwitched {
        address: A2.to_owned(),
        now_ms: T0 + 100.0,
    });
    assert!(
        ops.is_empty(),
        "no accountsChanged to a never-connected page"
    );
}

#[test]
fn switching_accounts_while_connected_repins_the_grant_and_emits() {
    let mut sut = connected();
    let ops = sut.dispatch(Event::AccountSwitched {
        address: A2.to_owned(),
        now_ms: T0 + 2_000.0,
    });
    assert_eq!(
        ops,
        vec![
            Op::WriteGrant {
                grant: DpermGrant {
                    origin: ORIGIN.to_owned(),
                    address: A2.to_owned(),
                    chain_id: 8453,
                    granted_at_ms: T0 + 2_000.0,
                },
            },
            Op::EmitEvent {
                event: DpermPageEvent::AccountsChanged {
                    addresses: vec![A2.to_owned()],
                },
            },
        ],
    );
    assert_eq!(sut.view().connected_address.as_deref(), Some(A2));
    assert!(sut.resolve(Res::Ack).is_empty());
    assert!(sut.resolve(Res::Ack).is_empty());

    // The page now reads the NEW pin.
    let ops = sut.dispatch(provider("q2", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("q2", &[A2])]);
}

// ---------------------------------------------------------------------------
// ⑧ — eth_accounts never prompts
// ---------------------------------------------------------------------------

#[test]
fn eth_accounts_reflects_state_and_never_opens_the_sheet() {
    let mut sut = ready();
    let ops = sut.dispatch(provider("e1", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("e1", &[])]);
    assert!(sut.view().consent.is_none());

    let mut sut = ready_granted(A1);
    let ops = sut.dispatch(provider("e2", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("e2", &[A1])]);
    assert!(sut.view().consent.is_none());
}

#[test]
fn wallet_get_permissions_mirrors_the_grant() {
    let mut sut = ready();
    let ops = sut.dispatch(provider("p1", "wallet_getPermissions", ORIGIN, true));
    assert_eq!(
        ops,
        vec![Op::Respond {
            id: "p1".to_owned(),
            payload: Payload::Permissions { granted: false },
        }],
    );

    let mut sut = ready_granted(A1);
    let ops = sut.dispatch(provider("p2", "wallet_getPermissions", ORIGIN, true));
    assert_eq!(
        ops,
        vec![Op::Respond {
            id: "p2".to_owned(),
            payload: Payload::Permissions { granted: true },
        }],
    );
}

/// A revisit with a live grant answers connect immediately — no sheet, no
/// second audit row.
#[test]
fn connect_on_a_granted_origin_answers_without_a_sheet() {
    let mut sut = ready_granted(A1);
    let ops = sut.dispatch(provider("c1", "eth_requestAccounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("c1", &[A1])]);

    let ops = sut.dispatch(provider("c2", "wallet_requestPermissions", ORIGIN, true));
    assert_eq!(
        ops,
        vec![Op::Respond {
            id: "c2".to_owned(),
            payload: Payload::Permissions { granted: true },
        }],
    );
    assert!(sut.view().consent.is_none());
}

// ---------------------------------------------------------------------------
// ⑨ — the grant is pinned to the granted address, not the active account
// ---------------------------------------------------------------------------

#[test]
fn grant_pinned_to_granted_address_not_active_account() {
    // Active is A1; the grant was made for A2 — still present in the wallet.
    let mut sut = ready_granted(A2);
    let ops = sut.dispatch(provider("g1", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("g1", &[A2])], "never the active account");
}

#[test]
fn granted_address_presence_check_is_case_insensitive() {
    let upper = A2.to_uppercase().replace("0X", "0x");
    let mut sut = ready_granted(&upper);
    let ops = sut.dispatch(provider("g2", "eth_accounts", ORIGIN, true));
    // Exposed exactly as granted (stored casing), and NOT dropped.
    assert_eq!(ops, vec![accounts("g2", &[upper.as_str()])]);
}

// ---------------------------------------------------------------------------
// Approve flow — grant write, audit row, page announcement
// ---------------------------------------------------------------------------

#[test]
fn approve_writes_grant_saves_record_then_announces() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());
    let ops = sut.dispatch(Event::ConsentApproved {
        now_ms: T0 + 1_000.0,
    });
    assert_eq!(
        ops,
        vec![
            Op::WriteGrant {
                grant: DpermGrant {
                    origin: ORIGIN.to_owned(),
                    address: A1.to_owned(),
                    chain_id: 8453,
                    granted_at_ms: T0 + 1_000.0,
                },
            },
            Op::SaveConnectionRecord {
                address: A1.to_owned(),
                chain_id: 8453,
                origin: ORIGIN.to_owned(),
            },
            accounts("r1", &[A1]),
            Op::EmitEvent {
                event: DpermPageEvent::AccountsChanged {
                    addresses: vec![A1.to_owned()],
                },
            },
            Op::EmitEvent {
                event: DpermPageEvent::ChainChanged {
                    chain_id_hex: "0x2105".to_owned(),
                },
            },
        ],
    );
    assert_eq!(sut.view().connected_address.as_deref(), Some(A1));
    assert!(sut.view().consent.is_none());
}

#[test]
fn connect_without_any_account_rejected_4001() {
    let mut sut = Sut::new();
    navigate(&mut sut, "https://dapp.example/swap", ORIGIN, None);
    let ops = sut.dispatch(provider("n1", "eth_requestAccounts", ORIGIN, true));
    assert_eq!(ops, vec![err("n1", 4001, Reason::NoAccountAvailable)]);
}

// ---------------------------------------------------------------------------
// chainChanged — only to a connected page, only on a real change
// ---------------------------------------------------------------------------

#[test]
fn chain_change_emits_only_when_connected_and_changed() {
    let mut sut = ready();
    assert!(sut.dispatch(Event::ChainChanged { chain_id: 1 }).is_empty());

    let mut sut = connected();
    let ops = sut.dispatch(Event::ChainChanged { chain_id: 1 });
    assert_eq!(
        ops,
        vec![Op::EmitEvent {
            event: DpermPageEvent::ChainChanged {
                chain_id_hex: "0x1".to_owned(),
            },
        }],
    );
    assert!(sut.resolve(Res::Ack).is_empty());
    assert!(
        sut.dispatch(Event::ChainChanged { chain_id: 1 }).is_empty(),
        "same value again is not a change"
    );
}

// ---------------------------------------------------------------------------
// Disconnect / revoke
// ---------------------------------------------------------------------------

#[test]
fn disconnect_revokes_and_notifies_the_page() {
    let mut sut = connected();
    let ops = sut.dispatch(Event::RevokeRequested { origin: None });
    assert_eq!(
        ops,
        vec![
            Op::RemoveGrant {
                origin: ORIGIN.to_owned(),
            },
            Op::EmitEvent {
                event: DpermPageEvent::AccountsChanged {
                    addresses: Vec::new(),
                },
            },
            Op::EmitEvent {
                event: DpermPageEvent::Disconnect,
            },
        ],
    );
    assert!(sut.view().connected_address.is_none());
    for _ in 0..3 {
        assert!(sut.resolve(Res::Ack).is_empty());
    }

    // The page now reads disconnected — and eth_accounts still never prompts.
    let ops = sut.dispatch(provider("z1", "eth_accounts", ORIGIN, true));
    assert_eq!(ops, vec![accounts("z1", &[])]);
    assert!(sut.view().consent.is_none());
}

/// Revoking a NON-current origin (e.g. from a settings screen) touches the
/// store only — no page events leak to the unrelated page in front of us.
#[test]
fn revoking_a_foreign_origin_emits_no_page_events() {
    let mut sut = connected();
    let ops = sut.dispatch(Event::RevokeRequested {
        origin: Some(OTHER.to_owned()),
    });
    assert_eq!(
        ops,
        vec![Op::RemoveGrant {
            origin: OTHER.to_owned(),
        }],
    );
    assert_eq!(sut.view().connected_address.as_deref(), Some(A1));
}

// ---------------------------------------------------------------------------
// Grant reads — parking, coalescing, staleness
// ---------------------------------------------------------------------------

/// Requests arriving while a read is in flight share the one store round
/// trip, and every parked request is answered when it lands.
#[test]
fn parked_requests_share_one_read_and_all_get_answered() {
    let mut sut = ready();
    let ops = sut.dispatch(Event::NavigationStarted {
        url: "https://other.example/app".to_owned(),
    });
    assert_eq!(
        ops,
        vec![
            Op::SettleForwarded {
                code: 4900,
                reason: Reason::NavigatedAway,
            },
            Op::ReadGrant {
                origin: OTHER.to_owned(),
            },
        ],
    );
    assert!(sut.resolve(Res::Ack).is_empty());

    // Two requests before the read resolves: both park, no second read.
    assert!(sut
        .dispatch(provider("o1", "eth_accounts", OTHER, true))
        .is_empty());
    assert!(sut
        .dispatch(provider("o2", "eth_accounts", OTHER, true))
        .is_empty());
    assert_eq!(
        sut.outstanding().len(),
        1,
        "exactly one ReadGrant in flight"
    );

    let ops = sut.resolve(Res::GrantRead {
        origin: OTHER.to_owned(),
        grant: None,
    });
    assert_eq!(ops, vec![accounts("o1", &[]), accounts("o2", &[])]);
}

/// A grant read still in flight when the browser closes is dropped: its
/// session is over (attempt guard).
#[test]
fn stale_grant_read_after_close_is_dropped() {
    let mut sut = ready();
    let ops = sut.dispatch(Event::NavigationStarted {
        url: "https://other.example/app".to_owned(),
    });
    assert_eq!(ops.len(), 2);
    assert!(sut.resolve(Res::Ack).is_empty()); // settle ack

    let ops = sut.dispatch(Event::BrowserClosed);
    assert_eq!(
        ops,
        vec![Op::SettleForwarded {
            code: 4900,
            reason: Reason::BrowserClosed,
        }],
    );

    // The old read resolves into a closed session: nothing happens.
    let ops = sut.resolve(Res::GrantRead {
        origin: OTHER.to_owned(),
        grant: Some(grant(A1)),
    });
    assert!(ops.is_empty());
    assert!(sut.view().connected_address.is_none());
    assert!(sut.view().current_origin.is_none());
}

/// Closing the browser settles the sheet as unknown-pending (4900) — closing
/// is not the user pressing reject.
#[test]
fn browser_close_settles_consent_with_4900() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("r1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());
    let ops = sut.dispatch(Event::BrowserClosed);
    assert_eq!(
        ops,
        vec![
            Op::SettleForwarded {
                code: 4900,
                reason: Reason::BrowserClosed,
            },
            err("r1", 4900, Reason::BrowserClosed),
        ],
    );
    assert!(sut.view().consent.is_none());
}

// ---------------------------------------------------------------------------
// The popup entry's decision (`web-request.tsx:169-193`)
// ---------------------------------------------------------------------------

#[test]
fn popup_connect_paths() {
    let granted = vec![A1.to_owned()];
    assert_eq!(
        decide_popup_request("eth_requestAccounts", &granted, None),
        DpermPopupDecision::Respond(Payload::Accounts {
            addresses: vec![A1.to_owned()],
        }),
    );
    assert_eq!(
        decide_popup_request("wallet_requestPermissions", &granted, None),
        DpermPopupDecision::Respond(Payload::Permissions { granted: true }),
    );
    assert_eq!(
        decide_popup_request("eth_requestAccounts", &[], None),
        DpermPopupDecision::Consent,
    );
}

/// The popup REFUSES non-connect requests from a never-connected origin
/// (4100) — unlike the browser, which forwards reads. The drift is explicit.
#[test]
fn popup_requires_connection_first() {
    assert_eq!(
        decide_popup_request("personal_sign", &[], None),
        DpermPopupDecision::Reject(Reason::NotConnected),
    );
    assert_eq!(Reason::NotConnected.code(), 4100);
}

#[test]
fn popup_pinned_address_must_match_the_grant() {
    let granted = vec![A1.to_owned()];
    assert_eq!(
        decide_popup_request("personal_sign", &granted, Some(A2)),
        DpermPopupDecision::Reject(Reason::StaleAuthorizedAddress),
    );
    // Case-insensitive match, and no pin at all, both forward.
    let upper = A1.to_uppercase().replace("0X", "0x");
    assert_eq!(
        decide_popup_request("personal_sign", &granted, Some(&upper)),
        DpermPopupDecision::ForwardToSigning,
    );
    assert_eq!(
        decide_popup_request("eth_sendTransaction", &granted, None),
        DpermPopupDecision::ForwardToSigning,
    );
}

// ---------------------------------------------------------------------------
// The popup entry, as a DISPATCHABLE decision (`Event::PopupRequest`)
//
// The rules above are the pure function's; these are the same rules reached
// the only way a shell can reach them. Every one of them is a fund-safety
// rule, so the projection has to be asserted, not assumed.
// ---------------------------------------------------------------------------

fn popup(
    method: &str,
    grant: Option<DpermGrant>,
    addresses: Option<&[&str]>,
    pinned: Option<&str>,
) -> Event {
    Event::PopupRequest {
        method: method.to_owned(),
        grant,
        current_addresses: addresses.map(|a| a.iter().map(|s| (*s).to_owned()).collect()),
        pinned_address: pinned.map(str::to_owned),
    }
}

/// Ask the verdict and read it back. Every popup question must be answered
/// with NO shell operation — the popup owns its own grant I/O and its own
/// window; this core is asked the question and nothing else.
fn ask(sut: &mut Sut, event: Event) -> DpermPopupView {
    let ops = sut.dispatch(event);
    assert!(
        ops.is_empty(),
        "a popup question asks the shell for nothing"
    );
    sut.view().popup.expect("a popup verdict")
}

/// A never-connected origin gets NO address — 4100, never a forward.
#[test]
fn popup_event_refuses_an_unconnected_origin() {
    let mut sut = Sut::new();
    let verdict = ask(&mut sut, popup("personal_sign", None, Some(&[A1]), None));
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::Reject {
            code: 4100,
            reason: Reason::NotConnected,
        },
    );
    assert!(verdict.granted.is_empty());

    // …and the connect methods do not leak one either: they ask the user.
    let verdict = ask(
        &mut sut,
        popup("eth_requestAccounts", None, Some(&[A1]), None),
    );
    assert_eq!(verdict.outcome, DpermPopupOutcome::Consent);
}

/// The forward is pinned to the GRANT's address, never the wallet's active
/// account (invariant ⑨). A2 is first in the wallet here; A1 is the grant.
#[test]
fn popup_event_forwards_the_granted_address_not_the_active_account() {
    let mut sut = Sut::new();
    let verdict = ask(
        &mut sut,
        popup(
            "eth_sendTransaction",
            Some(grant(A1)),
            Some(&[A2, A1]),
            None,
        ),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::ForwardToSigning {
            granted_address: A1.to_owned(),
        },
    );

    // A grant whose account was deleted from the wallet exposes nothing.
    let verdict = ask(
        &mut sut,
        popup(
            "eth_sendTransaction",
            Some(grant(A3)),
            Some(&[A1, A2]),
            None,
        ),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::Reject {
            code: 4100,
            reason: Reason::NotConnected,
        },
    );

    // Cold read (addresses not known yet): the grant is TRUSTED, not revoked
    // (invariant ②) — a transient empty list must not log the origin out.
    let verdict = ask(
        &mut sut,
        popup("eth_sendTransaction", Some(grant(A1)), None, None),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::ForwardToSigning {
            granted_address: A1.to_owned(),
        },
    );
}

/// A request pinning an address other than the granted one is refused 4100 —
/// and the verdict is a REFUSAL, never a forward carrying some other signer.
#[test]
fn popup_event_refuses_a_stale_pinned_address() {
    let mut sut = Sut::new();
    let verdict = ask(
        &mut sut,
        popup("personal_sign", Some(grant(A1)), Some(&[A1, A2]), Some(A2)),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::Reject {
            code: 4100,
            reason: Reason::StaleAuthorizedAddress,
        },
    );

    // The same address in another case still forwards, pinned to the grant.
    let upper = A1.to_uppercase().replace("0X", "0x");
    let verdict = ask(
        &mut sut,
        popup(
            "personal_sign",
            Some(grant(A1)),
            Some(&[A1, A2]),
            Some(&upper),
        ),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::ForwardToSigning {
            granted_address: A1.to_owned(),
        },
    );
}

/// Connect on an already-granted origin answers immediately, in the shape the
/// method asks for — no second prompt on revisit.
#[test]
fn popup_event_connect_on_a_granted_origin_answers_without_a_prompt() {
    let mut sut = Sut::new();
    let verdict = ask(
        &mut sut,
        popup(
            "eth_requestAccounts",
            Some(grant(A1)),
            Some(&[A1, A2]),
            None,
        ),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::Respond {
            payload: Payload::Accounts {
                addresses: vec![A1.to_owned()],
            },
        },
    );
    let verdict = ask(
        &mut sut,
        popup(
            "wallet_requestPermissions",
            Some(grant(A1)),
            Some(&[A1, A2]),
            None,
        ),
    );
    assert_eq!(
        verdict.outcome,
        DpermPopupOutcome::Respond {
            payload: Payload::Permissions { granted: true },
        },
    );
}

/// The popup question touches NONE of the browser state — it is a different
/// entry with a different window, and it must not disturb the consent sheet,
/// the connected chip or the current origin.
#[test]
fn popup_event_leaves_the_browser_half_untouched() {
    let mut sut = ready();
    assert!(sut
        .dispatch(provider("c1", "eth_requestAccounts", ORIGIN, true))
        .is_empty());
    let before = sut.view();

    ask(
        &mut sut,
        popup("personal_sign", Some(grant(A2)), Some(&[A1, A2]), None),
    );
    let after = sut.view();
    assert_eq!(after.consent, before.consent);
    assert_eq!(after.connected_address, before.connected_address);
    assert_eq!(after.current_origin, before.current_origin);
    assert!(sut.outstanding().is_empty());
}

// ---------------------------------------------------------------------------
// Method sets + origin helpers — the single point
// ---------------------------------------------------------------------------

#[test]
fn method_sets_are_the_single_point() {
    for method in [
        "eth_sendTransaction",
        "personal_sign",
        "eth_sign",
        "eth_signTypedData",
        "eth_signTypedData_v1",
        "eth_signTypedData_v3",
        "eth_signTypedData_v4",
        "wallet_sendCalls",
    ] {
        assert!(is_signing_method(method), "{method}");
    }
    assert!(!is_signing_method("eth_call"));
    assert!(!is_signing_method("wallet_switchEthereumChain"));

    assert!(is_connect_method("eth_requestAccounts"));
    assert!(is_connect_method("wallet_requestPermissions"));
    assert!(!is_connect_method("eth_accounts"));
}

#[test]
fn origin_of_normalizes_like_the_url_constructor() {
    assert_eq!(
        origin_of("https://Dapp.Example/Swap?x=1#y").as_deref(),
        Some("https://dapp.example"),
    );
    assert_eq!(
        origin_of("https://dapp.example:443/x").as_deref(),
        Some("https://dapp.example"),
        "default port stripped",
    );
    assert_eq!(
        origin_of("http://dapp.example:8080/x").as_deref(),
        Some("http://dapp.example:8080"),
        "non-default port kept",
    );
    assert_eq!(
        origin_of("http://[::1]:8545/rpc").as_deref(),
        Some("http://[::1]:8545"),
    );
    assert_eq!(origin_of(""), None);
    assert_eq!(origin_of("not a url"), None);
    assert_eq!(
        origin_of("javascript:alert(1)"),
        None,
        "non-http(s) never becomes an origin"
    );
}

#[test]
fn hex_chain_id_matches_the_ts_encoding() {
    assert_eq!(hex_chain_id(1), "0x1");
    assert_eq!(hex_chain_id(8453), "0x2105");
    assert_eq!(hex_chain_id(0), "0x0");
}
