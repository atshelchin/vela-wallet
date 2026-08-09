//! Machine — the home Activity feed (spec `016-crux-wallet-state`,
//! activity_feed P3).
//!
//! ```text
//! AccountSwitched/FocusTick/LiveTick ─► ReadTxStore + ScanIncomingTransfers
//!        StoreLoaded ─► dedupe ► batch-fold ► tombstone-filter ► commit ► alias ops
//!        SyncCompleted{n>0} ─► re-read (celebrate only after the first pass)
//!        ReconcileCompleted{n>0} (tx_tracker's verdicts landed) ─► re-read
//!        DeleteRequested ─► tombstone + optimistic remove ─► DeleteTxRecord
//! ```
//!
//! The LOCAL tx store is the single source of truth; this machine only reads
//! it, folds it and decides when to read it again. Ported from
//! `src/services/activity.ts` (feed adapter, batch folding, stablecoin
//! valuation) and `src/screens/wallet/useHomeController.ts` (load pipeline,
//! celebration, tombstones, alias memoisation, chain filter, date grouping).
//! The pending→confirmed convergence policy itself belongs to
//! [`super::tx_tracker`] — this machine merely consumes its outcome as
//! [`Event::ReconcileCompleted`].
//!
//! # The contract change (inventory-approved)
//!
//! Today's `ActivityItem` carries pre-formatted strings (`"+1 USDT"`,
//! `"$1.00"`), which forces a full adapter re-run on locale change and makes
//! the celebration toast reverse-parse its own amount string
//! (`useHomeController.ts:225-227`). Here every item carries **structured**
//! values — `value` (decimal string) + `decimals` + `symbol` + `usd_value`
//! (f64) — and the shell formats. Both hacks disappear: locale changes are a
//! pure re-render, and the toast carries `value`/`symbol` directly.
//!
//! # Shell contract
//!
//! - `ReadTxStore` answers `StoreLoaded` with every stored record mapped to
//!   [`FeedTxRecord`]; a storage failure answers an EMPTY list, exactly as
//!   `loadTransactions().catch(() => [])` does today (ported verbatim — yes,
//!   that blanks the feed; the store is the source of truth even about
//!   emptiness).
//! - `day_start_ms` is the record's LOCAL-midnight epoch key, computed by the
//!   shell (it owns the device timezone) — the port of `dayStartMs`.
//! - `ScanIncomingTransfers` runs the whole `syncReceivedTransfers` discovery
//!   (admission routed through token_trust) and answers the count of
//!   genuinely-new persisted receipts; any failure answers `0` (the TS
//!   `catch { return 0 }`).
//! - `ResolveRecipientIdentity` must check the user's OWN accounts first and
//!   answer the local name without touching the network
//!   (`useHomeController.ts:432-434` — the shell owns the accounts list); the
//!   core's half of invariant ⑦ is that a stored `to_name` never even asks,
//!   and an attempted address is never asked twice.
//! - `FocusTick`/`LiveTick` cadence (focus + 30s auto-refresh, 10s while the
//!   Activity tab is visible) stays in the shell: which tab is visible is
//!   render-domain state the core never sees. The core owns the toast timer.
//!
//! # Fidelity notes
//!
//! - The TS pipeline is one sequential async function (read → reconcile →
//!   scan); here the read and the scan are issued together and each answer
//!   drives its own step. The visible invariants — cache paints first, sync
//!   re-reads only when `new_count > 0` — are unchanged.
//! - `DeleteFailed` still drops the tombstone (the TS `.finally()`), so a
//!   failed delete lets the next reload resurrect the row — ported verbatim;
//!   the record genuinely still exists in storage.
//! - `alias_map`/`alias_attempted` survive an account switch (both are
//!   session-lived refs in TS) — an address→name fact is account-agnostic.
//! - The web-only `velaSimulateReceipt` dev hook is not ported.

use std::collections::{BTreeMap, BTreeSet};
use std::mem;

use crux_core::capability::Operation;
use crux_core::macros::effect;
use crux_core::{render::render, render::RenderOperation, App, Command};
use serde::{Deserialize, Serialize};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// Toast lifetime — `setTimeout(() => setReceipt(null), 2800)`.
pub const TOAST_MS: u32 = 2_800;

/// Symbols treated as ≈ $1 so stablecoin transfers are never shown as $0.00
/// (`activity.ts:150-152`, verbatim).
pub const STABLE_SYMBOLS: [&str; 15] = [
    "USDT", "USDT0", "USDC", "USDC.E", "DAI", "BUSD", "TUSD", "FDUSD", "USDE", "PYUSD", "USDP",
    "GUSD", "LUSD", "FRAX", "USDD",
];

