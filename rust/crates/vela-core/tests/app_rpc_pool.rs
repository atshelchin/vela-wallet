//! Rules of the rpc_pool machine, one test per rule.
//!
//! The pure classifiers and scoring are pinned with vectors lifted from the
//! TS source's own wording (`src/services/rpc-pool.ts`, `src/services/net.ts`)
//! so the Rust port and the shipped behavior can never drift silently. The
//! machine tests drive routed calls exactly the way the shell will: dispatch
//! `CallRequested`, answer the operations one at a time, and let jitter and
//! clock values ride in on the results (no clock, no randomness in the core).
//!
//! Inventory invariants ①–⑧ each have at least one test named after the rule.

#![cfg(feature = "crux")]

mod support;

use support::DomainDriver;
use vela_core::app::rpc_pool::{
    backoff_with_jitter_ms, cooldown_ms, endpoint_score, get_logs_range_cap, is_ban_active,
    is_permanent_rpc_error, is_rate_limit_signal, is_transient_server_error,
    qualifies_for_perma_ban, record_failure, record_success, select_urls, source_priority,
    strip_chain_suffix, Event, RpcBanEntry, RpcCallVerdict, RpcEndpointSeed, RpcEndpointStats,
    RpcErrorInfo, RpcKind, RpcOperation as Op, RpcPool, RpcShellResult as Res, RpcSource,
    RpcTransportOutcome as Out, BUNDLER_RPC_TIMEOUT_MS, PERMA_BAN_TTL_MS, PING_TIMEOUT_MS,
    RPC_READ_TIMEOUT_MS, TEMP_BAN_TTL_MS,
};

type Sut = DomainDriver<RpcPool>;

const CHAIN: u32 = 56;
const USER: &str = "https://user.example/rpc";
const PUB1: &str = "https://pub1.example";
const PUB2: &str = "https://pub2.example";
const BUSER: &str = "https://bundler.example/56";
const BRELAY: &str = "https://relay.example/56";
const T0: f64 = 1_700_000_000_000.0;
const HOUR: f64 = 3_600_000.0;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

fn seed(url: &str, source: RpcSource) -> RpcEndpointSeed {
    RpcEndpointSeed {
        url: url.to_owned(),
        source,
    }
}

fn stats(url: &str, source: RpcSource) -> RpcEndpointStats {
    RpcEndpointStats::new(url.to_owned(), source)
}

fn temp_ban(url: &str, at: f64) -> RpcBanEntry {
    RpcBanEntry {
        url: url.to_owned(),
        banned_at_ms: at,
        permanent: false,
    }
}

fn perma_ban(url: &str, at: f64) -> RpcBanEntry {
    RpcBanEntry {
        url: url.to_owned(),
        banned_at_ms: at,
        permanent: true,
    }
}

fn err(code: Option<i32>, message: &str) -> RpcErrorInfo {
    RpcErrorInfo {
        code,
        message: Some(message.to_owned()),
    }
}

fn rpc_call(id: &str, method: &str, now: f64) -> Event {
    Event::CallRequested {
        call_id: id.to_owned(),
        chain_id: CHAIN,
        kind: RpcKind::Rpc,
        method: method.to_owned(),
        now_ms: now,
    }
}

fn bundler_call(id: &str, now: f64) -> Event {
    Event::CallRequested {
        call_id: id.to_owned(),
        chain_id: CHAIN,
        kind: RpcKind::Bundler,
        method: "eth_sendUserOperation".to_owned(),
        now_ms: now,
    }
}

fn config(rpc: Vec<RpcEndpointSeed>, bundler: Vec<RpcEndpointSeed>, now: f64) -> Res {
    Res::PoolConfig {
        chain_id: CHAIN,
        rpc_endpoints: rpc,
        bundler_endpoints: bundler,
        now_ms: now,
    }
}

/// Three RPC tiers + two bundlers — the standard fixture.
fn config3(now: f64) -> Res {
    config(
        vec![
            seed(USER, RpcSource::User),
            seed(PUB1, RpcSource::Public),
            seed(PUB2, RpcSource::Public),
        ],
        vec![seed(BUSER, RpcSource::User), seed(BRELAY, RpcSource::Builtin)],
        now,
    )
}

/// Two RPC endpoints (user + public), builtin bundler.
fn config2(now: f64) -> Res {
    config(
        vec![seed(USER, RpcSource::User), seed(PUB1, RpcSource::Public)],
        vec![seed(BRELAY, RpcSource::Builtin)],
        now,
    )
}

/// One lone public RPC endpoint — the shortest sweep.
fn config1(now: f64) -> Res {
    config(
        vec![seed(PUB1, RpcSource::Public)],
        vec![seed(BRELAY, RpcSource::Builtin)],
        now,
    )
}

fn outcome(id: &str, url: &str, out: Out, latency: f64, now: f64) -> Res {
    Res::PostOutcome {
        call_id: id.to_owned(),
        url: url.to_owned(),
        outcome: out,
        latency_ms: latency,
        now_ms: now,
    }
}

fn ok() -> Out {
    Out::Response { error: None }
}

fn rpc_err(code: Option<i32>, message: &str) -> Out {
    Out::Response {
        error: Some(err(code, message)),
    }
}

fn rpc_post(id: &str, url: &str, method: &str) -> Op {
    Op::JsonRpcPost {
        call_id: id.to_owned(),
        url: url.to_owned(),
        method: method.to_owned(),
        x_rpc_url: None,
        timeout_ms: RPC_READ_TIMEOUT_MS,
    }
}

fn bundler_post(id: &str, url: &str, x: Option<&str>) -> Op {
    Op::JsonRpcPost {
        call_id: id.to_owned(),
        url: url.to_owned(),
        method: "eth_sendUserOperation".to_owned(),
        x_rpc_url: x.map(str::to_owned),
        timeout_ms: BUNDLER_RPC_TIMEOUT_MS,
    }
}

fn probe(url: &str) -> Op {
    Op::ProbeChainId {
        chain_id: CHAIN,
        url: url.to_owned(),
        timeout_ms: PING_TIMEOUT_MS,
    }
}

fn probed(url: &str, reported: Option<u32>, latency: f64, now: f64) -> Res {
    Res::ChainIdProbed {
        chain_id: CHAIN,
        url: url.to_owned(),
        reported,
        latency_ms: latency,
        now_ms: now,
    }
}

fn respond(id: &str, url: &str) -> Op {
    Op::Conclude {
        call_id: id.to_owned(),
        verdict: RpcCallVerdict::Respond {
            url: url.to_owned(),
        },
    }
}

