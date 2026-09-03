# Research — 025 Web Read Wiring

Continues 024's D1–D8. Verified against the tree @ 37694179.

## D9 — The pool is an app-resident substrate behind a service facade

`$lib/services/rpc-pool.ts` ports the Expo WEB facade (which already drives
`RpcPoolCore` — its header documents the division: "this file owns exactly
two things the core cannot have: the fetch, and the promise the caller is
waiting on"). Consumers (`poolRpcCall`, `getRateLimitedChains`,
`refreshPool`, `invalidateAllPools`…) call the facade; only the facade talks
to the session. One app-lifetime session (module-resident, Expo precedent) —
the ban ledger and scores must be single. `rpc-pool-endpoints.ts` ports as
the shared endpoint assembly; `endpoint-admission.ts` gates user URLs before
any fetch. Ban key `vela.rpc.banned` byte-compatible via the IndexedDB KV.

**Rejected**: constructing pool sessions per caller (splits the ban ledger);
teaching executors to fetch directly (re-implements routing the core owns).

## D10 — Home residents port 1:1; ONE composed live builder

`balance-resident.ts` / `feed-resident.ts` / `token-trust-resident.ts` port
to `$lib/wallet/core/*` in the 024 store shapes (module `$state` or class
residents). `buildWalletFromCore(balanceView, feedView, m, identity, ui)`
composes the three views into the existing `WalletHomeModel`/`Desktop` —
sibling of the fixture builders, replacing `wallet/identity.ts`'s partial
overlay on the live route. Formatting (currency strings, day groups' labels)
uses the committed display-currency pair + corpus templates; **numbers stay
the core's** (the feed items and balances arrive display-ready or numeric per
their view contracts — no arithmetic in the builder).

## D11 — Hermetic e2e: one interception harness

`e2e/stub-chain.ts`: `page.route` handlers for (a) JSON-RPC POSTs keyed by
method (balances, logs, blockNumber…), (b) the token/balance API
(wallet-api's data source), (c) the fiat-rates endpoint, (d) the identity
index. Fixtures as plain objects in the spec files; the harness is the seam
026's parallel-space port extends with bundler stubs. No CI test touches a
live chain (FR-108); the funded-address sweep is a manual quickstart
scenario.

## D12 — receive_watch is a per-screen session bound to an address

Expo's `createReceiveWatchExecutor(address)` pattern ports as a factory
session created when the receive surface opens and disposed on leave (024 D8
transient rule). The activity gate maps `isAppActive` →
`document.visibilityState === 'visible'`; the watcher's `wait` uses the
abortable timer the executor contract already defines.

## D13 — Prices and rates: two different pipes, both ported

Token USD figures ride the wallet-api port (its price fields come with the
token payloads). The display-currency RATE (USD→code) rides
`fiat-rate-quote.ts` + the rate arm of `currency.ts` (ported as
`currency-rate.ts` — only the resolveRate waterfall; the seeding/persistence
half became the core in 016). The 024 rule stands: a failed rate is `null`,
never 1.

## D14 — tx records store seam arrives EMPTY-schema'd but real

`activity_feed`'s `read_tx_store` / `delete_tx_record` and the send-history
reads get a real `vela.transactionHistory` KV seam (Expo storage.ts shapes)
even though nothing WRITES records until 026's send — deletes/tombstones and
the 026 handoff then need no storage change. Contacts' `load_send_history`
upgrades to read the same seam (arm-only change, its 024 contract).
