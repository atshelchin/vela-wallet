//! Rules of deposit detection, one test per rule.
//!
//! Everything here was previously one `useEffect` closure with zero tests.
//! The fake clock is just `now_ms` on each result — the core never owns time.

#![cfg(feature = "crux")]

mod support;

use support::DomainDriver;
use vela_core::app::receive_watch::{
    Event, ReceiveWatch, ReceiveWatchOperation as Op, ReceiveWatchShellResult as Res, TokenSnapshot,
};

type Sut = DomainDriver<ReceiveWatch>;

const T0: f64 = 1_754_700_000_000.0;

fn token(id: &str, symbol: &str, balance: f64, price: Option<f64>) -> TokenSnapshot {
    TokenSnapshot {
        id: id.to_owned(),
        symbol: symbol.to_owned(),
        chain_id: 8453,
        balance,
        price_usd: price,
    }
}

fn fetched(tokens: Vec<TokenSnapshot>, now_ms: f64) -> Res {
    Res::TokensFetched { tokens, now_ms }
}

/// Start the watcher and settle the baseline at `T0`.
fn baselined(tokens: Vec<TokenSnapshot>) -> Sut {
    let mut sut = Sut::new();
    let ops = sut.dispatch(Event::Start);
    assert_eq!(ops, vec![Op::FetchTokens]);
    let ops = sut.resolve(fetched(tokens, T0));
    assert_eq!(ops, vec![Op::Wait { ms: 3_000 }], "fast phase first");
    sut
}

