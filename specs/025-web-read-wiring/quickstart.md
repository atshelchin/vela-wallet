# Quickstart — 025 Web Read Wiring

## Gates (unchanged order)
`pnpm check` → `pnpm lint` → `pnpm test:unit -- --run` → `pnpm build` →
`pnpm test:e2e` (all hermetic; stub-chain harness) + repo-root
`gen-core-types --check`.

## Hermetic scenarios (CI)
1. **Pool resilience (SC-102)** — primary endpoint stubbed failing → read
   succeeds via next choice; `vela.rpc.banned` survives reload.
2. **Truthful home (SC-101)** — stubbed balances/activity render on
   /{locale}/wallet; fixture identities absent; privacy toggle persists.
3. **Deposit noticed (SC-103)** — stubbed token deltas while receive open →
   arrival surfaced without refresh.
4. **Backfills live (SC-104)** — stubbed rate → currency row converts;
   stubbed identity/code → contact detail shows them; settings tiles show
   pool verdicts.

## Manual sweep (before results.md closes)
- Sign in with a REAL funded test wallet; compare home balances/activity to
  an explorer on ≥2 chains; pull a real deposit onto the receive screen.
- Break a chain's RPC in settings; watch transient rate-limit presentation
  vs ban routing; restore via the editor.

## Galleries
All fixture states pixel-unchanged (fixtures untouched; builders are
siblings).
