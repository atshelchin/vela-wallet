---

description: "Task list for 016-crux-wallet-state"
---

# Tasks: Crux-Owned Wallet State — Inventory + First Wave

**Input**: Design documents from `/specs/016-crux-wallet-state/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/wallet-state-core.md](./contracts/wallet-state-core.md)

**Tests**: Required (FR-022). Transition-table tests are part of each machine,
not a follow-up.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 = display currency, US2 = deposit watch, US3 = payment
  request, US4 = infrastructure

---

## Phase 1: Documentation (delivered with this feature)

- [X] T001 Write `inventory.md` — full business-state catalog (23 machines,
  invariants with provenance, not-migrating list, open questions, roadmap)
- [X] T002 Write `research.md` D1–D11 + landmines
- [X] T003 Write `data-model.md` — three machines, transition tables
- [X] T004 Write `contracts/wallet-state-core.md`

## Phase 2: Core machines (US1–US3) — no UI changes yet

- [X] T010 [US1] `rust/crates/vela-core/src/app/display_currency.rs`: Model,
  Event, Operation/ShellResult, `update`, `view` per data-model.md §1; wire
  into `app/mod.rs`
- [X] T011 [US1] Tests `rust/crates/vela-core/tests/app_display_currency.rs`:
  the transition table incl. atomic commit, seed-only-after-real-rate,
  user-choice-beats-seed (stale-attempt drop), stored-code-never-rate-1,
  unpriceable-vs-USD distinction, malformed device codes
- [X] T012 [US2] `rust/crates/vela-core/src/app/receive_watch.rs` per
  data-model.md §2 (constants core-owned; schedule() pure)
- [X] T013 [US2] Tests `app_receive_watch.rs`: baseline-only first fetch,
  shrunken-fetch skip, strict-increase diff (missing-from-prev ⇒ 0), baseline
  advances only on detection, phase boundaries at exactly 60s/300s, inactive
  stop, fetch-failure reschedule, stale-attempt drop
- [X] T014 [US3] `rust/crates/vela-core/src/app/payment_request.rs` per
  data-model.md §3: gate, builder (sanitize + EIP-681 + pay-link via
  decimal-string base-unit arithmetic), `/pay` validator (strict grammar D8)
- [X] T015 [US3] Tests `app_payment_request.rs`: build parity vectors vs the
  TS builder (native/token × amount/open × precision clamp), sanitize quirk
  table, `/pay` grammar table (`1e18`, `1,5`, `0x10`, negative,
  over-precision ⇒ invalid; valid inputs ⇒ exact base units), gate
  loading/acknowledge/copy-save flags, round-trip build→parse

## Phase 3: Infrastructure (US4)

- [X] T020 [US4] `rust/crates/vela-core-wasm/src/bridge.rs`: generic `Bridge`,
  `SplitEffect` trait, `bridge_class!` macro; re-declare onboarding classes
  through it (wire-identical)
- [X] T021 [US4] `rust/crates/vela-core-wasm/src/wallet_state.rs`: the three
  new classes via `bridge_class!`
- [X] T022 [US4] `src/bin/generate_wallet_state_bindings.rs` (feature
  `bindings`) exporting the three apps' roots into
  `src/services/wallet-state-core/generated/`
- [X] T023 [US4] `rust/scripts/gen-core-types.mjs` registry generator (D3);
  `package.json`: `gen:core-types`, keep `gen:onboarding-types` as alias;
  commit generated output
- [X] T024 [US4] Verify onboarding untouched: `git diff --stat` empty under
  `src/services/onboarding-core/generated/`; `cargo tree -p vela-core-uniffi`
  contains no `crux_core`

## Phase 4: Web integration (one machine at a time)

- [X] T030 [US1] `src/services/wallet-state-core/`: `session.ts` (native
  stub), `session.web.ts`, `executors.web.ts` (the only I/O site — storage,
  expo-localization, rate chain, fetchTokens, timers, haptics)
- [X] T031 [US1] `use-display-currency.web.ts` (crux-driven, same public
  shape; module-level session per D5); native `use-display-currency.ts`
  unchanged
- [X] T032 [US2] Extract today's deposit effect verbatim into
  `use-receive-watch.ts` (native); add crux-driven `use-receive-watch.web.ts`;
  re-point `ReceiveScreen.tsx` at the controller
- [X] T033 [US3] Extract gate+builder into `use-receive-request.ts` (native)
  and `.web.ts` (crux); re-point `ReceiveScreen.tsx` (gate) and
  `ReceiveRequestControls.tsx` (builder — rendering only)
- [X] T034 [US3] Re-point `PayScreen.tsx` at the validator view (web); native
  keeps the TS parse path

## Phase 5: Regression & artifacts

- [X] T040 `npm run test:core` — all machine tests green
- [X] T041 `npm run typecheck` && `npm run lint` && `npm run test:unit`
- [X] T042 `npm run build:wasm` — record byte count in research.md D11; commit
  `rust/pkg-web/`; `npm run verify:wasm`
- [X] T043 `node rust/scripts/gen-core-types.mjs --check` green
- [X] T044 e2e (FR-020): `npx playwright test parallel-receive eip681-pay
  smoke onboarding-verify onboarding-sync` — zero spec edits. Result
  2026-08-09: 16/18 pass; the 2 failures are both `parallel-receive.spec.ts`
  and reproduce **identically on a clean checkout with all 016 changes
  stashed** (`enterParallel` finds the fixture account name hidden on this
  machine), i.e. pre-existing environment breakage, not a 016 regression.
  Re-verify those two in CI before merge.