/// Drive a fresh machine through one successful `eth_call` so the pool is
/// loaded and `USER` holds one success (calls=1, EMA 50ms).
fn loaded(now: f64) -> Sut {
    let mut sut = Sut::new();
    let ops = sut.dispatch(rpc_call("c0", "eth_call", now));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    let ops = sut.resolve(config3(now));
    assert_eq!(ops, vec![rpc_post("c0", USER, "eth_call")]);
    let ops = sut.resolve(outcome("c0", USER, ok(), 50.0, now));
    assert_eq!(ops, vec![respond("c0", USER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());
    sut
}

// ===========================================================================
// Pure scoring / classification — vectors pinned verbatim
// ===========================================================================

/// `SOURCE_PRIORITY` (`rpc-pool.ts:387-394`).
#[test]
fn source_priority_table_is_verbatim() {
    assert_eq!(source_priority(RpcSource::User), 10_000.0);
    assert_eq!(source_priority(RpcSource::Provider), 9_000.0);
    assert_eq!(source_priority(RpcSource::Default), 1_000.0);
    assert_eq!(source_priority(RpcSource::Public), 500.0);
    assert_eq!(source_priority(RpcSource::Builtin), 100.0);
    assert_eq!(source_priority(RpcSource::Fallback), 10.0);
}

/// Latency penalty: -1 per 10ms above 200ms, capped at 200; reliability
/// bonus +1 per success capped at 50 (`endpointScore`).
#[test]
fn endpoint_score_latency_penalty_and_reliability_bonus() {
    let mut ep = stats(PUB1, RpcSource::Public);
    assert_eq!(endpoint_score(&ep, T0), 500.0);
    ep.avg_latency_ms = 200.0; // exactly at the threshold: free
    assert_eq!(endpoint_score(&ep, T0), 500.0);
    ep.avg_latency_ms = 300.0;
    assert_eq!(endpoint_score(&ep, T0), 490.0);
    ep.avg_latency_ms = 5_000.0; // penalty capped at 200
    assert_eq!(endpoint_score(&ep, T0), 300.0);
    // NaN/Infinity guard: treated as no latency data.
    ep.avg_latency_ms = f64::INFINITY;
    assert_eq!(endpoint_score(&ep, T0), 500.0);
    // Reliability bonus caps at 50.
    ep.avg_latency_ms = 0.0;
    ep.total_calls = 500;
    ep.total_failures = 0;
    assert_eq!(endpoint_score(&ep, T0), 550.0);
}

/// The exponential cooldown enters the core: 30s · 2^(n-1) capped at 300s;
/// -50_000 while cooling down, -200·n afterwards.
#[test]
fn endpoint_score_cooldown_doubles_from_30s_and_caps_at_300s() {
    assert_eq!(cooldown_ms(0), 0.0);
    assert_eq!(cooldown_ms(1), 30_000.0);
    assert_eq!(cooldown_ms(2), 60_000.0);
    assert_eq!(cooldown_ms(4), 240_000.0);
    assert_eq!(cooldown_ms(5), 300_000.0); // min(480s, 300s)
    assert_eq!(cooldown_ms(30), 300_000.0);

    let mut ep = stats(USER, RpcSource::User);
    ep.total_calls = 1;
    ep.total_failures = 1;
    ep.consecutive_failures = 1;
    ep.last_failure_at_ms = T0;
    // Inside the 30s window: effectively disabled.
    assert_eq!(endpoint_score(&ep, T0 + 10_000.0), -40_000.0);
    // At exactly 30s the window has elapsed: the milder per-failure penalty.
    assert_eq!(endpoint_score(&ep, T0 + 30_000.0), 9_800.0);
}

/// `recordSuccess`'s EMA: first sample as-is, then 0.7/0.3.
#[test]
fn ema_latency_first_sample_then_70_30() {
    let mut ep = stats(PUB1, RpcSource::Public);
    record_success(&mut ep, 100.0);
    assert_eq!(ep.avg_latency_ms, 100.0);
    record_success(&mut ep, 200.0);
    assert_eq!(ep.avg_latency_ms, 130.0);
    assert_eq!(ep.total_calls, 2);
    assert_eq!(ep.consecutive_failures, 0);

    record_failure(&mut ep, T0);
    assert_eq!(ep.consecutive_failures, 1);
    assert_eq!(ep.last_failure_at_ms, T0);
    assert_eq!(ep.avg_latency_ms, 130.0); // failures never touch the EMA
    record_success(&mut ep, 130.0);
    assert_eq!(ep.consecutive_failures, 0); // success resets the streak
}

/// `isPermanentRpcError`'s vocabulary, verbatim.
#[test]
fn permanent_error_vocabulary_is_verbatim() {
    for message in [
        "Unauthorized request",
        "invalid API key",
        "please authenticate first",
        "403 Forbidden",
        "Payment Required",
        "daily request count exceeded",
        "requires an active subscription",
        "Please specify an address in your query",
        "order a dedicated full node",
    ] {
        assert!(is_permanent_rpc_error(&err(None, message)), "{message}");
    }
    assert!(!is_permanent_rpc_error(&err(None, "execution reverted")));
    assert!(!is_permanent_rpc_error(&err(Some(-32000), "")));
    assert!(!is_permanent_rpc_error(&RpcErrorInfo {
        code: Some(-32000),
        message: None
    }));
}

/// `isTransientServerError`: execution words are excluded FIRST, then the
/// server-error code band, then the message list.
#[test]
fn transient_error_excludes_execution_words_and_matches_server_codes() {
    assert!(is_transient_server_error(&err(Some(-32603), "")));
    assert!(is_transient_server_error(&err(Some(-32000), "")));
    assert!(is_transient_server_error(&err(Some(-32099), "")));
    assert!(!is_transient_server_error(&err(Some(-32100), "")));
    // The exclusion wins even when a server-error code rides along.
    assert!(!is_transient_server_error(&err(
        Some(-32603),
        "execution reverted"
    )));
    assert!(!is_transient_server_error(&err(None, "out of gas")));
    for message in [
        "internal error",
        "server error",
        "service unavailable",
        "temporarily unavailable",
        "too many requests",
    ] {
        assert!(is_transient_server_error(&err(None, message)), "{message}");
    }
    assert!(!is_transient_server_error(&err(None, "unknown method")));
}

/// `isRateLimitSignal`: quota wording plus the provider codes.
#[test]
fn rate_limit_signal_codes_and_messages() {
    for message in [
        "rate limit reached",
        "rate-limited",
        "too many requests",
        "usage limit exceeded",
        "monthly quota",
        "daily credits exceeded",
    ] {
        assert!(is_rate_limit_signal(&err(None, message)), "{message}");
    }
    for code in [-32005, -32001, -32029] {
        assert!(is_rate_limit_signal(&err(Some(code), "")), "{code}");
    }
    assert!(!is_rate_limit_signal(&err(Some(-32000), "server error")));
}

/// `getLogsRangeCap` vectors, including the greedy-number quirk.
#[test]
fn get_logs_range_cap_vectors() {
    // Not a range error at all.
    assert_eq!(get_logs_range_cap(&err(Some(-32000), "invalid params")), None);
    assert_eq!(
        get_logs_range_cap(&RpcErrorInfo {
            code: Some(-32000),
            message: None
        }),
        None
    );
    // Result-count caps signal "halve" (0), and take precedence over range
    // wording.
    assert_eq!(
        get_logs_range_cap(&err(None, "query returned more than 10000 results")),
        Some(0.0)
    );
    assert_eq!(
        get_logs_range_cap(&err(None, "too many results in block range")),
        Some(0.0)
    );
    // Stated block spans are recovered, honouring k/m suffixes.
    assert_eq!(
        get_logs_range_cap(&err(None, "this node is limited to a 100 block range")),
        Some(100.0)
    );
    assert_eq!(
        get_logs_range_cap(&err(None, "up to a 2k block range")),
        Some(2_000.0)
    );
    assert_eq!(
        get_logs_range_cap(&err(None, "block range exceeded: maximum is 500")),
        Some(500.0)
    );
    // Range error with no usable number → halve.
    assert_eq!(
        get_logs_range_cap(&err(None, "block range is too wide")),
        Some(0.0)
    );
    // Ported verbatim: the first number is taken greedily and a stray
    // 'm' after whitespace acts as a suffix ("got 5000, max 100" →
    // "5000," + the m of "max" → 5e9).
    assert_eq!(
        get_logs_range_cap(&err(None, "block range: got 5000, max 100")),
        Some(5_000_000_000.0)
    );
}

/// `backoffWithJitter`: full jitter over min(cap, base·2^attempt); the
/// random is injected, non-finite values behave like JS `setTimeout(NaN)`.
#[test]
fn backoff_with_jitter_formula() {
    // RPC pass ceilings: ~0–300ms, ~0–600ms, then capped at 1500.
    assert_eq!(backoff_with_jitter_ms(0, 300, 1_500, 0.5), 150);
    assert_eq!(backoff_with_jitter_ms(1, 300, 1_500, 0.5), 300);
    assert_eq!(backoff_with_jitter_ms(3, 300, 1_500, 0.5), 750);
    // Bundler: ceiling always 1000.
    assert_eq!(backoff_with_jitter_ms(0, 1_000, 1_000, 0.999), 999);
    assert_eq!(backoff_with_jitter_ms(0, 300, 1_500, 0.0), 0);
    assert_eq!(backoff_with_jitter_ms(0, 300, 1_500, f64::NAN), 0);
    // Out-of-range injections clamp instead of exploding the delay.
    assert_eq!(backoff_with_jitter_ms(0, 300, 1_500, 2.0), 300);
}

/// Invariant ⑦'s predicate: zero successes AND ≥ 6 failures.
#[test]
fn perma_ban_requires_zero_successes_and_six_failures() {
    assert!(qualifies_for_perma_ban(6, 6));
    assert!(qualifies_for_perma_ban(10, 10));
    assert!(!qualifies_for_perma_ban(5, 5)); // not enough failures
    assert!(!qualifies_for_perma_ban(7, 6)); // one success disqualifies
}

/// Ban TTLs: temp 1h, permanent 24h (invariant ⑦'s second half).
#[test]
fn ban_ttls_temp_one_hour_permanent_24h() {
    let temp = temp_ban(PUB1, T0);
    assert!(is_ban_active(&temp, T0 + TEMP_BAN_TTL_MS - 1.0));
    assert!(!is_ban_active(&temp, T0 + TEMP_BAN_TTL_MS));
    let perma = perma_ban(PUB1, T0);
    assert!(is_ban_active(&perma, T0 + PERMA_BAN_TTL_MS - 1.0));
    assert!(!is_ban_active(&perma, T0 + PERMA_BAN_TTL_MS));
}

/// The pub selection function: banned URLs are excluded outright (invariant
/// ①), the sort is stable so equal scores keep source order.
#[test]
fn select_urls_excludes_banned_and_sorts_stable() {
    let endpoints = vec![
        stats(USER, RpcSource::User),
        stats(PUB1, RpcSource::Public),
        stats(PUB2, RpcSource::Public),
    ];
    let bans = vec![temp_ban(USER, T0)];
    assert_eq!(select_urls(&endpoints, &bans, T0 + 1_000.0), vec![PUB1, PUB2]);
    // An expired ban no longer excludes.
    let bans = vec![temp_ban(USER, T0 - 2.0 * HOUR)];
    assert_eq!(select_urls(&endpoints, &bans, T0), vec![USER, PUB1, PUB2]);
}

/// `getActiveBundlerBaseUrl`'s `/${chainId}/?$` suffix strip.
#[test]
fn strip_chain_suffix_matches_the_regex() {
    assert_eq!(strip_chain_suffix("https://r.example/56", 56), "https://r.example");
    assert_eq!(strip_chain_suffix("https://r.example/56/", 56), "https://r.example");
    assert_eq!(strip_chain_suffix("https://r.example/560", 56), "https://r.example/560");
    assert_eq!(strip_chain_suffix("https://r.example", 56), "https://r.example");
}

// ===========================================================================
// The machine — routed calls
// ===========================================================================

/// Happy path: config load once, best endpoint first, response delivered.
#[test]
fn call_routes_to_highest_score_and_delivers_the_response() {
    let sut = loaded(T0);
    let view = sut.view();
    assert!(view.failed_chains.is_empty());
    assert!(view.rate_limited_chains.is_empty());
    assert!(view.banned.is_empty());
}

/// Invariant ①: a banned endpoint is never selected — not later in the same
/// sweep, not by the next call.
#[test]
fn banned_endpoint_is_never_selected() {
    let mut sut = loaded(T0);
    let ops = sut.dispatch(rpc_call("c1", "eth_call", T0 + 1_000.0));
    assert_eq!(ops, vec![rpc_post("c1", USER, "eth_call")]);
    // HTTP 403 → ban + failover to the next endpoint.
    let ops = sut.resolve(outcome(
        "c1",
        USER,
        Out::HttpError { status: 403 },
        30.0,
        T0 + 1_100.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(USER, T0 + 1_100.0)]
            },
            rpc_post("c1", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("c1", PUB1, ok(), 40.0, T0 + 1_200.0));
    assert_eq!(ops, vec![respond("c1", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());
    // The next call starts at PUB1 — USER is not in the sequence at all.
    let ops = sut.dispatch(rpc_call("c2", "eth_call", T0 + 2_000.0));
    assert_eq!(ops, vec![rpc_post("c2", PUB1, "eth_call")]);
    assert_eq!(sut.view().banned, vec![temp_ban(USER, T0 + 1_100.0)]);
}

/// Execution errors are answers, not faults: delivered verbatim, no ban, no
/// failure recorded.
#[test]
fn execution_error_is_a_valid_answer_not_failover() {
    let mut sut = loaded(T0);
    let ops = sut.dispatch(rpc_call("c1", "eth_call", T0 + 1_000.0));
    assert_eq!(ops, vec![rpc_post("c1", USER, "eth_call")]);
    let ops = sut.resolve(outcome(
        "c1",
        USER,
        rpc_err(Some(3), "execution reverted: ERC20 balance too low"),
        45.0,
        T0 + 1_050.0,
    ));
    assert_eq!(ops, vec![respond("c1", USER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());
    assert!(sut.view().banned.is_empty());
    // No failure was recorded: USER still leads.
    let ops = sut.dispatch(rpc_call("c2", "eth_call", T0 + 2_000.0));
    assert_eq!(ops, vec![rpc_post("c2", USER, "eth_call")]);
}

/// Invariant ⑤: a getLogs range cap goes back to the caller to split — no
/// failover, no ban, and the endpoint records a SUCCESS. The range check
/// outranks the permanent classifier ("exceeded" would otherwise ban a
/// healthy endpoint); the same wording on any other method still bans.
#[test]
fn range_cap_returns_to_caller_without_failover_or_ban() {
    let mut sut = loaded(T0);
    let ops = sut.dispatch(rpc_call("c1", "eth_getLogs", T0 + 1_000.0));
    assert_eq!(ops, vec![rpc_post("c1", USER, "eth_getLogs")]);
    let ops = sut.resolve(outcome(
        "c1",
        USER,
        rpc_err(Some(-32000), "block range exceeded: maximum is 500"),
        60.0,
        T0 + 1_050.0,
    ));
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "c1".to_owned(),
            verdict: RpcCallVerdict::RangeCap {
                url: USER.to_owned(),
                max_span: 500.0
            },
        }]
    );
    assert!(sut.resolve(Res::Concluded).is_empty());
    let view = sut.view();
    assert!(view.banned.is_empty(), "range caps never ban");
    assert!(view.failed_chains.is_empty(), "the chain is healthy");

    // A result-count cap signals "halve".
    let ops = sut.dispatch(rpc_call("c2", "eth_getLogs", T0 + 2_000.0));
    assert_eq!(ops, vec![rpc_post("c2", USER, "eth_getLogs")]);
    let ops = sut.resolve(outcome(
        "c2",
        USER,
        rpc_err(None, "query returned more than 10000 results"),
        50.0,
        T0 + 2_050.0,
    ));
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "c2".to_owned(),
            verdict: RpcCallVerdict::RangeCap {
                url: USER.to_owned(),
                max_span: 0.0
            },
        }]
    );
    assert!(sut.resolve(Res::Concluded).is_empty());

    // The identical wording on a non-getLogs method is a permanent error.
    let ops = sut.dispatch(rpc_call("c3", "eth_call", T0 + 3_000.0));
    assert_eq!(ops, vec![rpc_post("c3", USER, "eth_call")]);
    let ops = sut.resolve(outcome(
        "c3",
        USER,
        rpc_err(Some(-32000), "block range exceeded: maximum is 500"),
        30.0,
        T0 + 3_050.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(USER, T0 + 3_050.0)]
            },
            rpc_post("c3", PUB1, "eth_call"),
        ]
    );
}

