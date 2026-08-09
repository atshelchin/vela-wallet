---

description: "Task list for 017-crux-wallet-state-complete"
---

# Tasks: Crux-Owned Wallet State — The Remaining Machines

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), machine specs in
[016/inventory.md](../016-crux-wallet-state/inventory.md)

## Phase 0: Gate + scaffolding

- [X] T100 Raise `MAX_WASM_BYTES` to 2,000,000 in `rust/scripts/build-web.mjs`
  with the owner-decision comment (FR-204)
- [X] T101 Stub + wire the six wave-A modules in `app/mod.rs`
- [X] T102 Restore the parallel e2e environment: enterParallel/openWalletConnect
  now visible-filter (react-navigation keeps the inactive stack screen in the
  web DOM as a hidden duplicate Home, so bare .first() resolved to a 0x0
  node); parallel-receive.spec assertions updated to the CURRENT product copy
  they had drifted from (design pass 9c3038f/e08bff6 postdate the spec) —
  semantics unweakened, verified 2/2 green. Other parallel-* specs may carry
  the same copy drift; fix per-suite as wave B reaches them

## Phase A: Kernels (core + tests, machine-parallel)

- [X] T110 `fee_policy` core + rule tests (jest vectors carried over)
- [X] T111 `approval_guard` core + rule tests
- [X] T112 `clear_signing` core + rule tests (siwe/decode canon C1)
- [X] T113 `tx_tracker` core + rule tests (typed terminality C2)
- [X] T114 `contacts` core + rule tests
- [X] T115 `batch_import` core + rule tests (recipient-table fixtures)
- [X] T116 Wire wave-A into bindings bin + `gen-core-types` registry +
  `bridge_class!`; rebuild wasm; record size; all FR-205 gates; commit

## Phase B: Money surfaces

- [X] T120 `sign_request` core + rule tests
- [ ] T121 Web integration: dapp-connection approve/reject/dismiss lifecycle
  → sign_request session; SigningSheet consumes approval_guard +
  clear_signing views; funding/submit via tx_tracker
- [X] T122 `send` core + rule tests
- [ ] T123 Web integration: useSendController.web → send session (fee_policy,
  tx_tracker, batch_import handoff); step components on events + view only
- [ ] T124 FR-205 gates + wave-B e2e focus; size record; commit(s)

## Phase C: Session & master data

- [~] T130 `session` core + resident web session (boot restore, switch,
  logout view; §12.1.6 sequencing preserved)
- [~] T131 `balance_dashboard` core + Home integration
- [~] T132 `rpc_pool` core + pool-decision integration (fetch stays shell)
- [~] T133 `token_trust` core + transfer-monitor/token-autoadd/simulation
  trust integration
- [~] T134 `network_admin` core + settings integration
- [ ] T135 FR-205 gates + wave-C e2e focus; size record; commit(s)

## Phase D: Connectivity & periphery

- [~] T140 `dapp_session` core + connection lifecycle integration
- [~] T141 `dapp_permissions` core + browser/web-request/consent integration
- [~] T142 `payment_request` scan-tree unification (Home + Send scanners on
  one classifier)
- [~] T143 `activity_feed` core + Home feed integration (structured amounts)
- [~] T144 `manage_tokens` core + AddTokenPanel integration
- [~] T145 `browser_history` core + browser integration
- [~] T146 `ext_cache` core (TTL/projection decisions; iOS shell unchanged)
- [ ] T147 Final: full gate suite, size record, inventory.md status column
  updated, commit


---

## Status ledger (2026-08-09)

**Cores: complete.** All 22 machines live in `vela-core` with 990 green
tests. `[~]` above means *core landed and tested, web integration pending* —
the integration half is planned per surface in
[integration-plan.md](./integration-plan.md) (groups G1–G13, waves I1–I5).

**Loading route changed (FR-204 follow-through).** The full set weighs
2,930,927 bytes — past the 2 MB embedded-base64 ceiling the owner raised it
to, so the pre-agreed D7 fallback landed: the module ships as
`public/vela_core_bg.<source-fingerprint>.wasm`, fetched once and cached
immutably; `index.web.js` awaits `coreReady` before loading the app graph;
Node (jest, verify-web, and Expo's `output: "static"` render pass) reads the
same asset from disk. The gate is now 4,000,000 bytes measured as *network
transfer*, not bundle size.

**Verified at this commit**: cargo 990/990 · typecheck · lint 0 errors · jest
1526/1526 · verify:wasm 41,865 conformance cases · both bindings drift gates ·
`cargo tree -p vela-core-uniffi` crux-free · e2e 61 passed / 8 failed, with
the 8 under attribution against a baseline worktree (all three suites
predate the design passes that changed their anchors and were never repaired
in 233c062/226846f).
