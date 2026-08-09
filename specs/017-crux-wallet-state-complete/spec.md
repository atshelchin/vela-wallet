# Feature Specification: Crux-Owned Wallet State — The Remaining Machines

**Feature Branch**: `017-crux-wallet-state-complete` (stacked on `016-crux-wallet-state`)

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "wasm 体积我考虑开放到 2MB，所以可以把剩下的都做出来吗？
我一开始就说了，所有业务状态。"

## Why

Spec 016 delivered the inventory ([016/inventory.md](../016-crux-wallet-state/inventory.md):
23 machines, ~120 business-state entries) and the first three machines plus the
paved road. The owner has now removed the constraint that scoped 016 down — the
wasm ceiling is raised to 2,000,000 bytes by explicit decision — and directed
that **all** remaining business state move into `vela-core` Crux machines.

This spec executes the rest of the inventory. The 016 infrastructure is reused
unchanged: per-domain vocabularies, `SplitEffect` + generic bridge +
`bridge_class!`, the registry bindings generator, the platform-split hook
pattern (web crux-driven, native TypeScript verbatim), and the standalone
controller-types rule.

## Scope

Every non-implemented machine in the 016 inventory, in dependency-ordered
waves. Priorities and invariants are as inventoried; this spec does not
re-derive them.

- **Wave A — kernels** (core + tests first; consumed by later integrations):
  `fee_policy`, `approval_guard`, `clear_signing`, `tx_tracker`, plus the
  self-contained `contacts` and `batch_import`.
- **Wave B — the money surfaces**: `sign_request`, then `send` (the largest
  integration: the ~90-field controller narrows to events + view).
- **Wave C — session & master data**: `session`, `balance_dashboard`,
  `rpc_pool`, `token_trust`, `network_admin` (`display_currency` shipped in
  016).
- **Wave D — connectivity & periphery**: `dapp_session`, `dapp_permissions`,
  `payment_request` scan-tree unification, `activity_feed`, `manage_tokens`,
  `browser_history`, `ext_cache` core part (`deposit_watcher` shipped in 016
  as `receive_watch`).

Waves land as independent, fully-verified commits; the branch is green after
each.

## Ground rules (carried from 016, now normative for every wave)

- **FR-201 (faithful port)**: behavior is ported exactly, quirks included and
  documented. The inventory's open product questions (logout semantics, grant
  expiry, deposit-baseline advance, health-check gating) are NOT decided here;
  machines model today's behavior.
- **FR-202 (native untouched)**: Hermes has no wasm. Native keeps its
  TypeScript logic via the hook-pair pattern; `cargo tree -p vela-core-uniffi`
  stays crux-free. The dual-implementation cost is accepted by the owner as
  part of "all business state" (inventory open question 1 stands recorded).
- **FR-203 (wire discipline)**: no u64 on the wire; money as decimal strings;
  epoch f64 ms on results; per-app vocabularies; type names prefixed per
  domain (shared generated dir).
- **FR-204 (size)**: `MAX_WASM_BYTES = 2_000_000` — raised 1 MB → 2 MB by
  owner decision recorded in this spec and in `build-web.mjs`. The embedded
  base64 cost (~2.7 MB raw bundle at the ceiling, ~1 MB+ brotli'd) is
  acknowledged; if growth approaches 2 MB the answer is the async loading
  route (011 D7), not another raise. Measure and record after every wave.
- **FR-205 (regression gates per wave)**: `npm run test:core`, `typecheck`,
  `lint`, `test:unit`, `gen-core-types --check`, `build-web.mjs --check`,
  `cargo tree` assertion, plus the e2e suites relevant to the touched
  surfaces, unmodified. The two `parallel-receive` cases are pre-broken in
  this environment (016 T044); the parallel-* net is restored or the affected
  assertions are verified in CI.
- **FR-206 (tests are the feature)**: every machine ships rule-per-test
  transition tables including stale-result rejection and failure paths;
  existing jest vectors for ported pure modules move to Rust alongside.
- **FR-207 (source-grep jest rewrites)**: the three source-text jest guards
  (`send-same-fee-token`, `send-tempo-gate`, `currency-picker-scope`) are
  rewritten as core tests in the same commit that moves their logic.

## Success Criteria

- **SC-201**: every inventory machine not marked "not migrating" exists in
  `vela-core` with green rule tests.
- **SC-202**: the web app's business decisions for send, signing, session,
  balances, networks, dapp connectivity and the periphery are dispatched
  through cores; the corresponding screens/hooks hold rendering and I/O only.
- **SC-203**: all FR-205 gates green at every wave commit; wasm ≤ 2,000,000
  bytes with the full set linked.
- **SC-204**: native bundles remain byte-equivalent in behavior (no crux in
  uniffi, platform hooks unchanged or verbatim-moved).