/// Invariant ④: rate-limiting is transient and self-healing — the chain is
/// classified `rate_limited` so the UI keeps cached balances and never nags
/// the user to swap RPCs. A later success clears both sets.
#[test]
fn rate_limited_chain_is_transient_never_the_banner() {
    let mut sut = Sut::new();
    let ops = sut.dispatch(rpc_call("c1", "eth_call", T0));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    let ops = sut.resolve(config1(T0));
    assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);

    // Pass 0: 429.
    let ops = sut.resolve(outcome("c1", PUB1, Out::HttpError { status: 429 }, 20.0, T0 + 20.0));
    assert_eq!(ops, vec![Op::DrawJitter { call_id: "c1".to_owned() }]);
    let ops = sut.resolve(Res::Jitter {
        call_id: "c1".to_owned(),
        value: 0.5,
    });
    assert_eq!(
        ops,
        vec![Op::StartBackoff {
            call_id: "c1".to_owned(),
            delay_ms: 150 // floor(0.5 · min(1500, 300·2^0))
        }]
    );
    let ops = sut.resolve(Res::BackoffElapsed {
        call_id: "c1".to_owned(),
        now_ms: T0 + 200.0,
    });
    assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);

    // Pass 1: 429 again.
    let ops = sut.resolve(outcome("c1", PUB1, Out::HttpError { status: 429 }, 20.0, T0 + 250.0));
    assert_eq!(ops, vec![Op::DrawJitter { call_id: "c1".to_owned() }]);
    let ops = sut.resolve(Res::Jitter {
        call_id: "c1".to_owned(),
        value: 0.5,
    });
    assert_eq!(
        ops,
        vec![Op::StartBackoff {
            call_id: "c1".to_owned(),
            delay_ms: 300 // floor(0.5 · min(1500, 300·2^1))
        }]
    );
    let ops = sut.resolve(Res::BackoffElapsed {
        call_id: "c1".to_owned(),
        now_ms: T0 + 600.0,
    });
    assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);

    // Pass 2 (final): 429 → the chain fails RATE-LIMITED.
    let ops = sut.resolve(outcome("c1", PUB1, Out::HttpError { status: 429 }, 20.0, T0 + 700.0));
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "c1".to_owned(),
            verdict: RpcCallVerdict::Failed { rate_limited: true },
        }]
    );
    assert!(sut.resolve(Res::Concluded).is_empty());
    let view = sut.view();
    assert_eq!(view.failed_chains, vec![CHAIN]);
    assert_eq!(view.rate_limited_chains, vec![CHAIN]);
    assert!(view.banned.is_empty(), "429 never hard-bans");

    // A success clears both sets.
    let ops = sut.dispatch(rpc_call("c2", "eth_call", T0 + 1_000.0));
    assert_eq!(ops, vec![rpc_post("c2", PUB1, "eth_call")]);
    let ops = sut.resolve(outcome("c2", PUB1, ok(), 30.0, T0 + 1_050.0));
    assert_eq!(ops, vec![respond("c2", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());
    let view = sut.view();
    assert!(view.failed_chains.is_empty());
    assert!(view.rate_limited_chains.is_empty());
}

/// Ported verbatim: `sawRateLimit` is a per-pass local — only the FINAL
/// pass's observations classify the chain. Two rate-limited passes followed
/// by a network-error pass read as a hard failure.
#[test]
fn final_pass_only_classification_ported_verbatim() {
    let mut sut = Sut::new();
    sut.dispatch(rpc_call("c1", "eth_call", T0));
    let ops = sut.resolve(config1(T0));
    assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);

    for (pass_now, delay) in [(T0 + 20.0, 150), (T0 + 250.0, 300)] {
        let ops = sut.resolve(outcome("c1", PUB1, Out::HttpError { status: 429 }, 20.0, pass_now));
        assert_eq!(ops, vec![Op::DrawJitter { call_id: "c1".to_owned() }]);
        let ops = sut.resolve(Res::Jitter {
            call_id: "c1".to_owned(),
            value: 0.5,
        });
        assert_eq!(
            ops,
            vec![Op::StartBackoff {
                call_id: "c1".to_owned(),
                delay_ms: delay
            }]
        );
        let ops = sut.resolve(Res::BackoffElapsed {
            call_id: "c1".to_owned(),
            now_ms: pass_now + f64::from(delay),
        });
        assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);
    }

    // Final pass: a plain network error — no rate-limit signal.
    let ops = sut.resolve(outcome("c1", PUB1, Out::Network, 0.0, T0 + 700.0));
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "c1".to_owned(),
            verdict: RpcCallVerdict::Failed {
                rate_limited: false
            },
        }]
    );
    let view = sut.view();
    assert_eq!(view.failed_chains, vec![CHAIN]);
    assert!(view.rate_limited_chains.is_empty());
}