// ---------------------------------------------------------------------------
// Wire value types
// ---------------------------------------------------------------------------

/// The `LocalTransaction.type` union (`storage.ts:390-391`). A record with no
/// type is a legacy row and defaults to `send`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum FeedTxKind {
    Send,
    Receive,
    DappTx,
    SignMessage,
    SignTypedData,
    Connect,
}

/// Storage lifecycle vocabulary (`status: 'pending' | 'confirmed' | 'failed'`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum FeedTxStatus {
    Pending,
    Confirmed,
    Failed,
}

/// One stored transaction, as the shell maps `LocalTransaction` in — only the
/// fields the feed folds. Amounts are decimal strings, timestamps are the
/// stored epoch SECONDS (f64 — no u64 crosses the wire), and `usd` keeps the
/// legacy pre-formatted string exactly as persisted (parsed here, once, the
/// way `txUsdValue` parses it).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeedTxRecord {
    pub id: String,
    /// Empty for receives and off-chain signatures.
    pub user_op_hash: String,
    /// Empty string when no on-chain hash exists (`storage.ts:371`).
    pub tx_hash: String,
    pub from: String,
    pub to: String,
    /// Recipient name captured at send time (`toName`).
    pub to_name: Option<String>,
    /// Token amount, decimal string (`value`).
    pub value: String,
    pub symbol: String,
    pub decimals: u32,
    /// Ordered token-logo URL candidates captured at write time.
    pub logo_urls: Option<Vec<String>>,
    pub chain_id: u32,
    /// Stored epoch seconds.
    pub timestamp: f64,
    /// LOCAL-midnight epoch ms for `timestamp` — computed by the shell, which
    /// owns the device timezone (the `dayStartMs` port; invariant ⑥).
    pub day_start_ms: f64,
    pub status: FeedTxStatus,
    /// `None` = legacy untyped record ⇒ treated as `send` (`t.type ?? 'send'`).
    pub kind: Option<FeedTxKind>,
    /// Legacy pre-formatted USD (e.g. `"$1.00"`), as stored.
    pub usd: Option<String>,
}

impl FeedTxRecord {
    fn kind(&self) -> FeedTxKind {
        self.kind.unwrap_or(FeedTxKind::Send)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum FeedDirection {
    In,
    Out,
}

/// `split` = one token → N recipients; `multi_select` = N tokens → 1 recipient.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum FeedBatchKind {
    Split,
    MultiSelect,
}

/// One line in a batch send breakdown (`ActivityBatchTransfer`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeedBatchTransfer {
    pub to: String,
    pub to_name: Option<String>,
    pub value: String,
    pub symbol: String,
    pub decimals: u32,
    pub usd_value: f64,
    pub logo_urls: Option<Vec<String>>,
}

/// A batch send summarized from its per-line records (`buildBatchView`,
/// `activity.ts:210-236`, ported verbatim including the kind ternary).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeedBatch {
    pub kind: FeedBatchKind,
    pub count: u32,
    pub total_usd: f64,
    pub transfers: Vec<FeedBatchTransfer>,
    /// Stored record ids of the siblings — for live status reconciliation.
    pub ids: Vec<String>,
    pub from: String,
    pub chain_id: u32,
    pub timestamp: f64,
    pub status: FeedTxStatus,
    pub tx_hash: String,
    pub user_op_hash: String,
    /// split only: the single token symbol + its logo.
    pub symbol: Option<String>,
    pub logo_urls: Option<Vec<String>>,
    /// multi_select only: the single recipient.
    pub to: Option<String>,
    pub to_name: Option<String>,
}

