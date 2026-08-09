//! Machine — recently-opened dApps for the in-app browser (spec
//! `016-crux-wallet-state`, browser_history P3).
//!
//! ```text
//! Start ─► ReadHistory ─► Loaded{entries} ─► ready mirror
//!   VisitRecorded ─► parse origin ─┬─ no web origin ─► dropped
//!                                  └─ dedupe by origin, prepend, cap ─► WriteHistory
//!   DeleteOrigin ─► filter ─► WriteHistory        ClearAll ─► RemoveHistory
//! ```
//!
//! One entry PER ORIGIN (not per page) so the list reads as "dApps I've
//! used", not a raw page log — revisiting a different path of the same site
//! updates the single entry in place (latest url/title/favicon/time) and
//! bumps it to the top. Newest-first, capped at [`CAP`], nothing sensitive
//! stored: just the public site url/title/favicon.
//!
//! Ported from `src/services/browser-history.ts` (whole file — already pure,
//! already time-injected) and its one caller `src/app/browser.tsx:322-326`.
//! The shell fires [`Event::VisitRecorded`] when a page settles (load-finish,
//! and again when the favicon resolves — which is why an update without a
//! title/favicon must keep the previously captured one, invariant ③). The
//! WebView gating (`n.url && !n.loading && !n.error`) stays in the shell; the
//! core owns the dedupe, the fallback chain, the cap and the persistence
//! decisions. Time never originates here — `now_ms` rides on the event
//! (browser-history.ts:72 already takes `now` as a parameter).
//!
//! The TS service is stateless (read-modify-write per call); the port keeps
//! the model as a mirror of the store, hydrated once at [`Event::Start`].
//! Every mutation immediately mirrors back via a best-effort write, so store
//! and model can only drift by a swallowed storage error — the same exposure
//! the TS `write()`'s empty `catch` has today.

use crux_core::capability::Operation;
use crux_core::macros::effect;
use crux_core::{render::render, render::RenderOperation, App, Command};
use serde::{Deserialize, Serialize};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// `slice(0, CAP)` on every write — invariant ④ (browser-history.ts:10).
pub const CAP: usize = 40;

// ---------------------------------------------------------------------------
// Wire value types
// ---------------------------------------------------------------------------

/// One visited dApp. Serialises 1:1 to the TS `BrowserHistoryEntry` the shell
/// persists under `vela.browserHistory` (epoch ms as `f64` — no u64 crosses
/// the wire).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct BhistEntry {
    /// `scheme://host` — the dedupe key.
    pub origin: String,
    /// The full last-visited URL, verbatim as the shell reported it
    /// (revisiting reopens where the user left off).
    pub url: String,
    pub host: String,
    pub title: String,
    /// Favicon URL — `""` when none resolved (the TS shape, ported verbatim:
    /// empty string, not an absent field).
    pub favicon: String,
    /// Epoch ms of the last visit — injected, never read from a core clock
    /// (invariant ⑤).
    pub last_visited_ms: f64,
}

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

/// The KV vocabulary on `vela.browserHistory` (inventory: `KvOp{get|set|remove}`).
/// The shell owns the key and the AsyncStorage handle; the core only decides
/// what the stored list must become.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "BhistOperation"))]
pub enum BhistOperation {
    /// KV get. Unreadable/corrupt/non-array answers as `Loaded { entries: [] }`
    /// — exactly the TS `read()`'s `catch { [] }` (browser-history.ts:41-49).
    ReadHistory,
    /// KV set — best effort (the TS `write()` swallows storage errors; the
    /// in-memory mirror stays authoritative).
    WriteHistory { entries: Vec<BhistEntry> },
    /// KV remove — [`Event::ClearAll`] deletes the key rather than writing
    /// `[]`, ported verbatim (browser-history.ts:99-105).
    RemoveHistory,
}

/// What the shell observed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "BhistShellResult"))]
pub enum BhistShellResult {
    /// Contents of `vela.browserHistory`, in stored order.
    Loaded { entries: Vec<BhistEntry> },
    /// A best-effort write/remove acknowledged. Never changes state.
    Written,
}

impl Operation for BhistOperation {
    type Output = BhistShellResult;
}

