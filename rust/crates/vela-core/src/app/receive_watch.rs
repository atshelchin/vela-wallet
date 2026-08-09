//! Machine — deposit detection on the Receive screen (spec
//! `016-crux-wallet-state`, US2).
//!
//! ```text
//! start ─► fetch ─► baseline ─► wait(3s…60s) ─► fetch ─► diff ─► entries
//!                                    │ 5min elapsed         │ shrunken result
//!                                    ▼                      ▼
//!                                 Stopped              skip diff, wait again
//! ```
//!
//! A recipient — possibly a merchant at a counter — judges "the money
//! arrived" by this surface, so the rules here are all about never reporting
//! what didn't happen. A fetch that returns FEWER tokens than the baseline is
//! not compared at all: a chain's RPC likely failed, and diffing against a
//! shrunken set would fabricate deposits. The baseline advances only when a
//! deposit is actually detected — a faithful port of today's behavior,
//! including its recorded quirk (a withdrawal followed by a re-deposit up to
//! the old level goes unnoticed; inventory.md open question 11 owns whether
//! that ever changes).
//!
//! The core owns the cadence policy (3s for the first minute, then 60s, stop
//! at five minutes, die on a backgrounded tick — also a faithful port); the
//! shell owns timers, the actual token fetch, and every piece of formatting
//! (amounts, USD, the entry's local time — the core emits epoch ms).

use crux_core::{render::render, render::RenderOperation, App, Command};
use crux_core::capability::Operation;
use crux_core::macros::effect;
use serde::{Deserialize, Serialize};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// The cadence, exactly as `ReceiveScreen.tsx` has it today.
pub const FAST_INTERVAL_MS: f64 = 3_000.0;
pub const SLOW_INTERVAL_MS: f64 = 60_000.0;
pub const FAST_PHASE_MS: f64 = 60_000.0;
pub const TOTAL_LISTEN_MS: f64 = 300_000.0;

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

/// One token's balance facts, as the shell maps them from `APIToken`.
/// Balances stay `f64` (`tokenBalanceDouble` semantics) so the detection
/// threshold is bit-identical to today's (research.md D6).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct TokenSnapshot {
    /// `tokenId(tk)` — the baseline key.
    pub id: String,
    pub symbol: String,
    pub chain_id: u32,
    pub balance: f64,
    pub price_usd: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "ReceiveWatchOperation"))]
pub enum ReceiveWatchOperation {
    /// Force-refresh the account's token balances. The shell checks app
    /// activity FIRST (as today) and answers `inactive` without fetching when
    /// backgrounded.
    FetchTokens,
    /// Wait, without the core owning a clock.
    Wait { ms: u32 },
    /// A deposit landed — the shell buzzes (`hapticSuccess`).
    SignalDeposit,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "ReceiveWatchShellResult"))]
pub enum ReceiveWatchShellResult {
    /// `now_ms` rides on the result (the 011 `now_iso` pattern) so the core
    /// stays a pure function of its inputs.
    TokensFetched {
        tokens: Vec<TokenSnapshot>,
        now_ms: f64,
    },
    FetchFailed { now_ms: f64 },
    /// The app was backgrounded when the tick fired.
    Inactive,
    Waited { now_ms: f64 },
    Signalled,
}

impl Operation for ReceiveWatchOperation {
    type Output = ReceiveWatchShellResult;
}

