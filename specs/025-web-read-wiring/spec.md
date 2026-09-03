# Feature Specification: Web Read Wiring — The Wallet Home Tells the Truth

**Feature Branch**: `025-web-read-wiring` (stacked on `024-web-live-shell`)

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "第二个 spec：网络读层落地。rpc_pool（底座）→ balance_dashboard + activity_feed + manage_tokens + token_trust 喂 src/lib/wallet/ → receive_watch + payment_request 接收款 → 回填 024 留下的缝（设置 RPC 健康磁贴、contacts 的 identity/classify、display_currency 的汇率解析）。移植参考 Expo：services/rpc-pool.ts 已是 RpcPoolCore 的 web 门面，wallet-api/balance-cache/activity/token-metadata 照搬去 RN 化。"

## Why

After 024, a signed-in person's settings and address book are real — but the
wallet home still shows a stranger's staged balances, and the receive screen
cannot notice a deposit. The missing ingredient is one thing: the web client
has no way to *read a chain*. This feature lands that ingredient — the RPC
transport under the core's pool machine — and then lets every read-path
machine that was already waiting aboard speak: balances, activity, token
metadata, deposit watching, payment requests.

The porting reality discovered in 024 holds even more strongly here: on the
Expo side (post-#168) the pool POLICY already lives in `rpc_pool.rs` (six-tier
scoring, bans, cooldowns, the three-pass sweep — all tested in Rust), and
`services/rpc-pool.ts` is already the thin web facade over that core. This
spec is a port of working code, not a design.

**Backfills owed from 024** (each was answered fail-closed and marked
`live in 025`): the settings RPC-health tiles, contacts' `resolve_identity` /
`classify_recipient`, and display_currency's `resolve_rate`.

**Standing exclusions**: no explore tab, no dApp surfaces (026+/dapp spec);
the money path (send, signing, tracking) is 026. The receive screen's
on-chain *watcher* is in; producing a signed transaction is not.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A wallet home that tells the truth (Priority: P1)

A signed-in person opens the wallet tab and sees THEIR balances: real tokens
across the supported networks, a real total in their chosen display currency,
per-chain filtering, and cached figures (marked stale-safe) when the network
is down — never a fixture's ¥1,383.

**Why this priority**: the home screen is the product's face; every other
read surface hangs off the data it proves.

**Independent Test**: open `/{locale}/wallet` with a funded test address
seeded; balances render from the chain (or from cache when offline) and match
what an explorer says; the fixture identities never appear.

**Acceptance Scenarios**:

1. **Given** a wallet with tokens on ≥2 networks, **When** the home opens,
   **Then** each token row shows its real balance and the header total is the
   core's aggregation, converted at the display-currency rate (or the USD
   figure when no rate — 024's rule, now with a live source).
2. **Given** all RPC endpoints for one chain failing, **When** the home
   loads, **Then** that chain's cached balances render under the core's
   stale rules and the app does not spin forever — and a rate-limited chain
   is presented as transient, never as a swap-your-RPC alarm.