/// Let one wait elapse and issue the next fetch.
fn tick(sut: &mut Sut, now_ms: f64) {
    let ops = sut.resolve(Res::Waited { now_ms });
    assert_eq!(ops, vec![Op::FetchTokens]);
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

/// FR-010 — the first fetch only records; nothing is ever reported from it.
#[test]
fn first_fetch_establishes_baseline_without_reporting() {
    let sut = baselined(vec![token("base_usdc", "USDC", 100.0, Some(1.0))]);
    let view = sut.view();
    assert!(!view.detected);
    assert!(view.deposits.is_empty());
}

/// FR-010 — a balance increase vs baseline is exactly one entry, with the
/// delta, the chain and the USD value of the delta.
#[test]
fn increase_reports_one_entry_and_advances_baseline() {
    let mut sut = baselined(vec![token("base_usdc", "USDC", 100.0, Some(1.0))]);
    tick(&mut sut, T0 + 3_000.0);

    let ops = sut.resolve(fetched(
        vec![token("base_usdc", "USDC", 130.0, Some(1.0))],
        T0 + 3_500.0,
    ));
    assert_eq!(
        ops,
        vec![Op::SignalDeposit, Op::Wait { ms: 3_000 }],
        "buzz, then keep listening"
    );

    let view = sut.view();
    assert!(view.detected);
    assert_eq!(view.deposits.len(), 1);
    let entry = &view.deposits[0];
    assert_eq!(entry.at_epoch_ms, T0 + 3_500.0);
    assert_eq!(entry.items.len(), 1);
    assert_eq!(entry.items[0].symbol, "USDC");
    assert!((entry.items[0].amount - 30.0).abs() < 1e-9);
    assert_eq!(entry.items[0].usd, Some(30.0));

    // Baseline advanced: the same balance again reports nothing.
    sut.resolve(Res::Signalled);
    tick(&mut sut, T0 + 6_500.0);
    let ops = sut.resolve(fetched(
        vec![token("base_usdc", "USDC", 130.0, Some(1.0))],
        T0 + 7_000.0,
    ));
    assert_eq!(ops, vec![Op::Wait { ms: 3_000 }], "no second report");
    assert_eq!(sut.view().deposits.len(), 1);
}

/// A token absent from the baseline counts from zero — a brand-new holding IS
/// a deposit. (`prevMap.get(...) ?? 0` today.)
#[test]
fn brand_new_token_counts_from_zero() {
    let mut sut = baselined(vec![token("base_usdc", "USDC", 100.0, Some(1.0))]);
    tick(&mut sut, T0 + 3_000.0);
    sut.resolve(fetched(
        vec![
            token("base_usdc", "USDC", 100.0, Some(1.0)),
            token("base_dai", "DAI", 5.0, None),
        ],
        T0 + 3_500.0,
    ));
    let view = sut.view();
    assert_eq!(view.deposits.len(), 1);
    assert_eq!(view.deposits[0].items[0].symbol, "DAI");
    assert!((view.deposits[0].items[0].amount - 5.0).abs() < 1e-9);
    assert_eq!(
        view.deposits[0].items[0].usd, None,
        "unpriced stays unpriced"
    );
}

/// FR-010 — the false-positive guard: fewer tokens than baseline means a
/// chain likely failed; comparing would fabricate deposits, so don't.
#[test]
fn shrunken_result_is_skipped_not_diffed() {
    let mut sut = baselined(vec![
        token("base_usdc", "USDC", 100.0, Some(1.0)),
        token("eth_usdc", "USDC", 50.0, Some(1.0)),
    ]);
    tick(&mut sut, T0 + 3_000.0);

    // One chain's tokens missing, the surviving one LOOKS bigger.
    let ops = sut.resolve(fetched(
        vec![token("base_usdc", "USDC", 500.0, Some(1.0))],
        T0 + 3_500.0,
    ));
    assert_eq!(ops, vec![Op::Wait { ms: 3_000 }]);
    assert!(!sut.view().detected, "a shrunken set must never report");

    // And the baseline did NOT advance to the shrunken set: once the missing
    // chain recovers at the old balances, still nothing is reported.
    tick(&mut sut, T0 + 6_500.0);
    let ops = sut.resolve(fetched(
        vec![
            token("base_usdc", "USDC", 100.0, Some(1.0)),
            token("eth_usdc", "USDC", 50.0, Some(1.0)),
        ],
        T0 + 7_000.0,
    ));
    assert_eq!(ops, vec![Op::Wait { ms: 3_000 }]);
    assert!(!sut.view().detected);
}

/// Decreases are not deposits, and (today's rule, kept deliberately —
/// research.md D6) they do NOT advance the baseline either.
#[test]
fn decrease_reports_nothing_and_keeps_the_old_baseline() {
    let mut sut = baselined(vec![token("base_usdc", "USDC", 100.0, Some(1.0))]);
    tick(&mut sut, T0 + 3_000.0);
    sut.resolve(fetched(
        vec![token("base_usdc", "USDC", 40.0, Some(1.0))],
        T0 + 3_500.0,
    ));
    assert!(!sut.view().detected);

    // Re-deposit up to 90 — still under the old 100 baseline: unnoticed.
    // Inventory open question 11 owns whether this ever changes.
    tick(&mut sut, T0 + 6_500.0);
    sut.resolve(fetched(
        vec![token("base_usdc", "USDC", 90.0, Some(1.0))],
        T0 + 7_000.0,
    ));
    assert!(!sut.view().detected);
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

/// FR-009 — 3s while young, 60s after the first minute, measured from the
/// session's first observed clock.
#[test]
fn cadence_slows_after_the_fast_phase() {
    let mut sut = baselined(vec![]);
    // Just under the boundary: still fast.
    tick(&mut sut, T0 + 59_000.0);
    let ops = sut.resolve(fetched(vec![], T0 + 59_999.0));
    assert_eq!(ops, vec![Op::Wait { ms: 3_000 }]);

    // At the boundary: slow.
    tick(&mut sut, T0 + 60_000.0);
    let ops = sut.resolve(fetched(vec![], T0 + 60_001.0));
    assert_eq!(ops, vec![Op::Wait { ms: 60_000 }]);
}

/// FR-009 — five minutes after the first observation, the watcher stops for
/// good (battery + rate limits; the screen shows what it has).
#[test]
fn watcher_stops_at_five_minutes() {
    let mut sut = baselined(vec![]);
    tick(&mut sut, T0 + 240_000.0);
    let ops = sut.resolve(fetched(vec![], T0 + 300_000.0));
    assert!(ops.is_empty(), "no wait scheduled at the deadline");

    // And the machine is inert from here on.
    assert!(sut.dispatch(Event::Start).is_empty());
}

/// A failed fetch reports nothing and keeps the cadence going.
#[test]
fn fetch_failure_reschedules_silently() {
    let mut sut = baselined(vec![token("base_usdc", "USDC", 100.0, Some(1.0))]);
    tick(&mut sut, T0 + 3_000.0);
    let ops = sut.resolve(Res::FetchFailed {
        now_ms: T0 + 3_500.0,
    });
    assert_eq!(ops, vec![Op::Wait { ms: 3_000 }]);
    assert!(!sut.view().detected);
}

/// research.md D6 — a tick that finds the app backgrounded ends the watcher,
/// exactly as today's early-return (no reschedule) does.
#[test]
fn backgrounded_tick_stops_the_watcher() {
    let mut sut = baselined(vec![]);
    tick(&mut sut, T0 + 3_000.0);
    let ops = sut.resolve(Res::Inactive);
    assert!(ops.is_empty(), "no reschedule after an inactive tick");
}

/// One session is one account: `start` is single-shot, so a stray second
/// start can never double the polling loops.
#[test]
fn start_is_single_shot() {
    let mut sut = baselined(vec![]);
    assert!(sut.dispatch(Event::Start).is_empty());
}
