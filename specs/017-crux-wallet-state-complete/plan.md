# Implementation Plan: Crux-Owned Wallet State — The Remaining Machines

**Branch**: `017-crux-wallet-state-complete` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

## Summary

Execute the rest of the 016 inventory on the 016 infrastructure. Cores are
authored machine-parallel (disjoint files; `mod.rs`/bins/bridge wired
centrally), integrations land surface-serial (one screen family at a time,
gates after each). Waves A→D per spec.md; each wave is one or more green
commits.

## Technical Context

Identical to [016/plan.md](../016-crux-wallet-state/plan.md) except:

- `MAX_WASM_BYTES` = 2,000,000 (owner decision, spec FR-204).
- Resident cores: `session`, `balance_dashboard`, `rpc_pool`, `dapp_session`
  extend the module-level-singleton pattern `use-display-currency.web.ts`
  established (create lazily, never dispose, subscribers per mount).
- Kernel machines (`fee_policy`, `approval_guard`, `clear_signing`,
  `tx_tracker`) land core-first: their web integration ships with the surface
  that consumes them (`sign_request`/`send` for the first three;
  `tx_tracker` replaces the three pollers when `send` re-points).

## Canon rulings (decisions this plan fixes)

- **C1 — clear_signing SIWE canon**: the signing path
  (`decode-sign-message.ts` / `use-dapp-signing.ts`) is the canon where the
  display path (`MessageSignView`) drifted; differences documented in the
  module.
- **C2 — tx terminality is typed**: wording-regex classification
  (`parseBundlerUnderfunded`, `/dropped from the network/`) stays in shell
  result-mapping; cores receive typed variants only.
- **C3 — money math representation**: u128 for wei/base units inside cores,
  decimal strings on the wire; property/vector tests carry the TS jest
  vectors over.
- **C4 — no product-decision smuggling**: quirks ported verbatim (016 D6
  discipline) — the machines document them, the inventory open questions own
  changing them.

## Verification per wave

The FR-205 gate list, plus per-wave e2e focus:

| Wave | e2e focus (unmodified) |
| --- | --- |
| A | jest ported-vector parity; no UI change → smoke + onboarding pair |
| B | approval-guard, clear-signing, batch-send, send-high-risk, send-to-group, eip681-pay + parallel-send/parallel-clear-signing/parallel-dapp once the parallel env is restored |
| C | smoke, parallel-home, parallel-rate-limit (env permitting), onboarding pair (session touches boot) |
| D | parallel-dapp, browser flows, eip681-pay |

## Risks

- **send/sign integration breadth** — mitigated by kernel-first order, the
  016 controller pattern, and per-surface commits.
- **parallel e2e net pre-broken on this machine** — under investigation; if
  unfixable locally, wave B relies on the non-parallel suites locally + CI
  for the parallel set.
- **wasm growth** — measured per wave against the 2 MB gate; async-loading
  fallback (011 D7) is the pre-agreed answer if approached.
