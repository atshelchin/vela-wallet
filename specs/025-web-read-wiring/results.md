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