#[effect]
pub enum BhistEffect {
    Render(RenderOperation),
    Shell(BhistOperation),
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "bindings", derive(TS), ts(rename = "BhistEvent"))]
pub enum Event {
    /// App/browser surface came up — hydrate the mirror from storage.
    /// Single-shot: once hydrated the mirror is authoritative, and re-reading
    /// mid-session could only replay what this core already wrote.
    Start,
    /// A page settled in the WebView. Fires on load-finish and again when the
    /// favicon resolves (browser.tsx:322-326), so an update lacking a
    /// title/favicon must never clobber a previously captured one. `now_ms`
    /// is injected by the shell (invariant ⑤; browser-history.ts:72).
    VisitRecorded {
        url: String,
        title: Option<String>,
        favicon: Option<String>,
        now_ms: f64,
    },
    /// Remove a single origin's entry.
    DeleteOrigin { origin: String },
    /// Clear the whole history (removes the stored key).
    ClearAll,
    /// Internal: an effect resolved. `attempt` is captured when the request
    /// is made; a result carrying an older attempt is dropped.
    #[serde(skip)]
    ShellCompleted {
        attempt: u64,
        result: BhistShellResult,
    },
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Phase {
    #[default]
    Fresh,
    /// `ReadHistory` is in flight.
    Hydrating,
    /// The mirror is live.
    Ready,
}

#[derive(Default)]
pub struct Model {
    /// Mirror of the store, in STORED order (newest prepended, cap trims the
    /// tail — both verbatim from `recordBrowserVisit`/`write`). The view
    /// sorts by recency; see [`BhistView::entries`].
    entries: Vec<BhistEntry>,
    phase: Phase,
    attempt: u64,
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct BhistView {
    /// Sorted by `last_visited_ms` descending — `getBrowserHistory`'s sort,
    /// ported verbatim. With an injected clock that ran backwards, stored
    /// order and recency order can differ; recency wins on screen.
    pub entries: Vec<BhistEntry>,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct BrowserHistory;

impl App for BrowserHistory {
    type Event = Event;
    type Model = Model;
    type ViewModel = BhistView;
    type Effect = BhistEffect;

    fn update(&self, event: Event, model: &mut Model) -> Command<BhistEffect, Event> {
        match event {
            Event::Start => {
                if model.phase != Phase::Fresh {
                    return Command::done();
                }
                model.attempt += 1;
                model.phase = Phase::Hydrating;
                request(model, BhistOperation::ReadHistory)
            }

            Event::VisitRecorded {
                url,
                title,
                favicon,
                now_ms,
            } => {
                // Every TS mutator `await`ed its read first, so nothing could
                // act on an unloaded store; here a mutation before hydration
                // is dropped instead — fail-closed (the shell dispatches
                // `Start` at mount, long before any page can settle).
                if model.phase != Phase::Ready {
                    return Command::done();
                }
                let Some((origin, host)) = parse_web_origin(&url) else {
                    // 只记真实 web origin — no origin, no entry, no write
                    // (verbatim `if (!origin) return`, invariant ①).
                    return Command::done();
                };
                // `visit.title || prev?.title || hostOf(url)` and
                // `visit.favicon || prev?.favicon || ''` — the JS falsy
                // chains, where an EMPTY string counts as absent. Ported
                // verbatim (invariant ③: favicon resolves a beat after the
                // title, and a later bare update must keep both).
                let (title, favicon) = {
                    let prev = model.entries.iter().find(|e| e.origin == origin);
                    (
                        falsy_chain(title, prev.map(|e| e.title.as_str()), &host),
                        falsy_chain(favicon, prev.map(|e| e.favicon.as_str()), ""),
                    )
                };
                let next = BhistEntry {
                    origin: origin.clone(),
                    url,
                    host,
                    title,
                    favicon,
                    last_visited_ms: now_ms,
                };
                // `[next, ...rest].slice(0, CAP)` — dedupe by origin, prepend,
                // trim the stored tail (invariants ② and ④).
                model.entries.retain(|e| e.origin != origin);
                model.entries.insert(0, next);
                model.entries.truncate(CAP);
                persist(model)
            }

            Event::DeleteOrigin { origin } => {
                if model.phase != Phase::Ready {
                    return Command::done();
                }
                model.entries.retain(|e| e.origin != origin);
                // The TS delete writes even when nothing matched — verbatim.
                persist(model)
            }

            Event::ClearAll => {
                if model.phase != Phase::Ready {
                    return Command::done();
                }
                model.entries.clear();
                request(model, BhistOperation::RemoveHistory)
            }

            Event::ShellCompleted { attempt, result } => {
                if attempt != model.attempt {
                    return Command::done();
                }
                accept(model, result)
            }
        }
    }

    fn view(&self, model: &Model) -> BhistView {
        let mut entries = model.entries.clone();
        // Stable sort, like today's `Array.sort` — ties keep stored
        // (newest-prepended) order.
        entries.sort_by(|a, b| b.last_visited_ms.total_cmp(&a.last_visited_ms));
        BhistView { entries }
    }
}

// ---------------------------------------------------------------------------
// Shell results
// ---------------------------------------------------------------------------

fn accept(model: &mut Model, result: BhistShellResult) -> Command<BhistEffect, Event> {
    match (model.phase, result) {
        (Phase::Hydrating, BhistShellResult::Loaded { entries }) => {
            // NOT capped here: the TS `read()` doesn't slice — a legacy
            // over-cap store shows in full until the next write trims it.
            // Ported verbatim.
            model.entries = entries;
            model.phase = Phase::Ready;
            render()
        }
        // A best-effort write/remove acknowledged, or a result shape the
        // current phase doesn't expect. Neither may change state.
        _ => Command::done(),
    }
}

// ---------------------------------------------------------------------------
// Pure policy
// ---------------------------------------------------------------------------

/// The `a || b || c` JS falsy chain: first NON-EMPTY of the fresh value, the
/// previously stored one, then the fallback.
fn falsy_chain(fresh: Option<String>, previous: Option<&str>, fallback: &str) -> String {
    if let Some(value) = fresh {
        if !value.is_empty() {
            return value;
        }
    }
    if let Some(value) = previous {
        if !value.is_empty() {
            return value.to_owned();
        }
    }
    fallback.to_owned()
}

/// `originOf` + `hostOf` (browser-history.ts:25-39) as one parse:
/// `Some((origin, host))` for an authority-carrying URL, `None` otherwise.
///
/// The TS pair accepts anything WHATWG `new URL` parses — including
/// authority-LESS URLs, so `about:blank` would today be recorded under the
/// origin `"about://"` and `javascript:alert(1)` under `"javascript://"`.
/// Inventory invariant ① reads 只记真实 web origin, and this port fail-closes
/// to it: no `://` authority, no entry. Likewise the WHATWG corners a hand
/// parser cannot honestly reproduce — punycode/IDN hosts, percent-encoded or
/// exotic host code points, tab/newline stripping inside the string,
/// backslash-as-slash and slash-less special-scheme forms
/// (`https:example.com`), IPv6 canonicalisation — all drop (or, for IPv6,
/// pass through unnormalised) rather than half-parse; the `siwe_host`
/// precedent in `clear_signing.rs`. Within the accepted set the output
/// matches `new URL`: lowercased scheme and host, userinfo stripped at the
/// LAST `@`, default port stripped for the special schemes, a non-default
/// port kept (leading zeros normalised, > 65535 rejected). A non-web scheme
/// WITH an authority (`velawallet://sign`) is recorded, exactly as today —
/// ported verbatim.
fn parse_web_origin(url: &str) -> Option<(String, String)> {
    // WHATWG strips leading/trailing C0 controls and spaces before parsing.
    let url = url.trim_matches(|c: char| c <= ' ');

    // Scheme: `[a-zA-Z][a-zA-Z0-9+.-]*` before a literal `://`.
    let idx = url.find("://")?;
    let scheme = url.get(..idx)?;
    let mut chars = scheme.chars();
    if !chars.next()?.is_ascii_alphabetic() {
        return None;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c)) {
        return None;
    }
    let scheme = scheme.to_ascii_lowercase();

    // Authority ends at the first path/query/fragment delimiter; userinfo
    // (if any) ends at the LAST `@` — matching WHATWG, and letting
    // `trusted.org@evil.com` resolve to `evil.com`.
    let rest = url.get(idx + 3..)?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let host_port = authority.rsplit_once('@').map_or(authority, |(_, hp)| hp);

    // Split host from port; IPv6 literals keep their brackets.
    let (raw_host, port) = if host_port.starts_with('[') {
        let close = host_port.find(']')?;
        let host = host_port.get(..=close)?;
        let tail = host_port.get(close + 1..)?;
        let port = match tail.strip_prefix(':') {
            Some(p) => Some(p),
            None if tail.is_empty() => None,
            None => return None,
        };
        let inner = host.get(1..host.len() - 1)?;
        if inner.is_empty() || !inner.bytes().all(|b| b.is_ascii_hexdigit() || b == b':' || b == b'.') {
            return None;
        }
        (host, port)
    } else {
        match host_port.rsplit_once(':') {
            Some((h, p)) => (h, Some(p)),
            None => (host_port, None),
        }
    };
    if raw_host.is_empty() {
        return None;
    }
    if !raw_host.starts_with('[')
        && !raw_host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.' || b == b'_')
    {
        return None;
    }
    let host_lc = raw_host.to_ascii_lowercase();

    let host = match port {
        None => host_lc,
        Some(p) if p.is_empty() => host_lc, // `https://x.io:` — valid, portless
        Some(p) => {
            if !p.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            let number: u32 = p.parse().ok()?;
            if number > 65_535 {
                return None;
            }
            if default_port(&scheme) == Some(number) {
                host_lc
            } else {
                format!("{host_lc}:{number}")
            }
        }
    };

    let origin = format!("{scheme}://{host}");
    Some((origin, host))
}

/// WHATWG default ports — stripped from `u.host` for the special schemes
/// only; a non-special scheme keeps any port it declared.
fn default_port(scheme: &str) -> Option<u32> {
    match scheme {
        "http" | "ws" => Some(80),
        "https" | "wss" => Some(443),
        "ftp" => Some(21),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/// Mirror the (already capped) list back to the store — best effort, like the
/// TS `write()`.
fn persist(model: &mut Model) -> Command<BhistEffect, Event> {
    let entries = model.entries.clone();
    request(model, BhistOperation::WriteHistory { entries })
}

/// Issue one operation whose answer must match the current attempt.
fn request(model: &mut Model, operation: BhistOperation) -> Command<BhistEffect, Event> {
    let attempt = model.attempt;
    Command::all([
        Command::request_from_shell(operation)
            .then_send(move |result| Event::ShellCompleted { attempt, result }),
        render(),
    ])
}

impl super::SplitEffect for BhistEffect {
    type Op = BhistOperation;
    fn into_shell(self) -> Option<crux_core::Request<BhistOperation>> {
        match self {
            BhistEffect::Render(_) => None,
            BhistEffect::Shell(request) => Some(request),
        }
    }
}
