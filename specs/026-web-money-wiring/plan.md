# Implementation Plan: Web Money Wiring

**Branch**: `026-web-money-wiring` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-web-money-wiring/spec.md`

## Summary

Port the Expo money path onto the drawn web surfaces: the send spine
(fee_policy → approval_guard → passkey sign → relay submit → pending record →
tx_tracker), the signing machines and their sheet behind a request seam, the
batch importer, and the parallel space as the verification harness — every
decision stays in the seven Rust machines already aboard; the web contributes
the passkey ceremony, fetches, clock, files, storage and the screens.

## Technical Context

**Language/Version**: TypeScript strict, SvelteKit 2 / Svelte 5 runes; wasm
(`rust/pkg-web`) unchanged.
**Primary Dependencies**: existing; NEW in app-web: `@noble/curves` (fixture
signer only, dynamic import behind the dev gate), `xlsx` (SheetJS, lazy import
in the batch importer only).
**Storage**: IndexedDB KV (`vela.transactionHistory` writer); localStorage for
accounts + parallel flags (onboarding storage).
**Testing**: vitest (executor arms, codec vectors, signature envelope
vectors, golden addresses) + Playwright hermetic (stub-chain + relay stubs)
+ opt-in live sweep.
**Target Platform**: web (Cloudflare Worker + static prerender ×15).
**Constraints**: Welcome zero-wasm; worker wasm-free; artifact bytes
unchanged; xlsx and the fixture signer never in the startup chunk; zero
business rules in web code; corpus changes only through the 5-step process.
**Scale/Scope**: ~7,000 lines of provenance-headed ports (safe-transaction
2,838 · bundler-service 839 · kernels 900 · approval-guard 488 · simulation
~850 · dapp-submit ~500 · six executors ~1,700 · residents ~750 · parallel
~600), ~800 lines of live builders, 14 screens + 22 components gaining
callbacks, ~8 new e2e suites.

## Constitution Check

| Rule | Status |
| --- | --- |
| One implementation / tokens only / i18n via corpus / generated regenerated / fixtures canon / components pure / core decides | ✅ unchanged discipline; live builders stay siblings; callbacks optional |
| One PR one problem (§2) | ✅ seven phases, one commit + gate each |
| High-risk (§3) | ⚠️ **High**: funds move. Mitigations: the 7 machines' 430 Rust tests own every rule; `safe-transaction.ts` ports verbatim with its vectors; the amount codec is pinned; the never-unlimited guard is the core's on this path; hermetic e2e first, live sweep opt-in with dust; parallel space runtime-gated with an unconditional badge. Rollback per phase. |

## Project Structure

### Documentation (this feature)

```text
specs/026-web-money-wiring/
├── spec.md · plan.md · research.md (D15–D30) · data-model.md · quickstart.md
├── contracts/shell-operations.md · checklists/requirements.md
├── tasks.md · results.md (ledger, written per phase)
```

### Source Code (app-web/vela-wallet)

```text
src/lib/core/kernels.ts, safe-constants.ts        # D15 (Expo services/vela-core/*)
src/lib/services/safe-transaction.ts              # D16 verbatim
src/lib/services/bundler-service.ts, tx-reconciler.ts, token-reads.ts,
  recipient-risk.ts, eip681.ts, batch-send.ts, dapp-history.ts,
  approval-guard.ts, dapp-submit.ts, recipient-table.ts,
  sim/{tx-simulation,sim-assets,sim-engine-rpc,sim-engine-tevm,sim-trust,sim-corroboration}.ts,
  selector-registry.ts, accounts.ts, records.ts (+writer)
src/lib/onboarding/core/passkey.ts                # + signWithAny, setPasskeyOverride
src/lib/flows/core/{send,fee,fee-quote,batch}-*.ts
src/lib/signing/core/{guard,clear,clear-batch,sign}-*.ts + sign-resident.ts
src/lib/wallet/core/tracker-*.ts
src/lib/flows/live.ts (+send overlays) · src/lib/signing/live.ts (new)
src/lib/dev/{parallel-space.ts, passkey-fixture.ts, test-requester.ts, ParallelSpaceBadge.svelte}
src/lib/services/fault-injection.ts (+relay arms, __VELA_FAULT_INIT__)
src/routes/[locale]/wallet/+page.svelte (send/sign/batch wiring) · src/routes/[locale]/parallel/
e2e/stub-chain.ts (+stubRelay) · e2e/{send-lands,reopen-pending,signing-scenarios,batch,relay-faults,parallel-entry}.e2e.ts
```

**Structure Decision**: same layout as 024/025 — ports under `services/`,
machine loops under each domain's `core/`, live builders as siblings, dev
harness under `lib/dev/` (new dir → literal audit list).

## Phases

| # | Phase | Gate |
| --- | --- | --- |
| 1 | Setup — baselines (bytes, pins, provenance list @ f9bcb278), green tree, deps decision recorded, `lib/dev` in the audit list | results.md |
| 2 | Foundation — kernels + safe-transaction + bundler-service + reconciler + reads/risk/eip681/batch-send/history/guard/simulation/dapp-submit ports; records writer; accounts reader; passkey `signWithAny` + override seam; amount codec | gates + ported vectors (signature envelope, codec, golden addresses) |
| 3 | Parallel space — fixture signer, enter/exit/backup, badge, `/parallel` route, fault relay arms + init seam, `stubRelay`, requester scaffold | gates + golden-lock unit + parallel-entry e2e |
| 4 | Send spine (US1) — fee + send sessions, tracker resident, send overlays, screen props, route translation, `/pay` prefill | gates + hermetic send-lands, reopen-pending, relay-faults e2e (SC-201/204/205) |
| 5 | Signing (US2) — guard/clear/sign loops, sign resident + requester transport, `signing/live.ts`, sheet/panel mounted | gates + signing-scenarios e2e (SC-203) |
| 6 | Batch (US3) — batch session, recipient-table (lazy xlsx), BatchImport wiring, split send | gates + batch e2e + startup-chunk assertion |
| 7 | Live sweep + matrix + closeout — opt-in dust send (SC-202), 3-engine matrix, budgets, results verdicts, 027 handoff | full suite + ledger |

## Complexity Tracking

| Violation | Why | Simpler alternative rejected |
| --- | --- | --- |
| Two new deps (`@noble/curves`, `xlsx`) | fixture signer needs P-256 signing; the importer needs xlsx parsing | hand-rolled ECDSA (unsafe); CSV-only (loses the payroll story) — both lazy, both out of the startup chunk |
| Runtime dev gate instead of compile-time `__DEV__` | web e2e runs the production artifact | dev-server e2e tests what nobody ships |
| A test requester as the only signing transport | 027 owns real transports; the sheet must run on real machines first | wiring UI + transport at once in 027 |