#[effect]
pub enum ReceiveWatchEffect {
    Render(RenderOperation),
    Shell(ReceiveWatchOperation),
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "ReceiveWatchEvent"))]
pub enum Event {
    /// The screen opened. One session per account — a switch disposes this
    /// core and builds a fresh one, so a previous account's baseline can
    /// never bleed into the new one.
    Start,
    #[serde(skip)]
    ShellCompleted {
        attempt: u64,
        result: ReceiveWatchShellResult,
    },
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct DepositItem {
    pub symbol: String,
    /// The raw balance delta — the shell formats it (`formatBalance`).
    pub amount: f64,
    pub chain_id: u32,
    /// `delta × priceUsd` when the token is priced; the shell renders `$x.xx`.
    pub usd: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct DepositEntry {
    /// Wall-clock of the detecting fetch — shell formats per locale (this is
    /// what retires the hard-coded `en-US` rendering).
    pub at_epoch_ms: f64,
    pub items: Vec<DepositItem>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Phase {
    #[default]
    Fresh,
    /// A fetch is in flight.
    Awaiting,
    /// A wait is in flight.
    Waiting,
    /// Five minutes elapsed, or a tick found the app backgrounded.
    Stopped,
}

#[derive(Default)]
pub struct Model {
    /// Stamped from the first result; every cadence decision measures from it.
    started_at_ms: Option<f64>,
    baseline: Option<Vec<TokenSnapshot>>,
    deposits: Vec<DepositEntry>,
    phase: Phase,
    attempt: u64,
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ReceiveWatchView {
    pub detected: bool,
    /// Newest first, exactly as the screen prepends today.
    pub deposits: Vec<DepositEntry>,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct ReceiveWatch;

impl App for ReceiveWatch {
    type Event = Event;
    type Model = Model;
    type ViewModel = ReceiveWatchView;
    type Effect = ReceiveWatchEffect;

    fn update(&self, event: Event, model: &mut Model) -> Command<ReceiveWatchEffect, Event> {
        match event {
            Event::Start => {
                // Only from fresh: the session is single-shot by design.
                if model.phase != Phase::Fresh {
                    return Command::done();
                }
                model.attempt += 1;
                model.phase = Phase::Awaiting;
                request(model, ReceiveWatchOperation::FetchTokens)
            }
            Event::ShellCompleted { attempt, result } => {
                if attempt != model.attempt {
                    return Command::done();
                }
                accept(model, result)
            }
        }
    }

    fn view(&self, model: &Model) -> ReceiveWatchView {
        ReceiveWatchView {
            detected: !model.deposits.is_empty(),
            deposits: model.deposits.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Shell results
// ---------------------------------------------------------------------------

fn accept(
    model: &mut Model,
    result: ReceiveWatchShellResult,
) -> Command<ReceiveWatchEffect, Event> {
    match (model.phase, result) {
        // A backgrounded tick ends the watcher — faithful to today's silent
        // early-return with no reschedule (research.md D6).
        (Phase::Awaiting, ReceiveWatchShellResult::Inactive) => {
            model.phase = Phase::Stopped;
            render()
        }

        (Phase::Awaiting, ReceiveWatchShellResult::TokensFetched { tokens, now_ms }) => {
            stamp_start(model, now_ms);
            match &model.baseline {
                // First fetch — record the baseline, report nothing.
                None => {
                    model.baseline = Some(tokens);
                    schedule(model, now_ms)
                }
                Some(baseline) => {
                    // Fewer tokens than baseline ⇒ a chain likely failed.
                    // Diffing would fabricate deposits, so don't.
                    if tokens.len() < baseline.len() {
                        return schedule(model, now_ms);
                    }
                    let items = diff(baseline, &tokens);
                    if items.is_empty() {
                        // No increase: the baseline does NOT advance (today's
                        // rule — see the module doc for the recorded quirk).
                        return schedule(model, now_ms);
                    }
                    model.deposits.insert(
                        0,
                        DepositEntry {
                            at_epoch_ms: now_ms,
                            items,
                        },
                    );
                    model.baseline = Some(tokens);
                    let attempt = model.attempt;
                    Command::all([
                        Command::request_from_shell(ReceiveWatchOperation::SignalDeposit)
                            .then_send(move |result| Event::ShellCompleted { attempt, result }),
                        schedule(model, now_ms),
                    ])
                }
            }
        }

        // A failed fetch reports nothing and keeps polling.
        (Phase::Awaiting, ReceiveWatchShellResult::FetchFailed { now_ms }) => {
            stamp_start(model, now_ms);
            schedule(model, now_ms)
        }

        (Phase::Waiting, ReceiveWatchShellResult::Waited { .. }) => {
            model.phase = Phase::Awaiting;
            request(model, ReceiveWatchOperation::FetchTokens)
        }

        // A haptic acknowledged, or a result for a phase that no longer
        // expects it.
        _ => Command::done(),
    }
}

// ---------------------------------------------------------------------------
// Pure policy
// ---------------------------------------------------------------------------

/// Tokens whose balance strictly increased vs the baseline. A token absent
/// from the baseline counts from zero — a brand-new holding IS a deposit.
fn diff(baseline: &[TokenSnapshot], current: &[TokenSnapshot]) -> Vec<DepositItem> {
    let mut items = Vec::new();
    for token in current {
        let previous = baseline
            .iter()
            .find(|b| b.id == token.id)
            .map(|b| b.balance)
            .unwrap_or(0.0);
        if token.balance > previous {
            let delta = token.balance - previous;
            items.push(DepositItem {
                symbol: token.symbol.clone(),
                amount: delta,
                chain_id: token.chain_id,
                usd: token.price_usd.filter(|p| *p > 0.0).map(|p| delta * p),
            });
        }
    }
    items
}

fn stamp_start(model: &mut Model, now_ms: f64) {
    if model.started_at_ms.is_none() {
        model.started_at_ms = Some(now_ms);
    }
}

/// The cadence table: 3s while young, 60s after the first minute, stop at
/// five — measured from the session's first observed clock.
fn schedule(model: &mut Model, now_ms: f64) -> Command<ReceiveWatchEffect, Event> {
    let started = model.started_at_ms.unwrap_or(now_ms);
    let elapsed = now_ms - started;
    if elapsed >= TOTAL_LISTEN_MS {
        model.phase = Phase::Stopped;
        return render();
    }
    let interval = if elapsed < FAST_PHASE_MS {
        FAST_INTERVAL_MS
    } else {
        SLOW_INTERVAL_MS
    };
    model.phase = Phase::Waiting;
    // f64 → u32 is exact for both constants; the wire stays `number`-safe
    // (no bigint — the same reason shell.rs's Wait uses u32).
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let ms = interval as u32;
    let attempt = model.attempt;
    Command::all([
        Command::request_from_shell(ReceiveWatchOperation::Wait { ms })
            .then_send(move |result| Event::ShellCompleted { attempt, result }),
        render(),
    ])
}

/// Issue one operation whose answer must match the current attempt.
fn request(
    model: &mut Model,
    operation: ReceiveWatchOperation,
) -> Command<ReceiveWatchEffect, Event> {
    let attempt = model.attempt;
    Command::all([
        Command::request_from_shell(operation)
            .then_send(move |result| Event::ShellCompleted { attempt, result }),
        render(),
    ])
}

impl super::SplitEffect for ReceiveWatchEffect {
    type Op = ReceiveWatchOperation;
    fn into_shell(self) -> Option<crux_core::Request<ReceiveWatchOperation>> {
        match self {
            ReceiveWatchEffect::Render(_) => None,
            ReceiveWatchEffect::Shell(request) => Some(request),
        }
    }
}
