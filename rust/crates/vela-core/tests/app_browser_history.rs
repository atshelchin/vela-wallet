//! Rules of the in-app browser history — inventory invariants ①-⑤, one test
//! per rule, plus the ported quirks (always-write delete, remove-not-write
//! clear, uncapped hydration, recency-sorted view over stored order).
//!
//! The fake clock is just `now_ms` on `VisitRecorded` — the core never owns
//! time (invariant ⑤; `browser-history.ts` was already written that way).

#![cfg(feature = "crux")]

mod support;

use support::DomainDriver;
use vela_core::app::browser_history::{
    BhistEntry, BhistOperation as Op, BhistShellResult as Res, BrowserHistory, Event, CAP,
};

type Sut = DomainDriver<BrowserHistory>;

const T0: f64 = 1_754_700_000_000.0;

fn visit(url: &str, title: Option<&str>, favicon: Option<&str>, now_ms: f64) -> Event {
    Event::VisitRecorded {
        url: url.to_owned(),
        title: title.map(str::to_owned),
        favicon: favicon.map(str::to_owned),
        now_ms,
    }
}

fn entry(origin: &str, url: &str, host: &str, title: &str, favicon: &str, at: f64) -> BhistEntry {
    BhistEntry {
        origin: origin.to_owned(),
        url: url.to_owned(),
        host: host.to_owned(),
        title: title.to_owned(),
        favicon: favicon.to_owned(),
        last_visited_ms: at,
    }
}

/// Start the machine and hydrate it with `stored`.
fn ready(stored: Vec<BhistEntry>) -> Sut {
    let mut sut = Sut::new();
    let ops = sut.dispatch(Event::Start);
    assert_eq!(ops, vec![Op::ReadHistory]);
    let ops = sut.resolve(Res::Loaded { entries: stored });
    assert!(ops.is_empty(), "hydration only renders");
    sut
}

