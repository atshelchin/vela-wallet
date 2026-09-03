# Implementation Plan: Web Read Wiring

**Branch**: `025-web-read-wiring` (stacked on `024-web-live-shell`) | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

## Summary

Land the one missing ingredient — a chain-read transport driven by
`RpcPoolCore` — then wire the read-path machines over 024's paved road:
balances/activity/tokens into the drawn wallet home, deposit watching and
payment requests into the receive flow, and flip every 024 fail-closed seam
live (settings health tiles, pool invalidation, contacts identity/classify,
currency rate). All ports come from the Expo web facades (post-#168 they are
already core-driven); executors stay switch-only; a Playwright
route-interception harness makes every new e2e hermetic.

## Technical Context

As 024 (TS strict/Svelte 5/SvelteKit 2; no new npm deps; IndexedDB KV +
localStorage seams; vitest + Playwright ×3-engine persistence matrix). New
here: live `fetch` inside pool/balance/rate executors — CI never touches real
chains (FR-108); the interception harness stubs at the HTTP boundary.

**Scale**: 7 machines (rpc_pool, balance_dashboard, activity_feed,
manage_tokens, token_trust, receive_watch, payment_request) + 4 backfilled
arms; ~10 service ports (~2,100 lines source) + per-machine wiring; 2 screens
gain live data (home, receive) + settings tiles.

## Constitution Check

Same de-facto gate as 024's table — all ✅ with one ⚠️ carried consciously:

| Rule | Status |
| --- | --- |
| One implementation / tokens only / i18n via corpus / generated regenerated / fixtures canon / components pure / core decides | ✅ unchanged discipline; live builders stay siblings |
| One PR one problem (§2) | ✅ six phases, one commit + gate each; stacked branch keeps 024 reviewable separately |
| High-risk (§3) | ⚠️ **Medium-high**: first live network reads + user-configured endpoints. Mitigations: endpoint-admission port gates user URLs pre-fetch; pool policy already Rust-tested (42 tests); no funds can move (026); hermetic e2e + manual funded-address sweep in quickstart. Rollback per-phase. |

## Project Structure

```text
app-web/vela-wallet/src/lib/
├── services/            # ports (provenance-headed): rpc-pool-endpoints.ts,
│   rpc-pool.ts (facade), wallet-api.ts, balance-cache.ts, activity.ts,
│   token-metadata.ts, incoming-transfers.ts, fiat-rate-quote.ts,
│   currency-rate.ts, readonly-rpc-gate.ts, endpoint-admission.ts
├── wallet/core/         # balance/feed/trust/manage-tokens executors+residents
├── wallet/live.ts       # buildWalletFromCore (sibling of fixtures)
├── flows/core/          # receive-watch + payment-request wiring
└── settings/…           # tile/probe arms flip live (edits only)
app-web/vela-wallet/e2e/
├── stub-chain.ts        # the interception harness (FR-108; 026 reuses)
└── read-path e2e specs
```

## Phases

| # | Phase | Gate |
| --- | --- | --- |
| 1 | Setup — baselines, provenance list, green tree on the stacked base | records in results.md |
| 2 | The pool — endpoints+admission+facade+executor/session; 024 no-op arms (invalidate/clear) + settings HOME tiles live | gates + pool unit tests + hermetic ban-persistence e2e |
| 3 | Home live — balance_dashboard + manage_tokens + token_trust residents, wallet-api/balance-cache ports, buildWalletFromCore, route wiring incl. privacy toggle | gates + unit + hermetic home e2e |
| 4 | Activity + receive — activity_feed resident + tx-store seam; receive_watch session (visibility gate); payment_request validation into receive flow | gates + unit + hermetic deposit e2e |
| 5 | Backfills — contacts identity/classify arms (recipient-identity port), display_currency resolve_rate (rate-quote port); SC-104 sweep | gates + arm-level units |
| 6 | e2e matrix + closeout — 3-engine read-path persistence, budget re-assertions, results.md verdicts | full suite + ledger |

MVP = Phases 1–3 (a truthful home). Each phase is one commit; stop at any
boundary and the branch is green.

## Complexity Tracking

| Violation | Why | Simpler alternative rejected |
| --- | --- | --- |
| Live fetch enters executors | The feature IS the read layer | Keeping stubs = 024 forever |
| Stacked branch (base not yet merged) | 025 depends on 024's road; founder said continue | Waiting for merge idles the program; rebase-on-merge is mechanical |
