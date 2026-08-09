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

- [ ] T110 `fee_policy` core + rule tests (jest vectors carried over)
- [ ] T111 `approval_guard` core + rule tests
- [ ] T112 `clear_signing` core + rule tests (siwe/decode canon C1)
- [ ] T113 `tx_tracker` core + rule tests (typed terminality C2)
- [ ] T114 `contacts` core + rule tests
- [ ] T115 `batch_import` core + rule tests (recipient-table fixtures)
- [ ] T116 Wire wave-A into bindings bin + `gen-core-types` registry +
  `bridge_class!`; rebuild wasm; record size; all FR-205 gates; commit

## Phase B: Money surfaces

- [ ] T120 `sign_request` core + rule tests
- [ ] T121 Web integration: dapp-connection approve/reject/dismiss lifecycle
  → sign_request session; SigningSheet consumes approval_guard +
  clear_signing views; funding/submit via tx_tracker
- [ ] T122 `send` core + rule tests
- [ ] T123 Web integration: useSendController.web → send session (fee_policy,
  tx_tracker, batch_import handoff); step components on events + view only
- [ ] T124 FR-205 gates + wave-B e2e focus; size record; commit(s)

## Phase C: Session & master data

- [ ] T130 `session` core + resident web session (boot restore, switch,
  logout view; §12.1.6 sequencing preserved)
- [ ] T131 `balance_dashboard` core + Home integration
- [ ] T132 `rpc_pool` core + pool-decision integration (fetch stays shell)
- [ ] T133 `token_trust` core + transfer-monitor/token-autoadd/simulation
  trust integration
- [ ] T134 `network_admin` core + settings integration
- [ ] T135 FR-205 gates + wave-C e2e focus; size record; commit(s)

## Phase D: Connectivity & periphery

- [ ] T140 `dapp_session` core + connection lifecycle integration
- [ ] T141 `dapp_permissions` core + browser/web-request/consent integration
- [ ] T142 `payment_request` scan-tree unification (Home + Send scanners on
  one classifier)
- [ ] T143 `activity_feed` core + Home feed integration (structured amounts)
- [ ] T144 `manage_tokens` core + AddTokenPanel integration
- [ ] T145 `browser_history` core + browser integration
- [ ] T146 `ext_cache` core (TTL/projection decisions; iOS shell unchanged)
- [ ] T147 Final: full gate suite, size record, inventory.md status column
  updated, commit
