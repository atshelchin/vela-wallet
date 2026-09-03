# Delivery Report — 025 Web Read Wiring

**Branch**: `025-web-read-wiring` · Started 2026-09-03 · Base: `main` @ c13e89d4
(PR #182 merged while phase 0 was being written — the branch contains
origin/main's tip; the spec header's "stacked" note is thereby moot).

---

## Baselines (T101, T102) — recorded @ 047cd7c4

- Core artifact: `static/vela_core_bg.4603c8421603.wasm` = **3,630,664 B**
  (must close byte-identical — SC-106).
- Corpus pins: 1620 paths = 1536 leaf + 84 branch (unchanged since 024).
- Port-provenance surface (16 files, **4,006 lines** @ c13e89d4): services
  rpc-pool 451 / rpc-pool-endpoints 287 / endpoint-admission 63 /
  wallet-api 754 / balance-cache 73 / activity 564 / token-metadata 152 /
  incoming-transfers 55 / recipient-identity (T140) / fiat-rate-quote 71 /
  readonly-rpc-gate 109; wallet-state-core executors: rpc-pool 587-class /
  balance / feed / token-trust / manage-tokens (+ their types/session/
  resident files, ported alongside).
- Green tree: 024's close-out numbers stand on this base (unit 427, e2e
  85/85, check 1167/0).

### The four superseded 024 arms (T102)

| 024 fail-closed arm | 025 phase that flips it |
| --- | --- |
| network_admin `invalidate_pools` / `clear_bundler_cache` (ack no-ops) | Phase 2 (T114) |
| settings HOME RPC-health tiles (fixture, `// live in 025`) | Phase 2 (T115) |
| contacts `resolve_identity` / `classify_recipient` (null) | Phase 5 (T140) |
| display_currency `resolve_rate` (null) | Phase 5 (T141) |

## Green-tree check

Inherited from 024 close-out on the same tree state; re-run at each phase
gate as usual.


---

## Phase 2 — the pool (T110–T118)

**What shipped**: chain reads exist. `RpcPoolCore` routes them through the
ported facade (`$lib/services/rpc-pool.ts` — fetch + the caller's promise;
every decision in Rust), over the ported endpoint collection
(six-tier candidates; NEVER_BANNED at collection because the core filters at
selection), with the ban map persisting byte-compatibly under
`vela.rpc.banned`. The port pulled in its support graph: the canonical
chains table (audit-whitelisted as content), a trimmed networks model whose
custom-cache refresh also restored the invalidation 024's executor had to
leave out, KV record readers, provider URL builders, endpoint getters and a
parsed `fetchChainInfo`.

**The harness (D11)**: `e2e/stub-chain.ts` — deny-off-origin by default
(silence about a missed stub is a failed request, never a live call), JSON-RPC
stubs by method, an IndexedDB reader, and a `window.vela` console gated on
`vela.dev.console` + dev builds, loaded via DYNAMIC import so no core glue
reaches the first-paint chunk. SC-102 passed first run: a 401 primary is
routed around, its permanent ban persists, and a reload gives it zero free
attempts (the bans-before-first-selection ordering proven end to end).

**Gates**: check 1181 files/0 · lint clean · unit 435 · build ×15 · e2e full
suite green (one webkit artifact-assertion flake, clean on isolated re-run —
watched, not suppressed).


---

## Phase 3 — the home tells the truth (T120–T127)

**What shipped**: `/{locale}/wallet` renders the core's balances. The ported
`balance_dashboard` resident (dedup by structural key, reference-stable
projections, boot-time privacy hydrate) drives a thin Svelte bridge
(`balance.svelte.ts`); `wallet/live.ts` overlays the drawn home/desktop
models with `liveBalance` / `liveAssetRow` (presentation only — the total is
the core's aggregation, converted at the committed display-currency rate or
shown as the honest USD figure when `rate: null`); `flows/live.ts` gives the
pushed Assets screen the SAME holdings through the same row builder. Tap-to-
hide: the visible figure becomes the toggle target when a handler is present
(the drawn component only had the hidden-state eye-off), gallery unchanged.
Page visibility → `app_focused`/`app_backgrounded`.

**The port graph** (all provenance-headed @ c13e89d4): wallet-api (multicall
+ DEX/Chainlink pipeline verbatim), balance-cache (KV), abi, chain-tokens,
price-service, native-price (core kernels re-exported from `client.ts`),
tokens-model (trimmed `models/types`), tokens, token-metadata, erc20-meta,
platform (web haptics no-op + visibility), transfer-types; wallet-state
balance/token-trust/manage-tokens × types/executor/session/resident. 38
strict-mode errors surfaced in the port (`unknown` where Expo had `any`,
multiGet/multiSet, `_param` conventions) — all resolved at the seams, no
logic touched.

**The hermetic home (e2e/home-truth.e2e.ts)**: every chain's RPC is a seeded
user override to the stub host (deterministic fastest-endpoint race), the
registry knows only Ethereum, and ONE stub answer shape serves both decoders
(word 0 = balance for `decU256`, word 1 = price for `decChainlinkUsd`), so
1.5 ETH at $3,000 renders $4,500 with zero live traffic. Two real findings:
(1) since the home now fetches on load, a config seed written afterwards is
not seen until the next document — tests seed-then-reload, which is also how
a real settings edit reaches the pool; (2) the fixture Assets screen would
have shown staged tokens behind a live home — now live.

**Recorded**: the chain-filter pill is not interactive in the drawn web home
(deferred); manage_tokens/token_trust are ported and typed but their UI
entries (add-token sheet; incoming scan) land with Phase 4 / a later sheet
wiring; the pool test's `poolCall` now waits for the dynamically imported
console (a 2-worker race that passed in isolation).

**Gates**: check 1211/0 · lint clean · unit 456 · build ×15 · **e2e 88/88**
(chromium + firefox + webkit); wasm byte-identical.
