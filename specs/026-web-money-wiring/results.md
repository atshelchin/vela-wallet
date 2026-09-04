# Delivery Report — 026 Web Money Wiring

**Branch**: `026-web-money-wiring` · Started 2026-09-04 · Base: `main` @ f9bcb278
(PR #183 merged; not stacked).

---

## Baselines (T201, T202) — recorded @ a9761c16

- Core artifact: `static/vela_core_bg.4603c8421603.wasm` = **3,630,664 B**
  (must close byte-identical — SC-207; every money machine is already aboard).
- Corpus pins: 1536 leaf + 84 branch paths (unchanged since 024). Send/signing
  copy already in the corpus: `send` 144 keys · `clearSigning` 84 ·
  `componentsTx` 52 · `componentsUi.signing*` (131 fields resolved by the web
  signing manifest) — a `failed` receipt TITLE is the one known gap (D29).
- Port-provenance surface @ f9bcb278 — **51 files, 12,992 lines**:
  kernels wrapper `vela-core/{index 577, convert 88, js-helpers 101,
  safe-constants 74, types 60}` · `safe-transaction` 2,838 · `bundler-service`
  839 · `tx-reconciler` 252 · `token-reads` 84 · `recipient-risk` 84 · `eip681`
  263 · `batch-send` 201 · `dapp-history` 206 · `approval-guard` 488 ·
  `selector-registry` 95 · simulation `tx-simulation 212, sim-assets 245,
  sim-engine-rpc 100, sim-engine-tevm 113, sim-trust 95, sim-corroboration 82`
  · `recipient-table` 324 · hooks `use-dapp-signing` 764, `use-fee-quote` 340 ·
  wallet-state-core `send 524/37/317 · fee 211/33/34 · guard 88/39/17 · sign
  400/495/39/107 · clear 168/50/123 + clear-batch 158 · tx-tracker
  280/249/41/42 · batch-import 85/38/18` · dev `passkey-fixture 309,
  parallel-space 291, fault-injection 274`. NOT ported (Rust owns): the TS
  twins `clear-signing.ts` 1,321, `approval-guard-editor.ts` 173,
  `local-descriptors.ts` 524; `deployer-api.ts` (create-wallet path);
  `transfer-monitor.ts` (025's receive path, already ported).
- Green tree: 025's close-out numbers stand on this exact tree (the merge is
  the 025 branch tip): check 1233/0 · lint clean · unit 491 · e2e 99/99 on
  three engines · 9 e2e suites.

### Decisions recorded up front (T202)

- **Two new app-web dependencies**: `@noble/curves` (the fixture signer's
  P-256; dynamic import behind the dev gate) and `xlsx` (SheetJS; lazy import
  in the batch importer). Both asserted absent from the startup chunk and from
  Welcome (T262).
- **Runtime dev gate instead of `__DEV__`** (D18): Expo's passkey override is
  a compile-time no-op in release; the web e2e runs the PRODUCTION artifact,
  so the override and the fixture module gate on the 025 dev gate
  (`import.meta.env.DEV || vela.dev.console === '1'`) with the badge rendering
  unconditionally when the space is active. Deviation, with rationale.
- **No local bundler** exists in the program; the live sweep (SC-202) spends
  dust from a fixture Safe through the real relay, opt-in only (D30).
- **T203 (literal-audit dirs)** lands with the phases that create the dirs
  (`lib/dev` in Phase 3, `signing/core` in Phase 5; `flows/core` exists since
  025 and is already audited) — recorded here so it is not forgotten.