/// The single `WriteHistory` a mutation must have produced.
fn written(ops: Vec<Op>) -> Vec<BhistEntry> {
    match ops.as_slice() {
        [Op::WriteHistory { entries }] => entries.clone(),
        other => panic!("expected exactly one WriteHistory, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/// Start reads `vela.browserHistory` once; the view shows what was stored.
#[test]
fn start_hydrates_from_the_store() {
    let a = entry("https://a.io", "https://a.io/x", "a.io", "A", "", T0 + 1_000.0);
    let b = entry("https://b.io", "https://b.io/", "b.io", "B", "", T0);
    let sut = ready(vec![a.clone(), b.clone()]);
    assert_eq!(sut.view().entries, vec![a, b]);
}

/// Start is single-shot — a second one issues nothing (the mirror is already
/// authoritative; re-reading could only replay this core's own writes).
#[test]
fn start_is_single_shot() {
    let mut sut = ready(vec![]);
    assert!(sut.dispatch(Event::Start).is_empty());
}

/// Mutations before hydration are dropped, fail-closed. (Every TS mutator
/// `await`ed its read first; here the shell dispatches Start at mount, long
/// before any page can settle.)
#[test]
fn mutations_before_hydration_are_dropped() {
    let mut sut = Sut::new();
    assert!(sut
        .dispatch(visit("https://a.io/", Some("A"), None, T0))
        .is_empty());
    assert!(sut
        .dispatch(Event::DeleteOrigin { origin: "https://a.io".to_owned() })
        .is_empty());
    assert!(sut.dispatch(Event::ClearAll).is_empty());

    // Mid-hydration too: the read is in flight, the mirror not yet live.
    assert_eq!(sut.dispatch(Event::Start), vec![Op::ReadHistory]);
    assert!(sut
        .dispatch(visit("https://a.io/", Some("A"), None, T0))
        .is_empty());
    sut.resolve(Res::Loaded { entries: vec![] });
    assert!(sut.view().entries.is_empty(), "nothing leaked through the gate");
}

// ---------------------------------------------------------------------------
// Invariant ① — only real web origins
// ---------------------------------------------------------------------------

/// A parseable web URL is recorded under its `scheme://host` origin, keeping
/// the FULL raw url (revisiting reopens where the user left off).
#[test]
fn visit_records_the_origin_not_the_page() {
    let mut sut = ready(vec![]);
    let ops = sut.dispatch(visit(
        "https://App.Uniswap.ORG/swap?inputCurrency=ETH",
        Some("Uniswap"),
        None,
        T0,
    ));
    let stored = written(ops);
    assert_eq!(
        stored,
        vec![entry(
            "https://app.uniswap.org",
            "https://App.Uniswap.ORG/swap?inputCurrency=ETH",
            "app.uniswap.org",
            "Uniswap",
            "",
            T0,
        )],
        "origin/host lowercased, raw url kept verbatim"
    );
    assert_eq!(sut.view().entries, stored);
}

/// Unparseable and authority-less URLs are dropped — no entry, no write.
/// (`about:blank`/`javascript:` DO parse in WHATWG and would be recorded as
/// `about://`-style junk origins today; inventory invariant ① reads 只记真实
/// web origin, so the port fail-closes on anything without `://`.)
#[test]
fn non_web_urls_are_dropped() {
    let mut sut = ready(vec![]);
    for url in [
        "",
        "not a url",
        "about:blank",
        "javascript:alert(1)",
        "https://",              // empty authority
        "https:example.com",     // slash-less special-scheme form
        "https://exa mple.com/", // whitespace in host
        "https://x.io:70000/",   // port out of range
        "https://x.io:8a/",      // non-numeric port
        "1https://x.io/",        // scheme must start alphabetic
    ] {
        let ops = sut.dispatch(visit(url, Some("T"), Some("F"), T0));
        assert!(ops.is_empty(), "{url:?} must not be recorded");
    }
    assert!(sut.view().entries.is_empty());
}

/// The accepted set matches `new URL` where it matters: default ports strip,
/// non-default (and non-special-scheme) ports keep, userinfo drops at the
/// last `@`, IPv6 keeps its brackets. A non-web scheme WITH an authority is
/// recorded — ported verbatim (the TS accepts anything `new URL` parses).
#[test]
fn host_normalization_matches_the_url_parser() {
    let cases: &[(&str, &str, &str)] = &[
        ("https://x.io:443/a", "https://x.io", "x.io"),
        ("http://x.io:0080/", "http://x.io", "x.io"),
        ("http://localhost:8080/dev", "http://localhost:8080", "localhost:8080"),
        ("https://x.io:/a", "https://x.io", "x.io"),
        ("https://user:pw@x.io/", "https://x.io", "x.io"),
        ("https://trusted.org@evil.com/", "https://evil.com", "evil.com"),
        ("https://[::1]:8443/", "https://[::1]:8443", "[::1]:8443"),
        ("wss://relay.x.io/", "wss://relay.x.io", "relay.x.io"),
        ("velawallet://sign:80", "velawallet://sign:80", "sign:80"),
        ("  https://x.io/padded  ", "https://x.io", "x.io"),
    ];
    for (url, origin, host) in cases {
        let mut sut = ready(vec![]);
        let stored = written(sut.dispatch(visit(url, Some("T"), None, T0)));
        assert_eq!(stored.len(), 1, "{url:?}");
        assert_eq!(stored[0].origin, *origin, "{url:?}");
        assert_eq!(stored[0].host, *host, "{url:?}");
    }
}

// ---------------------------------------------------------------------------
// Invariant ② — one entry per origin, revisits bump to the top
// ---------------------------------------------------------------------------

/// A revisit of the same origin — even a different path — updates the single
/// entry in place and moves it to the front: the list reads as "dApps I've
/// used", never a page log.
#[test]
fn one_entry_per_origin_and_revisit_moves_to_front() {
    let mut sut = ready(vec![]);
    sut.dispatch(visit("https://a.io/one", Some("A"), None, T0));
    sut.dispatch(visit("https://b.io/", Some("B"), None, T0 + 1_000.0));
    let stored = written(sut.dispatch(visit(
        "https://a.io/two?tab=pool",
        Some("A2"),
        None,
        T0 + 2_000.0,
    )));

    assert_eq!(stored.len(), 2, "same origin never duplicates");
    assert_eq!(stored[0].origin, "https://a.io");
    assert_eq!(stored[0].url, "https://a.io/two?tab=pool", "latest url wins");
    assert_eq!(stored[0].title, "A2");
    assert_eq!(stored[0].last_visited_ms, T0 + 2_000.0);
    assert_eq!(stored[1].origin, "https://b.io");
    assert_eq!(sut.view().entries, stored);
}

// ---------------------------------------------------------------------------
// Invariant ③ — an update without title/favicon keeps the captured ones
// ---------------------------------------------------------------------------

/// The favicon resolves a beat after the title (browser.tsx fires the record
/// twice per page) — a later bare update must keep both captured values. The
/// JS `||` chain treats an EMPTY string exactly like an absent one, ported
/// verbatim.
#[test]
fn bare_revisit_keeps_old_title_and_favicon() {
    let mut sut = ready(vec![]);
    sut.dispatch(visit(
        "https://a.io/",
        Some("Aave"),
        Some("https://a.io/icon.png"),
        T0,
    ));

    // None AND Some("") both fall through to the stored values.
    for (title, favicon, at) in [
        (None, None, T0 + 1_000.0),
        (Some(""), Some(""), T0 + 2_000.0),
    ] {
        let stored = written(sut.dispatch(visit("https://a.io/markets", title, favicon, at)));
        assert_eq!(stored[0].title, "Aave", "title survived the bare update");
        assert_eq!(stored[0].favicon, "https://a.io/icon.png");
        assert_eq!(stored[0].last_visited_ms, at, "but the visit still bumped");
    }

    // A fresh title updates alone; the favicon stays.
    let stored = written(sut.dispatch(visit(
        "https://a.io/gov",
        Some("Aave Governance"),
        None,
        T0 + 3_000.0,
    )));
    assert_eq!(stored[0].title, "Aave Governance");
    assert_eq!(stored[0].favicon, "https://a.io/icon.png");
}

/// First contact with no title falls back to the host; no favicon is the
/// empty string (the TS shape).
#[test]
fn first_visit_falls_back_to_host_title() {
    let mut sut = ready(vec![]);
    let stored = written(sut.dispatch(visit("http://localhost:8080/dev", None, None, T0)));
    assert_eq!(stored[0].title, "localhost:8080", "hostOf(url) fallback");
    assert_eq!(stored[0].favicon, "");
}

// ---------------------------------------------------------------------------
// Invariant ④ — cap 40
// ---------------------------------------------------------------------------

/// The 41st distinct origin trims the stored tail (the least recent entry);
/// a revisit inside a full list loses nothing.
#[test]
fn cap_40_trims_the_stored_tail() {
    let mut sut = ready(vec![]);
    for i in 0..CAP {
        sut.dispatch(visit(
            &format!("https://d{i:02}.io/"),
            Some(&format!("D{i:02}")),
            None,
            T0 + i as f64,
        ));
    }
    assert_eq!(sut.view().entries.len(), CAP);

    // A revisit while full: still 40, nothing dropped.
    let stored = written(sut.dispatch(visit("https://d05.io/again", None, None, T0 + 100.0)));
    assert_eq!(stored.len(), CAP);
    assert!(stored.iter().any(|e| e.origin == "https://d00.io"));

    // A NEW origin while full: the oldest stored entry falls off.
    let stored = written(sut.dispatch(visit("https://new.io/", Some("New"), None, T0 + 101.0)));
    assert_eq!(stored.len(), CAP);
    assert_eq!(stored[0].origin, "https://new.io");
    assert!(
        !stored.iter().any(|e| e.origin == "https://d00.io"),
        "the tail entry was trimmed"
    );
}

/// The TS `read()` never slices — a legacy over-cap store shows in full
/// until the next write trims it. Ported verbatim.
#[test]
fn over_cap_store_shows_in_full_until_the_next_write() {
    let over: Vec<BhistEntry> = (0..CAP + 1)
        .map(|i| {
            entry(
                &format!("https://d{i:02}.io"),
                &format!("https://d{i:02}.io/"),
                &format!("d{i:02}.io"),
                "T",
                "",
                T0 + (CAP + 1 - i) as f64,
            )
        })
        .collect();
    let mut sut = ready(over);
    assert_eq!(sut.view().entries.len(), CAP + 1, "hydration does not cap");

    // One visit re-mirrors the store: 42 becomes 40 (`slice(0, 40)`).
    let stored = written(sut.dispatch(visit("https://new.io/", Some("New"), None, T0 + 100.0)));
    assert_eq!(stored.len(), CAP);
    assert_eq!(stored[0].origin, "https://new.io");
    assert_eq!(sut.view().entries.len(), CAP);
}

// ---------------------------------------------------------------------------
// Invariant ⑤ — time is injected
// ---------------------------------------------------------------------------

/// `last_visited_ms` is exactly the injected stamp, and the VIEW sorts by it
/// — so when the injected clock runs backwards, stored order (prepend) and
/// recency order differ, and recency wins on screen. Ported verbatim
/// (`getBrowserHistory` sorts; `write` keeps prepend order).
#[test]
fn injected_time_owns_recency_order() {
    let mut sut = ready(vec![]);
    sut.dispatch(visit("https://a.io/", Some("A"), None, T0 + 1_000.0));
    // Clock ran backwards for the second visit.
    let stored = written(sut.dispatch(visit("https://b.io/", Some("B"), None, T0)));

    // Stored order: prepend order — B first.
    assert_eq!(stored[0].origin, "https://b.io");
    assert_eq!(stored[0].last_visited_ms, T0);
    assert_eq!(stored[1].last_visited_ms, T0 + 1_000.0);

    // View order: recency — A first.
    let view = sut.view();
    assert_eq!(view.entries[0].origin, "https://a.io");
    assert_eq!(view.entries[1].origin, "https://b.io");
}

// ---------------------------------------------------------------------------
// Delete / clear
// ---------------------------------------------------------------------------

/// Deleting an origin removes exactly that entry — and writes even when
/// nothing matched (the TS delete always writes; ported verbatim).
#[test]
fn delete_origin_removes_one_and_always_writes() {
    let mut sut = ready(vec![]);
    sut.dispatch(visit("https://a.io/", Some("A"), None, T0));
    sut.dispatch(visit("https://b.io/", Some("B"), None, T0 + 1_000.0));

    let stored = written(sut.dispatch(Event::DeleteOrigin {
        origin: "https://a.io".to_owned(),
    }));
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].origin, "https://b.io");

    let stored = written(sut.dispatch(Event::DeleteOrigin {
        origin: "https://unknown.io".to_owned(),
    }));
    assert_eq!(stored.len(), 1, "no match still mirrors the unchanged list");
}

/// Clearing removes the stored KEY (never writes `[]`) and empties the view;
/// the machine keeps working afterwards.
#[test]
fn clear_all_removes_the_key() {
    let mut sut = ready(vec![]);
    sut.dispatch(visit("https://a.io/", Some("A"), None, T0));

    let ops = sut.dispatch(Event::ClearAll);
    assert_eq!(ops, vec![Op::RemoveHistory]);
    assert!(sut.view().entries.is_empty());

    let stored = written(sut.dispatch(visit("https://b.io/", Some("B"), None, T0 + 1_000.0)));
    assert_eq!(stored.len(), 1, "history restarts cleanly after a clear");
}

// ---------------------------------------------------------------------------
// Acks and stale results
// ---------------------------------------------------------------------------

/// Best-effort write acks never change state; a `Loaded` arriving once the
/// mirror is live (a confused shell answering the wrong shape) is dropped
/// rather than clobbering the mirror.
#[test]
fn acks_and_wrong_shaped_results_never_mutate() {
    let mut sut = ready(vec![]);
    sut.dispatch(visit("https://a.io/", Some("A"), None, T0));
    let before = sut.view();

    assert!(sut.resolve(Res::Written).is_empty());
    assert_eq!(sut.view(), before);

    // Answer a later write's ack with a bogus Loaded: phase is Ready, so it
    // must be ignored.
    sut.dispatch(visit("https://b.io/", Some("B"), None, T0 + 1_000.0));
    let before = sut.view();
    let ops = sut.resolve(Res::Loaded {
        entries: vec![entry("https://evil.io", "https://evil.io/", "evil.io", "E", "", T0)],
    });
    assert!(ops.is_empty());
    assert_eq!(sut.view(), before, "the mirror was not clobbered");
}