3. **Given** a reload, **Then** cached balances paint first and live figures
   replace them when they land (max(live, cached) per the core's rules).
4. **Given** the person hides balances (tap-to-hide), **Then** the privacy
   choice persists and every money figure on the screen honours it.
5. **Given** any of the 15 locales, **Then** all live copy resolves from the
   corpus.

---

### User Story 2 - Activity that happened (Priority: P2)

The activity feed lists the wallet's real transfers — received and sent,
deduped and day-grouped by the core's rules — and a deposit that arrives
while the person watches the receive screen is noticed and celebrated.

**Independent Test**: with a test address that has on-chain history, the feed
lists real transfers; sending a deposit to the address while the receive
screen is open surfaces the arrival without a manual refresh.

**Acceptance Scenarios**:

1. **Given** an address with prior transfers, **When** the home opens,
   **Then** the feed shows them with the core's folding/dedup/tombstones.
2. **Given** the receive screen open, **When** a transfer lands on-chain,
   **Then** the watcher notices within its polling rules and the arrival is
   acknowledged on screen.
3. **Given** a `/pay` style request (EIP-681), **When** it is parsed,
   **Then** the payment_request core rules on it (valid → prefilled receive
   context; garbage → refused with the corpus's words).

---

### User Story 3 - The pool under everything (Priority: P1, enabling)

Every chain read anywhere in the app goes through ONE transport driven by the
`rpc_pool` machine: endpoint scoring, bans, cooldowns, rate-limit verdicts and
the fastest-endpoint race are the core's decisions; the web contributes only
fetch, clock, jitter and the ban-map bytes (Expo-compatible key).

**Independent Test**: with the primary endpoint for a chain stubbed to fail,
reads succeed via the pool's next choice; the ban survives a reload
(`vela.rpc.banned`, same bytes as the other clients).

**Acceptance Scenarios**:

1. **Given** a failing endpoint, **Then** the pool routes around it and the
   failure is recorded by the core's ban/cooldown rules, persisted.
2. **Given** 024's settings network editor, **Then** its probe surfaces and
   the two 024 no-ops (`invalidate_pools`, `clear_bundler_cache`) now act on
   the real pool.
3. **Given** the RPC-health tiles on the settings home page, **Then** they
   render live pool verdicts instead of fixture latencies.

---

### Edge Cases

- Every 024 fail-closed answer upgraded here keeps its failure variant for
  genuine failures: no rate source reachable → `rate: null` (degrade, never
  1); identity lookup down → `null` (no verdict); getLogs range-capped →
  the core's range rule, not an error screen.
- A deposit arriving while the tab is hidden: the watcher's activity gate
  (the core's `inactive` answer) applies; visibility returning resumes it.
- Prerender safety unchanged: all touched routes stay prerendered ×15 with
  neutral waiting states; the deployed worker stays wasm-free.
- Endpoint admission (SSRF-style URL hygiene) applies to user-configured
  endpoints before any fetch, as the Expo `endpoint-admission` rules do.

## Requirements *(mandatory)*

- **FR-101 (One transport)**: all chain reads dispatch through the rpc_pool
  machine; no service performs its own endpoint selection. Ban-map storage
  stays byte-compatible (`vela.rpc.banned`).
- **FR-102 (Home live)**: balances (balance_dashboard), activity
  (activity_feed), token metadata/custom tokens (manage_tokens, token_trust)
  drive `src/lib/wallet/` through sibling live builders; fixtures stay
  gallery canon.
- **FR-103 (Receive live)**: receive_watch drives the receive flow's deposit
  watching; payment_request rules on EIP-681-style inputs.
- **FR-104 (024 backfills)**: settings RPC-health tiles, pool/bundler cache
  invalidation, contacts identity/classify, display_currency rate — all flip
  from fail-closed to live, arms only (the 024 contract's promise).
- **FR-105 (Core decides, shell performs)**: executors stay switch-only;
  ports carry provenance headers; stored bytes stay Expo-compatible.
- **FR-106 (Prices)**: token fiat figures use the web port of the existing
  price pipeline (wallet-api), with the display-currency pair applied by the core's
  committed {code, rate}.
- **FR-107 (Budgets hold)**: Welcome zero-wasm, worker purity, artifact
  byte-count unchanged, corpus process for any new keys, literal audit covers
  every new dir.
- **FR-108 (Hermetic e2e)**: the persistence/read e2e run against stubbed
  HTTP (Playwright route interception harness — the foundation 026's
  parallel-space port builds on); no CI test depends on live chains.
- **FR-109 (Quality gates)**: full 024 gate suite + new read-path unit and
  e2e coverage; existing tests unweakened.

### Key Entities

- **Pool config / ban entry**: per-chain endpoint lists (built-in, provider,
  custom, index) and the persisted ban map.
- **Token snapshot / balance cache entry**: per-account per-chain balances
  with fetch timestamps, cache-vs-live provenance.
- **Feed item / tx record**: the unified activity row (received ⊕ sent),
  day-grouped, tombstoned.
- **Payment request**: a validated pay intent (recipient, chain, token,
  amount) from an EIP-681-style input.

## Success Criteria *(mandatory)*

- **SC-101**: a seeded test address renders its real multi-chain balances
  and activity on the wallet home in ≤ the core's polling budgets; fixture
  identities appear nowhere outside galleries.
- **SC-102**: with the primary endpoint failing, reads still succeed and the
  ban persists across reload (asserted hermetically via stubbed HTTP).
- **SC-103**: a deposit to the watched address is surfaced on the receive
  screen without manual refresh (stubbed clock/HTTP in CI).
- **SC-104**: all four 024 fail-closed seams demonstrably live (rate ≠ null
  with a reachable source; settings tiles show pool verdicts; contact detail
  shows a resolved identity/classification when the stub provides one).
- **SC-105**: zero business rules added to web code; executors remain
  switch-only under unit pin.
- **SC-106**: budgets identical (artifact bytes, zero-wasm Welcome, worker
  purity); corpus gates green; e2e suite ≥ 024's coverage, all green.

## Assumptions

- The Expo web facades are the porting truth: `services/rpc-pool.ts` (core
  facade), `rpc-pool-endpoints.ts`, `wallet-api.ts`, `balance-cache.ts`,
  `activity.ts`, `token-metadata.ts`, `incoming-transfers.ts`,
  `fiat-rate-quote.ts`/`currency.ts` (rate arm), `readonly-rpc-gate.ts`,
  `endpoint-admission.ts` — ported with provenance headers, RN seams removed.
- Wallet home keeps its drawn models; live builders are siblings (024 D7).
- The flows' receive screens (spec 021 drawings) gain their interaction
  surface the way contacts did in 024 (callbacks injected by the route).
- Send/signing surfaces remain fixture until 026 even where they share
  screens with receive.
- parallel-space full port remains 026; this spec ships the interception
  harness it will reuse.