/// One feed row's payload — the structured replacement for `ActivityItem`.
/// The shell formats: sign from `direction`, amount from `value`/`decimals`/
/// `symbol` (compact at a glance, exact in detail), fiat from `usd_value` ×
/// the display-currency rate, counterparty label from `alias` falling back to
/// a shortened `counterparty`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeedItem {
    /// Row identity (FlatList key): the record id, or the shared
    /// `user_op_hash` for a folded batch row.
    pub id: String,
    pub direction: FeedDirection,
    /// Counterparty address — sender for `in`, recipient for `out`; `None`
    /// for a split batch row (no single recipient).
    pub counterparty: Option<String>,
    /// In the MODEL: the stored local name (`toName`). In the VIEW: the
    /// resolved overlay — `alias_map[addr] ?? stored`, the
    /// `HomeScreen.tsx:244-250` precedence.
    pub alias: Option<String>,
    /// Token amount, decimal string. `None` for a multi_select batch row
    /// (mixed tokens can't sum — the shell shows the asset count from
    /// `batch.count` instead).
    pub value: Option<String>,
    /// Empty for multi_select batch rows (`token: b.symbol ?? ''`).
    pub symbol: String,
    pub decimals: Option<u32>,
    /// Numeric USD (0 when unknown) — the `txUsdValue` port, stablecoin
    /// face-value fallback included (invariant ⑧).
    pub usd_value: f64,
    pub chain_id: u32,
    /// Epoch seconds (drives `relativeTime`/`dayGroupLabel` in the shell).
    pub timestamp: f64,
    /// The record's local-midnight grouping key (shell-computed).
    pub day_start_ms: f64,
    pub tx_hash: Option<String>,
    pub batch: Option<FeedBatch>,
}

/// A date header or an item — the grouped feed, in render order
/// (invariant ⑥: headers can never inter-sort with items because the core
/// emits them already interleaved).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS))]
pub enum FeedRow {
    Header {
        /// `day-<dayStartMs>` — the stable list key.
        id: String,
        day_start_ms: f64,
        /// A representative timestamp inside the day — the shell derives
        /// "Today" / "Yesterday" / date from it plus its own `now`.
        timestamp: f64,
    },
    Item { item: FeedItem },
}

/// The receipt toast, structured — the shell formats `value` + `symbol`
/// (this retires the strip-the-symbol string hack).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeedToast {
    pub item_id: String,
    pub value: String,
    pub symbol: String,
    /// `celebrated_at + 2800` — epoch ms, from the celebrating result's clock.
    pub deadline_ms: f64,
}

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "FeedOperation"))]
pub enum FeedOperation {
    /// Read the whole local tx store (`loadTransactions`); the shell maps rows
    /// to [`FeedTxRecord`] and answers a load failure with an empty list.
    ReadTxStore { address: String },
    /// Run receipt discovery + persistence (`syncReceivedTransfers`), token
    /// admission via token_trust; answers the count of genuinely-new records
    /// (0 on any failure).
    ScanIncomingTransfers { address: String },
    /// Delete one stored record (`deleteTransaction`).
    DeleteTxRecord { id: String },
    /// Resolve a counterparty name. The shell checks the user's OWN accounts
    /// first (local name, no network), then ENS/.bnb/Vela/etc.
    ResolveRecipientIdentity { addr: String },
    /// Toast countdown. `generation` is echoed back so a superseded timer
    /// (a newer celebration re-armed the toast) can never clear it early.
    Timer { ms: u32, generation: u32 },
    /// `hapticSuccess()` — money-in buzz.
    Haptic,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "FeedShellResult"))]
pub enum FeedShellResult {
    /// `now_ms` rides on the result (the 011 pattern) — it stamps the toast
    /// deadline when this read was celebration-flagged.
    StoreLoaded {
        records: Vec<FeedTxRecord>,
        now_ms: f64,
    },
    /// The scan finished; `new_count` new receipts were persisted.
    SyncCompleted { new_count: u32 },
    DeleteCommitted { id: String },
    DeleteFailed { id: String },
    /// `name: None` ⇒ nothing resolved (never retried this session).
    AliasResolved { addr: String, name: Option<String> },
    ToastExpired { generation: u32 },
    HapticPlayed,
}

impl Operation for FeedOperation {
    type Output = FeedShellResult;
}

