# Tasks: Batch Import Column Inference (digit-bearing names)

**Input**: Design documents from `/specs/013-batch-import-columns/`

**Prerequisites**: plan.md, spec.md, research.md

**Tests**: Required — the spec's success criteria are expressed as tests
(SC-002/SC-003/SC-004), and the change is a money-path parser.

**Organization**: One parsing module; stories share the same two files, so
tasks are sequential except where marked [P].

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

*(no setup needed — existing module, existing test harness)*

## Phase 2: Foundational

- [ ] T001 Red tests first: add failing regression describe-blocks to
      `src/__tests__/services/recipient-table.test.ts` covering the issue #137
      reproduction (digit-only name among plain names), the single ambiguous
      row, `Alice123`, `团队2024`, header pinning (`name,address,amount` and
      `姓名,地址,金额` with digit-only names), headered row with unparseable
      amount cell → `no-amount`, leading row-number column, and the
      currency-suffix amount `5000 USDT` (US1+US2+US3 acceptance scenarios).
      Run jest, confirm the new blocks fail against the current parser and the
      pre-existing blocks pass.

**Checkpoint**: failing tests reproduce issue #137 deterministically.

## Phase 3: User Story 1 — digit-bearing names (P1) 🎯 MVP

- [ ] T002 [US1] In `src/services/recipient-table.ts`, add the strict /
      permissive amount-cell detection tiers (plan.md Design table); keep
      `cleanAmount` as the value cleaner for the chosen cell only.
- [ ] T003 [US1] Restructure `interpretRows()` into two passes: pass 1 = per-row
      address + candidate sets, resolve single-candidate rows and tally their
      chosen columns; pass 2 = resolve multi-candidate rows via consistency →
      after-address-position → first-candidate. Preserve output order, line
      numbering, and error contract.

**Checkpoint**: US1 acceptance tests green (incl. single-row `123123,addr,0.01`).

## Phase 4: User Story 2 — header pinning (P2)

- [ ] T004 [US2] Add header synonym mapping (research.md R3) applied to the
      already-dropped header row: amount-labelled column is the sole amount
      source (unparseable → `no-amount`), name-labelled column excluded from
      candidates and preferred for the name field; header info sits at the top
      of the resolution precedence.

**Checkpoint**: US2 acceptance tests green, EN and zh headers.

## Phase 5: User Story 3 — regression safety (P3)

- [ ] T005 [US3] Run the full parser suite; every pre-existing test must pass
      **unmodified** (SC-002). Trace any deviation back to the detection tiers
      rather than weakening a test.
- [ ] T006 [P] [US3] Run the batch-send E2E paste flow
      (`e2e/batch-send.spec.ts`) or, if the harness is unavailable in this
      environment, statically verify its pasted fixtures parse identically
      under the new algorithm (SC-004).

## Phase N: Polish & Cross-Cutting

- [ ] T007 Update the module doc-comment in `recipient-table.ts` (the "Column
      order is inferred" paragraph) to describe detection tiers + resolution
      precedence, citing issue #137.
- [ ] T008 Adversarial review pass (multi-agent): attempt to construct inputs
      where name/amount still swap or previously-valid sheets change meaning;
      fold surviving findings back into tests + fix.
- [ ] T009 Record results in `specs/013-batch-import-columns/results.md`
      (test counts, behavior deltas, review verdicts).

## Dependencies & Execution Order

- T001 → T002 → T003 → T004 → T005 → (T006 ∥ T007) → T008 → T009
- US1 (T002–T003) is shippable alone: it fixes issue #137 for headerless
  tables; US2 (T004) hardens template/headered sheets; US3 verifies the
  no-regression promise.