/// The bundler path: sweeps its own pool, retries exactly once with the
/// 0–1000ms jitter, and never classifies chains.
#[test]
fn bundler_retries_once_and_never_classifies_chains() {
    let mut sut = Sut::new();
    let ops = sut.dispatch(bundler_call("b1", T0));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    // A single RPC endpoint skips the ping race and is used directly.
    let ops = sut.resolve(config(
        vec![seed(USER, RpcSource::User)],
        vec![seed(BUSER, RpcSource::User), seed(BRELAY, RpcSource::Builtin)],
        T0,
    ));
    assert_eq!(ops, vec![bundler_post("b1", BUSER, Some(USER))]);

    let ops = sut.resolve(outcome("b1", BUSER, Out::Network, 100.0, T0 + 100.0));
    assert_eq!(ops, vec![bundler_post("b1", BRELAY, Some(USER))]);
    let ops = sut.resolve(outcome("b1", BRELAY, Out::Network, 100.0, T0 + 200.0));
    assert_eq!(ops, vec![Op::DrawJitter { call_id: "b1".to_owned() }]);
    let ops = sut.resolve(Res::Jitter {
        call_id: "b1".to_owned(),
        value: 0.5,
    });
    assert_eq!(
        ops,
        vec![Op::StartBackoff {
            call_id: "b1".to_owned(),
            delay_ms: 500 // floor(0.5 · min(1000, 1000·2^0))
        }]
    );
    let ops = sut.resolve(Res::BackoffElapsed {
        call_id: "b1".to_owned(),
        now_ms: T0 + 800.0,
    });
    assert_eq!(ops, vec![bundler_post("b1", BUSER, Some(USER))]);
    let ops = sut.resolve(outcome("b1", BUSER, Out::Network, 100.0, T0 + 900.0));
    assert_eq!(ops, vec![bundler_post("b1", BRELAY, Some(USER))]);
    // Second pass exhausted → done, no third pass.
    let ops = sut.resolve(outcome("b1", BRELAY, Out::Network, 100.0, T0 + 1_000.0));
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "b1".to_owned(),
            verdict: RpcCallVerdict::Failed {
                rate_limited: false
            },
        }]
    );
    // Bundler failures never touch the chain failure sets.
    let view = sut.view();
    assert!(view.failed_chains.is_empty());
    assert!(view.rate_limited_chains.is_empty());
}