#[effect]
pub enum FeedEffect {
    Render(RenderOperation),
    Shell(FeedOperation),
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "FeedEvent"))]
pub enum Event {
    /// The active account changed (or first mounted). Resets the first-pass
    /// flag and the celebration, bumps `attempt` so every in-flight answer
    /// for the previous account is dropped — the core twin of the
    /// `addressRef.current !== address` guard. The previous feed keeps
    /// painting until the new account's read commits (ported verbatim: the
    /// screen never flashes empty on switch).
    AccountSwitched { address: String },
    /// Home gained focus / the 30s auto-refresh fired.
    FocusTick,
    /// The 10s near-real-time poll while the Activity tab is visible.
    LiveTick,
    /// tx_tracker converged pending submissions (`reconcilePendingTransactions`
    /// returned); a positive count re-reads the store — never celebrates
    /// (`useHomeController.ts:284-295`).
    ReconcileCompleted { resolved_count: u32 },
    /// Balance privacy toggled. While hidden the toast is suppressed
    /// (invariant ④, `HomeScreen.tsx:176-180`) — but the row glow and the
    /// haptic still happen, exactly as today.
    PrivacyChanged { hidden: bool },
    /// The network chip filter (`selectedChainId`); `None` = all chains.
    ChainFilterChanged { chain_id: Option<u32> },
    /// Optimistic per-row delete: tombstone + instant removal + storage write.
    DeleteRequested { id: String },
    #[serde(skip)]
    ShellCompleted {
        attempt: u64,
        result: FeedShellResult,
    },
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct ToastState {
    value: String,
    symbol: String,
    /// `now_ms + TOAST_MS` at celebration time — informational; expiry is
    /// driven by the echoed `generation`, not by clock math in the core.
    deadline_ms: f64,
    generation: u32,
}

#[derive(Clone, Debug)]
struct Celebration {
    /// The glowing row (`newItemId`) — persists after the toast expires,
    /// cleared only by an account switch or the next celebration.
    item_id: String,
    toast: Option<ToastState>,
}

#[derive(Default)]
pub struct Model {
    address: String,
    /// The folded feed (deduped, batch-folded, tombstone-filtered, sorted
    /// newest-first) — rebuilt only by the reload path (invariant ⑤'s
    /// "single setter").
    items: Vec<FeedItem>,
    /// Raw account-filtered records (`loadActivityTransactions` /
    /// `txByIdRef`) — powers the detail sheet. Deliberately NOT
    /// tombstone-filtered, mirroring `txByIdRef`.
    records: Vec<FeedTxRecord>,
    /// First sync pass done (`initializedRef`) — the backlog gate
    /// (invariant ③).
    initialized: bool,
    /// The next `StoreLoaded` commit is a post-sync re-read that may
    /// celebrate its newest incoming item.
    celebrate_on_next_load: bool,
    /// Ids mid-delete: filtered out of every reload commit until the storage
    /// write settles (invariant ⑤).
    tombstones: BTreeSet<String>,
    celebration: Option<Celebration>,
    /// Monotonic toast generation — the anti-stale token echoed through
    /// [`FeedOperation::Timer`].
    generation: u32,
    /// Lowercased address → resolved name. Session-lived, survives account
    /// switches (as the TS refs do).
    alias_map: BTreeMap<String, String>,
    /// Addresses already asked — never asked again this session
    /// (invariant ⑦).
    alias_attempted: BTreeSet<String>,
    chain_filter: Option<u32>,
    privacy_hidden: bool,
    /// Bumped ONLY on account switch — any in-flight answer for a previous
    /// account is stale and dropped.
    attempt: u64,
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeedView {
    /// Date headers + items, chain-filtered, in render order.
    pub rows: Vec<FeedRow>,
    /// Raw account-scoped records for the detail sheet
    /// (`loadActivityTransactions`).
    pub transactions: Vec<FeedTxRecord>,
    /// The glowing "just landed" row (`newItemId`).
    pub new_item_id: Option<String>,
    /// `None` while balance privacy is on — invariant ④ enforced here, not
    /// in the shell.
    pub toast: Option<FeedToast>,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct ActivityFeed;

impl App for ActivityFeed {
    type Event = Event;
    type Model = Model;
    type ViewModel = FeedView;
    type Effect = FeedEffect;

    fn update(&self, event: Event, model: &mut Model) -> Command<FeedEffect, Event> {
        match event {
            Event::AccountSwitched { address } => {
                model.attempt += 1;
                model.address = address;
                model.initialized = false;
                model.celebrate_on_next_load = false;
                // setNewItemId(null); setReceipt(null) — the account-change
                // reset (`useHomeController.ts:399-402`).
                model.celebration = None;
                load_pipeline(model)
            }
            Event::FocusTick | Event::LiveTick => {
                // `if (!address) return` (`useHomeController.ts:262`).
                if model.address.is_empty() {
                    return Command::done();
                }
                load_pipeline(model)
            }
            Event::ReconcileCompleted { resolved_count } => {
                if resolved_count == 0 || model.address.is_empty() {
                    return Command::done();
                }
                // Converged records changed in place — re-read, never
                // celebrate (`useHomeController.ts:287-294`).
                shell_request(
                    model.attempt,
                    FeedOperation::ReadTxStore {
                        address: model.address.clone(),
                    },
                )
            }
            Event::PrivacyChanged { hidden } => {
                model.privacy_hidden = hidden;
                render()
            }
            Event::ChainFilterChanged { chain_id } => {
                model.chain_filter = chain_id;
                render()
            }
            Event::DeleteRequested { id } => {
                // Optimistic remove + tombstone until the write settles, so a
                // concurrent reload can't repaint the just-deleted row
                // (`useHomeController.ts:602-610`).
                model.tombstones.insert(id.clone());
                model.items.retain(|item| item.id != id);
                Command::all([
                    shell_request(model.attempt, FeedOperation::DeleteTxRecord { id }),
                    render(),
                ])
            }
            Event::ShellCompleted { attempt, result } => {
                if attempt != model.attempt {
                    // A previous account's answer — the addressRef guard.
                    return Command::done();
                }
                accept(model, result)
            }
        }
    }

    fn view(&self, model: &Model) -> FeedView {
        // Chain filter first, then date headers over the filtered list —
        // exactly `filteredActivity` → `activityFeed`
        // (`useHomeController.ts:543-563`).
        let mut rows = Vec::new();
        let mut last_day: Option<f64> = None;
        for item in &model.items {
            if let Some(chain) = model.chain_filter {
                if item.chain_id != chain {
                    continue;
                }
            }
            if last_day != Some(item.day_start_ms) {
                rows.push(FeedRow::Header {
                    id: format!("day-{}", item.day_start_ms),
                    day_start_ms: item.day_start_ms,
                    timestamp: item.timestamp,
                });
                last_day = Some(item.day_start_ms);
            }
            let mut out = item.clone();
            if let Some(addr) = &out.counterparty {
                // Resolved name wins over the stored one — the
                // `aliasMap.get(...) ?? item.alias` precedence.
                if let Some(name) = model.alias_map.get(&addr.to_lowercase()) {
                    out.alias = Some(name.clone());
                }
            }
            rows.push(FeedRow::Item { item: out });
        }

        // Toast suppressed while privacy is on (invariant ④) — the state
        // still exists (haptic fired, glow shows), only the number-bearing
        // surface is withheld.
        let toast = if model.privacy_hidden {
            None
        } else {
            model.celebration.as_ref().and_then(|c| {
                c.toast.as_ref().map(|t| FeedToast {
                    item_id: c.item_id.clone(),
                    value: t.value.clone(),
                    symbol: t.symbol.clone(),
                    deadline_ms: t.deadline_ms,
                })
            })
        };

        FeedView {
            rows,
            transactions: model.records.clone(),
            new_item_id: model.celebration.as_ref().map(|c| c.item_id.clone()),
            toast,
        }
    }
}

// ---------------------------------------------------------------------------
// Shell results
// ---------------------------------------------------------------------------

fn accept(model: &mut Model, result: FeedShellResult) -> Command<FeedEffect, Event> {
    match result {
        FeedShellResult::StoreLoaded { records, now_ms } => {
            // The raw account-scoped list (`loadActivityTransactions`).
            let lc = model.address.to_lowercase();
            model.records = records
                .iter()
                .filter(|t| match t.kind() {
                    FeedTxKind::Receive => t.to.to_lowercase() == lc,
                    FeedTxKind::Send => t.from.to_lowercase() == lc,
                    _ => false,
                })
                .cloned()
                .collect();

            // Fold, then tombstone-filter — the reload path is the ONLY
            // setter, and it is the tombstones' single enforcement point
            // (invariant ⑤).
            let mut items = build_items(&records, &model.address);
            items.retain(|item| !model.tombstones.contains(&item.id));
            model.items = items;

            let mut commands = Vec::new();

            // A post-sync re-read may celebrate its newest incoming item —
            // never the first pass (invariant ③ was consumed upstream: the
            // flag is only ever set after `initialized`).
            if mem::take(&mut model.celebrate_on_next_load) {
                let newest_in = model
                    .items
                    .iter()
                    .find(|item| item.direction == FeedDirection::In);
                if let Some(item) = newest_in {
                    // Incoming items always carry a value; if one ever
                    // doesn't, fail closed: no toast rather than a wrong one.
                    if let Some(value) = item.value.clone() {
                        model.generation = model.generation.wrapping_add(1);
                        let generation = model.generation;
                        model.celebration = Some(Celebration {
                            item_id: item.id.clone(),
                            toast: Some(ToastState {
                                value,
                                symbol: item.symbol.clone(),
                                deadline_ms: now_ms + f64::from(TOAST_MS),
                                generation,
                            }),
                        });
                        commands.push(shell_request(model.attempt, FeedOperation::Haptic));
                        commands.push(shell_request(
                            model.attempt,
                            FeedOperation::Timer {
                                ms: TOAST_MS,
                                generation,
                            },
                        ));
                    }
                }
            }

            // Alias resolution — memoised per session: items already carrying
            // a stored local name never ask (invariant ⑦'s "local wins"),
            // attempted addresses never ask again
            // (`useHomeController.ts:422-427`).
            for item in &model.items {
                if item.alias.is_some() {
                    continue;
                }
                let Some(addr) = &item.counterparty else {
                    continue;
                };
                let addr = addr.to_lowercase();
                if !model.alias_attempted.insert(addr.clone()) {
                    continue;
                }
                commands.push(shell_request(
                    model.attempt,
                    FeedOperation::ResolveRecipientIdentity { addr },
                ));
            }

            commands.push(render());
            Command::all(commands)
        }

        FeedShellResult::SyncCompleted { new_count } => {
            // `initializedRef.current = true` runs whether or not anything
            // landed — the first pass is spent either way (invariant ③).
            let first_pass = !model.initialized;
            model.initialized = true;
            if new_count == 0 {
                // No re-read: the feed never flickers behind a no-op sync
                // (invariant ②).
                return Command::done();
            }
            if !first_pass {
                model.celebrate_on_next_load = true;
            }
            shell_request(
                model.attempt,
                FeedOperation::ReadTxStore {
                    address: model.address.clone(),
                },
            )
        }

        FeedShellResult::AliasResolved { addr, name } => match name {
            // `if (id?.name)` — an empty name is falsy in TS; same here.
            Some(name) if !name.is_empty() => {
                model.alias_map.insert(addr.to_lowercase(), name);
                render()
            }
            _ => Command::done(),
        },

        // The `.finally()` port: the tombstone drops on failure too, so a
        // failed delete lets the next reload resurrect the row — ported
        // verbatim (the record really is still in storage).
        FeedShellResult::DeleteCommitted { id } | FeedShellResult::DeleteFailed { id } => {
            model.tombstones.remove(&id);
            Command::done()
        }

        FeedShellResult::ToastExpired { generation } => {
            if let Some(celebration) = &mut model.celebration {
                let current = celebration
                    .toast
                    .as_ref()
                    .is_some_and(|t| t.generation == generation);
                if current {
                    // The toast goes; the row glow stays (`newItemId` is
                    // never cleared by the timer).
                    celebration.toast = None;
                    return render();
                }
            }
            // A superseded timer (`clearTimeout` in TS) — a no-op.
            Command::done()
        }

        FeedShellResult::HapticPlayed => Command::done(),
    }
}

// ---------------------------------------------------------------------------
// Pure folding — the `loadActivityItems` port (`activity.ts:428-478`)
// ---------------------------------------------------------------------------

/// Fold raw records into feed items: same-id dedupe first, then batch
/// folding by shared `userOpHash`, newest-first (invariant ①).
fn build_items(records: &[FeedTxRecord], address: &str) -> Vec<FeedItem> {
    if address.is_empty() {
        return Vec::new();
    }
    let lc = address.to_lowercase();

    // Group 'send' siblings by userOpHash — deduping by id FIRST so a legacy
    // same-id duplicate (a resubmitted single send) is NOT mistaken for a
    // batch; only genuinely distinct lines count toward the group size
    // (`activity.ts:439-451`).
    let mut send_groups: BTreeMap<&str, Vec<&FeedTxRecord>> = BTreeMap::new();
    let mut group_seen: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    for t in records {
        if t.kind() != FeedTxKind::Send {
            continue;
        }
        if t.from.to_lowercase() != lc || t.user_op_hash.is_empty() {
            continue;
        }
        let ids = group_seen.entry(&t.user_op_hash).or_default();
        if !ids.insert(&t.id) {
            continue; // same-id duplicate — count the line once
        }
        send_groups.entry(&t.user_op_hash).or_default().push(t);
    }

    // `item.id` is the list key — guard against legacy duplicate-id records
    // so a row can never render twice, and skip every member of a batch once
    // its grouped row has been emitted (`activity.ts:453-476`).
    let mut items = Vec::new();
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for t in records {
        if seen.contains(t.id.as_str()) {
            continue;
        }
        let item = match t.kind() {
            FeedTxKind::Receive if t.to.to_lowercase() == lc => Some(receive_item(t)),
            FeedTxKind::Send if t.from.to_lowercase() == lc => {
                let group = if t.user_op_hash.is_empty() {
                    None
                } else {
                    send_groups.get(t.user_op_hash.as_str())
                };
                match group {
                    Some(group) if group.len() > 1 => {
                        for member in group {
                            seen.insert(&member.id);
                        }
                        batch_item(group)
                    }
                    _ => Some(send_item(t)),
                }
            }
            _ => None,
        };
        let Some(item) = item else {
            continue;
        };
        seen.insert(&t.id);
        items.push(item);
    }

    // `sort((a, b) => b.timestamp - a.timestamp)` — stable in both runtimes.
    items.sort_by(|a, b| b.timestamp.total_cmp(&a.timestamp));
    items
}

/// `receiveRecordToActivity` — structured (no pre-formatting).
fn receive_item(t: &FeedTxRecord) -> FeedItem {
    FeedItem {
        id: t.id.clone(),
        direction: FeedDirection::In,
        counterparty: Some(t.from.clone()),
        // Receives never carry a stored name (toName is the send-side field).
        alias: None,
        value: Some(t.value.clone()),
        symbol: t.symbol.clone(),
        decimals: Some(t.decimals),
        usd_value: tx_usd_value(t),
        chain_id: t.chain_id,
        timestamp: t.timestamp,
        day_start_ms: t.day_start_ms,
        tx_hash: non_empty(&t.tx_hash),
        batch: None,
    }
}

/// `sendTxToActivity` — structured.
fn send_item(t: &FeedTxRecord) -> FeedItem {
    FeedItem {
        id: t.id.clone(),
        direction: FeedDirection::Out,
        counterparty: Some(t.to.clone()),
        alias: t.to_name.clone(),
        value: Some(t.value.clone()),
        symbol: t.symbol.clone(),
        decimals: Some(t.decimals),
        usd_value: tx_usd_value(t),
        chain_id: t.chain_id,
        timestamp: t.timestamp,
        day_start_ms: t.day_start_ms,
        tx_hash: non_empty(&t.tx_hash),
        batch: None,
    }
}

/// `batchSendToActivity`: one row for the whole group, per-line breakdown
/// attached. Split sums to one token figure; multi_select can't sum mixed
/// tokens, so `value` is `None` and the shell leads with the fiat total +
/// asset count.
fn batch_item(group: &[&FeedTxRecord]) -> Option<FeedItem> {
    let first = group.first()?;
    let batch = build_batch(group)?;
    let split = batch.kind == FeedBatchKind::Split;
    let value = if split {
        // `transfers.reduce((s, x) => s + (parseFloat(x.value) || 0), 0)`.
        let sum: f64 = batch
            .transfers
            .iter()
            .map(|x| {
                let v = js_parse_float(&x.value);
                if v.is_finite() {
                    v
                } else {
                    0.0
                }
            })
            .sum();
        Some(format!("{sum}"))
    } else {
        None
    };
    Some(FeedItem {
        // `b.userOpHash || group[0].id` — ported fallback.
        id: if batch.user_op_hash.is_empty() {
            first.id.clone()
        } else {
            batch.user_op_hash.clone()
        },
        direction: FeedDirection::Out,
        counterparty: batch.to.clone(),
        alias: batch.to_name.clone(),
        value,
        symbol: batch.symbol.clone().unwrap_or_default(),
        decimals: if split { Some(first.decimals) } else { None },
        usd_value: batch.total_usd,
        chain_id: batch.chain_id,
        timestamp: batch.timestamp,
        day_start_ms: first.day_start_ms,
        tx_hash: non_empty(&batch.tx_hash),
        batch: Some(batch),
    })
}

/// `buildBatchView` (`activity.ts:210-236`) — the kind ternary ported
/// verbatim, ambiguous mixed groups included.
fn build_batch(group: &[&FeedTxRecord]) -> Option<FeedBatch> {
    let first = group.first()?;
    let symbols: BTreeSet<&str> = group.iter().map(|g| g.symbol.as_str()).collect();
    let recipients: BTreeSet<String> = group.iter().map(|g| g.to.to_lowercase()).collect();
    let kind = if symbols.len() <= 1 && recipients.len() > 1 {
        FeedBatchKind::Split
    } else if recipients.len() <= 1 && symbols.len() > 1 {
        FeedBatchKind::MultiSelect
    } else if symbols.len() <= 1 {
        FeedBatchKind::Split
    } else {
        FeedBatchKind::MultiSelect
    };
    let split = kind == FeedBatchKind::Split;
    Some(FeedBatch {
        kind,
        count: u32::try_from(group.len()).unwrap_or(u32::MAX),
        total_usd: group.iter().map(|g| tx_usd_value(g)).sum(),
        transfers: group
            .iter()
            .map(|g| FeedBatchTransfer {
                to: g.to.clone(),
                to_name: g.to_name.clone(),
                value: g.value.clone(),
                symbol: g.symbol.clone(),
                decimals: g.decimals,
                usd_value: tx_usd_value(g),
                logo_urls: g.logo_urls.clone(),
            })
            .collect(),
        ids: group.iter().map(|g| g.id.clone()).collect(),
        from: first.from.clone(),
        chain_id: first.chain_id,
        timestamp: first.timestamp,
        status: first.status,
        tx_hash: first.tx_hash.clone(),
        user_op_hash: first.user_op_hash.clone(),
        symbol: if split { Some(first.symbol.clone()) } else { None },
        logo_urls: if split { first.logo_urls.clone() } else { None },
        to: if split { None } else { Some(first.to.clone()) },
        to_name: if split { None } else { first.to_name.clone() },
    })
}

// ---------------------------------------------------------------------------
// Valuation — the `txUsdValue` port (`activity.ts:149-181`)
// ---------------------------------------------------------------------------

/// Numeric USD for a record. Prefers the value stored at event time; if
/// missing/zero but the token is a known stablecoin, falls back to the token
/// amount (≈ $1 each) — a received USDT never shows $0.00 (invariant ⑧).
pub fn tx_usd_value(t: &FeedTxRecord) -> f64 {
    // `tx.usd ? parseFloat(tx.usd.replace(/[^0-9.]/g, '')) : 0` — an absent
    // OR empty string is falsy.
    let stored = match t.usd.as_deref() {
        Some(usd) if !usd.is_empty() => {
            let cleaned: String = usd
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            js_parse_float(&cleaned)
        }
        _ => 0.0,
    };
    if stored.is_finite() && stored > 0.0 {
        return stored;
    }
    if is_stable(&t.symbol) {
        // `parseFloat(tx.value || '0')`.
        let raw = if t.value.is_empty() { "0" } else { &t.value };
        let amount = js_parse_float(raw);
        if amount.is_finite() && amount > 0.0 {
            return amount;
        }
    }
    0.0
}

/// `isStable`: upper-case, fold the Tether glyph "₮" to "T" so the on-chain
/// "USD₮0" matches "USDT0" (`stableKey`, ported verbatim).
pub fn is_stable(symbol: &str) -> bool {
    let key = symbol.to_uppercase().replace('₮', "T");
    STABLE_SYMBOLS.iter().any(|s| *s == key)
}

/// JS `parseFloat`: longest valid numeric prefix after leading whitespace;
/// no parseable prefix ⇒ NaN. (The `Infinity` literal is not accepted here —
/// no feed string ever contains it, and rejecting it fails closed to NaN ⇒ 0.)
fn js_parse_float(s: &str) -> f64 {
    let t = s.trim_start();
    let b = t.as_bytes();
    let mut i = 0usize;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let mut digits = 0usize;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
        digits += 1;
    }
    if i < b.len() && b[i] == b'.' {
        i += 1;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
            digits += 1;
        }
    }
    if digits == 0 {
        return f64::NAN;
    }
    let mut end = i;
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut j = i + 1;
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
            j += 1;
        }
        let mut exp_digits = 0usize;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
            exp_digits += 1;
        }
        if exp_digits > 0 {
            end = j;
        }
    }
    t.get(..end)
        .and_then(|prefix| prefix.parse::<f64>().ok())
        .unwrap_or(f64::NAN)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// `txHash || undefined`.
fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_owned())
    }
}

/// The tick pipeline: paint from cache + discover receipts. The TS original
/// runs these sequentially inside one `loadData`; issuing both at once keeps
/// the same visible behavior (the read commits the cached feed the moment it
/// answers; the scan re-reads only when something landed).
fn load_pipeline(model: &Model) -> Command<FeedEffect, Event> {
    if model.address.is_empty() {
        return render();
    }
    let attempt = model.attempt;
    Command::all([
        shell_request(
            attempt,
            FeedOperation::ReadTxStore {
                address: model.address.clone(),
            },
        ),
        shell_request(
            attempt,
            FeedOperation::ScanIncomingTransfers {
                address: model.address.clone(),
            },
        ),
        render(),
    ])
}

/// Issue one operation whose answer must match the current attempt.
fn shell_request(attempt: u64, operation: FeedOperation) -> Command<FeedEffect, Event> {
    Command::request_from_shell(operation)
        .then_send(move |result| Event::ShellCompleted { attempt, result })
}

impl super::SplitEffect for FeedEffect {
    type Op = FeedOperation;
    fn into_shell(self) -> Option<crux_core::Request<FeedOperation>> {
        match self {
            FeedEffect::Render(_) => None,
            FeedEffect::Shell(request) => Some(request),
        }
    }
}