/// Invariant ⑥: when every endpoint of the pool is banned, the bans clear
/// and failure counters reset so the chain can recover.
#[test]
fn all_banned_pool_rescues_itself() {
    let mut sut = Sut::new();
    sut.dispatch(rpc_call("c1", "eth_call", T0));
    let ops = sut.resolve(config2(T0));
    assert_eq!(ops, vec![rpc_post("c1", USER, "eth_call")]);
    let ops = sut.resolve(outcome("c1", USER, Out::HttpError { status: 401 }, 10.0, T0 + 10.0));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(USER, T0 + 10.0)]
            },
            rpc_post("c1", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("c1", PUB1, Out::HttpError { status: 403 }, 10.0, T0 + 20.0));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(PUB1, T0 + 20.0), temp_ban(USER, T0 + 10.0)]
            },
            Op::DrawJitter { call_id: "c1".to_owned() },
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(Res::Jitter {
        call_id: "c1".to_owned(),
        value: 0.0,
    });
    assert_eq!(
        ops,
        vec![Op::StartBackoff {
            call_id: "c1".to_owned(),
            delay_ms: 0
        }]
    );
    // The next pass finds everything banned → rescue: bans cleared (and
    // persisted empty), counters reset, the sweep restarts at the top tier.
    let ops = sut.resolve(Res::BackoffElapsed {
        call_id: "c1".to_owned(),
        now_ms: T0 + 30.0,
    });
    assert_eq!(
        ops,
        vec![
            Op::PersistBans { entries: vec![] },
            rpc_post("c1", USER, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("c1", USER, ok(), 40.0, T0 + 70.0));
    assert_eq!(ops, vec![respond("c1", USER)]);
    assert!(sut.view().banned.is_empty());
}

/// Invariant ⑦: an endpoint that NEVER succeeded and failed ≥ 6 times is
/// permanently banned; the permanent ban outlives the 1h temp TTL and
/// expires at 24h.
#[test]
fn perma_ban_zero_success_six_failures_24h_ttl() {
    let mut sut = Sut::new();
    // Five hourly timeout failures on USER (each call reloads the stale
    // pool; merge preserves the accumulating stats).
    for i in 1..=5u32 {
        let t = T0 + f64::from(i) * HOUR;
        let id = format!("c{i}");
        let ops = sut.dispatch(rpc_call(&id, "eth_call", t));
        assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
        let ops = sut.resolve(config2(t));
        assert_eq!(ops, vec![rpc_post(&id, USER, "eth_call")], "call {i}");
        let ops = sut.resolve(outcome(&id, USER, Out::Timeout, 8_000.0, t + 8_000.0));
        assert_eq!(ops, vec![rpc_post(&id, PUB1, "eth_call")]);
        let ops = sut.resolve(outcome(&id, PUB1, ok(), 50.0, t + 8_100.0));
        assert_eq!(ops, vec![respond(&id, PUB1)]);
        assert!(sut.resolve(Res::Concluded).is_empty());
    }

    // The sixth failure is ban-class → 0 successes ∧ 6 failures → PERMANENT.
    let t6 = T0 + 6.0 * HOUR;
    sut.dispatch(rpc_call("c6", "eth_call", t6));
    let ops = sut.resolve(config2(t6));
    assert_eq!(ops, vec![rpc_post("c6", USER, "eth_call")]);
    let ops = sut.resolve(outcome(
        "c6",
        USER,
        rpc_err(None, "invalid API key"),
        30.0,
        t6 + 100.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![perma_ban(USER, t6 + 100.0)]
            },
            rpc_post("c6", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("c6", PUB1, ok(), 50.0, t6 + 200.0));
    assert_eq!(ops, vec![respond("c6", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());
    assert_eq!(sut.view().banned, vec![perma_ban(USER, t6 + 100.0)]);

    // Two hours later a temp ban would be gone — the permanent one is not.
    let t7 = t6 + 2.0 * HOUR;
    sut.dispatch(rpc_call("c7", "eth_call", t7));
    let ops = sut.resolve(config2(t7));
    assert_eq!(ops, vec![rpc_post("c7", PUB1, "eth_call")]);
    let ops = sut.resolve(outcome("c7", PUB1, ok(), 50.0, t7 + 50.0));
    assert_eq!(ops, vec![respond("c7", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // 25h after the ban it has expired (recovery from a transient outage):
    // the prune sweep drops it and USER is selectable again.
    let t8 = t6 + 100.0 + 25.0 * HOUR;
    sut.dispatch(rpc_call("c8", "eth_call", t8));
    let ops = sut.resolve(config2(t8));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans { entries: vec![] },
            rpc_post("c8", USER, "eth_call"),
        ]
    );
}

/// Invariant ⑦'s complement + ⑧: one lifetime success keeps the ban
/// TEMPORARY, and its 1h expiry restores the endpoint at the next selection
/// — no pool rebuild, no rescue, no restart (the single ban truth).
#[test]
fn one_success_means_temp_ban_and_expiry_restores_selection() {
    let mut sut = loaded(T0); // USER holds one success
    for i in 1..=5u32 {
        let t = T0 + f64::from(i) * HOUR;
        let id = format!("c{i}");
        sut.dispatch(rpc_call(&id, "eth_call", t));
        let ops = sut.resolve(config3(t));
        assert_eq!(ops, vec![rpc_post(&id, USER, "eth_call")], "call {i}");
        let ops = sut.resolve(outcome(&id, USER, Out::Timeout, 8_000.0, t + 8_000.0));
        assert_eq!(ops, vec![rpc_post(&id, PUB1, "eth_call")]);
        let ops = sut.resolve(outcome(&id, PUB1, ok(), 50.0, t + 8_100.0));
        assert_eq!(ops, vec![respond(&id, PUB1)]);
        assert!(sut.resolve(Res::Concluded).is_empty());
    }

    // Sixth failure is ban-class, but the endpoint HAS succeeded once →
    // temporary, never permanent.
    let t6 = T0 + 6.0 * HOUR;
    sut.dispatch(rpc_call("c6", "eth_call", t6));
    let ops = sut.resolve(config3(t6));
    assert_eq!(ops, vec![rpc_post("c6", USER, "eth_call")]);
    let ops = sut.resolve(outcome(
        "c6",
        USER,
        Out::HttpError { status: 401 },
        30.0,
        t6 + 50.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(USER, t6 + 50.0)]
            },
            rpc_post("c6", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("c6", PUB1, ok(), 50.0, t6 + 150.0));
    assert_eq!(ops, vec![respond("c6", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // 61 minutes later the temp ban has lapsed: USER leads again purely by
    // the live ban check — the TS stale `banned` flag has no counterpart.
    let t7 = t6 + 50.0 + TEMP_BAN_TTL_MS + 60_000.0;
    sut.dispatch(rpc_call("c7", "eth_call", t7));
    let ops = sut.resolve(config3(t7));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans { entries: vec![] },
            rpc_post("c7", USER, "eth_call"),
        ]
    );
}

/// Invariant ②: an endpoint that reported the wrong eth_chainId is never
/// handed to the bundler via X-Rpc-Url — the slower correct endpoint wins.
/// The winner is cached (1h) and `RefreshChain` drops it.
#[test]
fn wrong_chain_id_never_reaches_x_rpc_url() {
    let mut sut = Sut::new();
    let ops = sut.dispatch(bundler_call("b1", T0));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    let ops = sut.resolve(config3(T0));
    // Two RPC candidates (PUB2 excluded? no — three): all race.
    assert_eq!(ops, vec![probe(USER), probe(PUB1), probe(PUB2)]);
    // USER is FAST but on the wrong chain; PUB1 slow but correct.
    assert!(sut.resolve(probed(USER, Some(1), 10.0, T0 + 10.0)).is_empty());
    assert!(sut.resolve(probed(PUB2, None, 3_000.0, T0 + 3_000.0)).is_empty());
    let ops = sut.resolve(probed(PUB1, Some(CHAIN), 900.0, T0 + 3_100.0));
    assert_eq!(ops, vec![bundler_post("b1", BUSER, Some(PUB1))]);
    let ops = sut.resolve(outcome("b1", BUSER, ok(), 80.0, T0 + 3_200.0));
    assert_eq!(ops, vec![respond("b1", BUSER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // The winner is cached: the next bundler call probes nothing.
    let ops = sut.dispatch(bundler_call("b2", T0 + 5_000.0));
    assert_eq!(ops, vec![bundler_post("b2", BUSER, Some(PUB1))]);
    let ops = sut.resolve(outcome("b2", BUSER, ok(), 80.0, T0 + 5_100.0));
    assert_eq!(ops, vec![respond("b2", BUSER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // RefreshChain reloads the pool AND drops the cached winner — it may
    // point at an endpoint the user just replaced.
    let ops = sut.dispatch(Event::RefreshChain { chain_id: CHAIN });
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    assert!(sut.resolve(config3(T0 + 6_000.0)).is_empty());
    let ops = sut.dispatch(bundler_call("b3", T0 + 7_000.0));
    assert_eq!(ops, vec![probe(USER), probe(PUB1), probe(PUB2)]);
}

/// Invariant ② fail-closed deviation (doc'd in the module): when EVERY
/// endpoint reported a wrong chain, no X-Rpc-Url is sent at all — TS would
/// have fallen back to the unverified score-sorted first. A pure ping
/// failure (no report) still falls back, as in TS, and is not cached.
#[test]
fn all_wrong_chain_probes_fail_closed_ping_failures_fall_back() {
    let mut sut = Sut::new();
    sut.dispatch(bundler_call("b1", T0));
    let ops = sut.resolve(config(
        vec![seed(USER, RpcSource::User), seed(PUB1, RpcSource::Public)],
        vec![seed(BUSER, RpcSource::User), seed(BRELAY, RpcSource::Builtin)],
        T0,
    ));
    assert_eq!(ops, vec![probe(USER), probe(PUB1)]);
    assert!(sut.resolve(probed(USER, Some(1), 10.0, T0 + 10.0)).is_empty());
    let ops = sut.resolve(probed(PUB1, Some(137), 20.0, T0 + 20.0));
    // Both REPORTED wrong chains → header omitted entirely.
    assert_eq!(ops, vec![bundler_post("b1", BUSER, None)]);
    let ops = sut.resolve(outcome("b1", BUSER, ok(), 50.0, T0 + 100.0));
    assert_eq!(ops, vec![respond("b1", BUSER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // Nothing was cached — the next call races again; this time both pings
    // FAIL (no report) → fall back to the score-sorted first, as in TS.
    let ops = sut.dispatch(bundler_call("b2", T0 + 1_000.0));
    assert_eq!(ops, vec![probe(USER), probe(PUB1)]);
    assert!(sut.resolve(probed(USER, None, 3_000.0, T0 + 4_000.0)).is_empty());
    let ops = sut.resolve(probed(PUB1, None, 3_000.0, T0 + 4_100.0));
    assert_eq!(ops, vec![bundler_post("b2", BUSER, Some(USER))]);
}

/// Invariant ③: account-info/sponsor must resolve through the SAME bundler
/// the pool would submit to — the answered REST base always names the pool's
/// current top non-banned endpoint, and falls back to `None` (= built-in)
/// only when everything is banned.
#[test]
fn account_info_and_sponsor_use_the_submitting_bundler() {
    let mut sut = Sut::new();
    sut.dispatch(bundler_call("b1", T0));
    let ops = sut.resolve(config(
        vec![seed(USER, RpcSource::User)],
        vec![seed(BUSER, RpcSource::User), seed(BRELAY, RpcSource::Builtin)],
        T0,
    ));
    assert_eq!(ops, vec![bundler_post("b1", BUSER, Some(USER))]);
    let ops = sut.resolve(outcome("b1", BUSER, ok(), 60.0, T0 + 100.0));
    assert_eq!(ops, vec![respond("b1", BUSER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // The REST base names the same bundler the sweep just used.
    let ops = sut.dispatch(Event::BundlerBaseRequested {
        call_id: "q1".to_owned(),
        chain_id: CHAIN,
        now_ms: T0 + 1_000.0,
    });
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "q1".to_owned(),
            verdict: RpcCallVerdict::BundlerBase {
                base_url: Some("https://bundler.example".to_owned())
            },
        }]
    );
    assert!(sut.resolve(Res::Concluded).is_empty());

    // Ban the top bundler; submission moves to the relay…
    sut.dispatch(bundler_call("b2", T0 + 2_000.0));
    let ops = sut.resolve(outcome("b2", BUSER, Out::HttpError { status: 401 }, 40.0, T0 + 2_050.0));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(BUSER, T0 + 2_050.0)]
            },
            bundler_post("b2", BRELAY, Some(USER)),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("b2", BRELAY, ok(), 60.0, T0 + 2_100.0));
    assert_eq!(ops, vec![respond("b2", BRELAY)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // …and the REST base follows it. Same bundler, never a mix.
    let ops = sut.dispatch(Event::BundlerBaseRequested {
        call_id: "q2".to_owned(),
        chain_id: CHAIN,
        now_ms: T0 + 3_000.0,
    });
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "q2".to_owned(),
            verdict: RpcCallVerdict::BundlerBase {
                base_url: Some("https://relay.example".to_owned())
            },
        }]
    );
    assert!(sut.resolve(Res::Concluded).is_empty());

    // With every bundler banned the base is None — the shell uses the
    // built-in URL, exactly `getActiveBundlerBaseUrl`'s fallback.
    sut.dispatch(bundler_call("b3", T0 + 4_000.0));
    let ops = sut.resolve(outcome("b3", BRELAY, Out::HttpError { status: 403 }, 40.0, T0 + 4_050.0));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(BUSER, T0 + 2_050.0), temp_ban(BRELAY, T0 + 4_050.0)]
            },
            Op::DrawJitter { call_id: "b3".to_owned() },
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.dispatch(Event::BundlerBaseRequested {
        call_id: "q3".to_owned(),
        chain_id: CHAIN,
        now_ms: T0 + 4_100.0,
    });
    assert_eq!(
        ops,
        vec![Op::Conclude {
            call_id: "q3".to_owned(),
            verdict: RpcCallVerdict::BundlerBase { base_url: None },
        }]
    );
}

/// The 10-minute pool TTL: fresh pools skip the config read; stale pools
/// (or `InvalidateAll`) re-read it, and the merge preserves stats.
#[test]
fn pool_ttl_and_invalidate_force_config_reread() {
    let mut sut = loaded(T0);
    // Within 10 minutes: no reload.
    let ops = sut.dispatch(rpc_call("c1", "eth_call", T0 + 300_000.0));
    assert_eq!(ops, vec![rpc_post("c1", USER, "eth_call")]);
    let ops = sut.resolve(outcome("c1", USER, ok(), 50.0, T0 + 300_050.0));
    assert_eq!(ops, vec![respond("c1", USER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // Past 10 minutes: reload, then route — with stats preserved.
    let ops = sut.dispatch(rpc_call("c2", "eth_call", T0 + 900_000.0));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    let ops = sut.resolve(config3(T0 + 900_000.0));
    assert_eq!(ops, vec![rpc_post("c2", USER, "eth_call")]);
    let ops = sut.resolve(outcome("c2", USER, ok(), 50.0, T0 + 900_050.0));
    assert_eq!(ops, vec![respond("c2", USER)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // InvalidateAll: the next use re-reads config even though it is fresh.
    assert!(sut.dispatch(Event::InvalidateAll).is_empty());
    let ops = sut.dispatch(rpc_call("c3", "eth_call", T0 + 901_000.0));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    let ops = sut.resolve(config3(T0 + 901_000.0));
    assert_eq!(ops, vec![rpc_post("c3", USER, "eth_call")]);
}

/// The failure cooldown demotes an endpoint below the public tier while it
/// cools, then the milder per-failure penalty restores its lead.
#[test]
fn cooldown_reorders_then_recovers() {
    let mut sut = loaded(T0);
    sut.dispatch(rpc_call("c1", "eth_call", T0 + 1_000.0));
    let ops = sut.resolve(outcome("c1", USER, Out::Timeout, 8_000.0, T0 + 9_000.0));
    assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);
    let ops = sut.resolve(outcome("c1", PUB1, ok(), 40.0, T0 + 9_100.0));
    assert_eq!(ops, vec![respond("c1", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // Inside USER's 30s cooldown the public endpoint leads.
    let ops = sut.dispatch(rpc_call("c2", "eth_call", T0 + 20_000.0));
    assert_eq!(ops, vec![rpc_post("c2", PUB1, "eth_call")]);
    let ops = sut.resolve(outcome("c2", PUB1, ok(), 40.0, T0 + 20_050.0));
    assert_eq!(ops, vec![respond("c2", PUB1)]);
    assert!(sut.resolve(Res::Concluded).is_empty());

    // Cooldown over: -200 beats nothing — USER is back on top.
    let ops = sut.dispatch(rpc_call("c3", "eth_call", T0 + 45_000.0));
    assert_eq!(ops, vec![rpc_post("c3", USER, "eth_call")]);
}

/// A permanent error that is ALSO a rate-limit signal ("exceeded") feeds the
/// final-pass classification, and the single-endpoint pool rescues itself
/// between passes — the ban/rescue loop ends in an honest
/// `Failed{rate_limited: true}`.
#[test]
fn permanent_rate_limit_signal_classifies_final_pass() {
    let mut sut = Sut::new();
    sut.dispatch(rpc_call("c1", "eth_call", T0));
    let ops = sut.resolve(config1(T0));
    assert_eq!(ops, vec![rpc_post("c1", PUB1, "eth_call")]);

    // Pass 0: permanent + signal → ban, pool exhausted.
    let ops = sut.resolve(outcome(
        "c1",
        PUB1,
        rpc_err(None, "daily request count exceeded"),
        30.0,
        T0 + 30.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(PUB1, T0 + 30.0)]
            },
            Op::DrawJitter { call_id: "c1".to_owned() },
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(Res::Jitter {
        call_id: "c1".to_owned(),
        value: 1.0,
    });
    assert_eq!(
        ops,
        vec![Op::StartBackoff {
            call_id: "c1".to_owned(),
            delay_ms: 300
        }]
    );
    // Pass 1 rescues the all-banned pool and tries again.
    let ops = sut.resolve(Res::BackoffElapsed {
        call_id: "c1".to_owned(),
        now_ms: T0 + 330.0,
    });
    assert_eq!(
        ops,
        vec![
            Op::PersistBans { entries: vec![] },
            rpc_post("c1", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome(
        "c1",
        PUB1,
        rpc_err(None, "daily request count exceeded"),
        30.0,
        T0 + 400.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(PUB1, T0 + 400.0)]
            },
            Op::DrawJitter { call_id: "c1".to_owned() },
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(Res::Jitter {
        call_id: "c1".to_owned(),
        value: 0.25,
    });
    assert_eq!(
        ops,
        vec![Op::StartBackoff {
            call_id: "c1".to_owned(),
            delay_ms: 150 // floor(0.25 · min(1500, 600))
        }]
    );
    let ops = sut.resolve(Res::BackoffElapsed {
        call_id: "c1".to_owned(),
        now_ms: T0 + 600.0,
    });
    assert_eq!(
        ops,
        vec![
            Op::PersistBans { entries: vec![] },
            rpc_post("c1", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());

    // Final pass: the signal on the permanent error classifies the chain as
    // rate-limited — quota exhaustion is transient, never the banner.
    let ops = sut.resolve(outcome(
        "c1",
        PUB1,
        rpc_err(None, "daily request count exceeded"),
        30.0,
        T0 + 700.0,
    ));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![temp_ban(PUB1, T0 + 700.0)]
            },
            Op::Conclude {
                call_id: "c1".to_owned(),
                verdict: RpcCallVerdict::Failed { rate_limited: true },
            },
        ]
    );
    let view = sut.view();
    assert_eq!(view.failed_chains, vec![CHAIN]);
    assert_eq!(view.rate_limited_chains, vec![CHAIN]);
}

/// Persisted bans load once at startup; a second load never clobbers, and
/// the throttled prune drops expired entries (persisting the survivors).
#[test]
fn persisted_bans_load_once_and_prune_expired() {
    let mut sut = Sut::new();
    assert!(sut
        .dispatch(Event::BansLoaded {
            entries: vec![
                temp_ban(PUB2, T0 - 2.0 * HOUR), // expired
                perma_ban(USER, T0 - HOUR),      // active
            ],
        })
        .is_empty());
    // A duplicate load is ignored (`banLoaded`).
    assert!(sut.dispatch(Event::BansLoaded { entries: vec![] }).is_empty());

    let ops = sut.dispatch(rpc_call("c1", "eth_call", T0));
    assert_eq!(ops, vec![Op::LoadPoolConfig { chain_id: CHAIN }]);
    // The prune drops the expired temp ban (and persists the survivors);
    // USER stays banned, so the sweep starts at PUB1 — and PUB2 is eligible
    // again right behind it.
    let ops = sut.resolve(config3(T0));
    assert_eq!(
        ops,
        vec![
            Op::PersistBans {
                entries: vec![perma_ban(USER, T0 - HOUR)]
            },
            rpc_post("c1", PUB1, "eth_call"),
        ]
    );
    assert!(sut.resolve(Res::Persisted).is_empty());
    let ops = sut.resolve(outcome("c1", PUB1, ok(), 40.0, T0 + 50.0));
    assert_eq!(ops, vec![respond("c1", PUB1)]);
}

/// Staleness by construction: results that no longer name live work are
/// dropped without touching state, and the machine keeps serving.
#[test]
fn stale_results_are_dropped_by_construction() {
    let mut sut = loaded(T0);

    // A post outcome for an unknown call id: dropped.
    sut.dispatch(rpc_call("c1", "eth_call", T0 + 1_000.0));
    assert!(sut
        .resolve(outcome("ghost", USER, ok(), 10.0, T0 + 1_100.0))
        .is_empty());

    // An unsolicited pool config: dropped (no load is in flight).
    sut.dispatch(rpc_call("c2", "eth_call", T0 + 2_000.0));
    assert!(sut.resolve(config3(T0 + 2_000.0)).is_empty());

    // A duplicate call id: dropped outright (fail-closed).
    assert!(sut.dispatch(rpc_call("c2", "eth_call", T0 + 2_500.0)).is_empty());

    // The machine still routes fresh work.
    let ops = sut.dispatch(rpc_call("c3", "eth_call", T0 + 3_000.0));
    assert_eq!(ops, vec![rpc_post("c3", USER, "eth_call")]);
    let ops = sut.resolve(outcome("c3", USER, ok(), 30.0, T0 + 3_050.0));
    assert_eq!(ops, vec![respond("c3", USER)]);
}
