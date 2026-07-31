# Requirements Quality Checklist — 005

Applied to [spec.md](../spec.md) after Phase 1. `PASS` / `FAIL` / `N/A`, with the evidence
that settled it.

## Clarity

- [x] **Every requirement is testable.** PASS — each FR names an observable behaviour. The
  weakest was FR-016, which Phase 1 showed was testable only in a form that could never fail;
  it was amended to name what must be compared.
- [x] **No requirement encodes an unstated assumption.** PASS after amendment — FR-021 assumed
  the two language lists were order-equal (they are set-equal, order-different) and FR-022
  assumed a corpus vector would exercise the live boundary (it would not).
- [x] **Ambiguous terms are pinned.** PASS — "proving ground" is defined by its exit criteria
  (SC-010) rather than left as a mood.

## Completeness

- [x] **Success criteria cover every user story.** PASS — US1→SC-001/007, US2→SC-006/007,
  US3→SC-003/004, US4→SC-005/008, US5→SC-010.
- [x] **Failure paths are specified, not just happy paths.** PASS — offline, 404-returns-HTML,
  slow, double-switch, poisoned engine, and boot-gate hang all have named requirements.
- [x] **The rollback path is stated.** PASS — FR-018 keeps the incumbent bundled precisely so
  reversal is deleting two assignments.
- [x] **Newly discovered defects are requirements, not footnotes.** PASS — FR-023/FR-024 were
  found in Phase 1 and promoted, because adoption cannot proceed over them.

## Honesty

- [x] **The spec states what it does NOT deliver.** PASS — zero user-visible change is in the
  "Why", not buried. SC-010 is required to repeat it.
- [x] **No success criterion can be satisfied vacuously.** PASS after amendment — this was the
  headline Phase 1 finding. FR-016 as originally written made the flagship assertion
  structurally incapable of failing.
- [x] **Measured numbers are attributed and reproducible.** PASS — every figure carries its
  measurement, and one inherited from 004 (the "~140× slower" claim) was re-measured and
  corrected: the engine is marginally *faster* than `i18next.t()`.
- [x] **Coverage claims are bounded.** PASS — the plan states that web never exercises the
  legacy `dummyRule` plural path, so this proves the resolver, catalog lifecycle and binding,
  **not** the native plural divergence.

## Scope

- [x] **Out-of-scope items are enumerated with reasons.** PASS — native, bundle reduction,
  L10n, and the plural fix each say *why*.
- [x] **No requirement forces work the user did not ask for.** PASS — the two crate fixes are
  the only additions beyond the stated ask, and both are defects that block it.
- [x] **The spec does not silently widen.** PASS — `<Trans>` support, a render library and an
  i18next removal were each considered and explicitly declined.

## Traceability

- [x] **Every FR maps to a task.** PASS — see [tasks.md](../tasks.md); FR-023/024 → T001–T006.
- [x] **Every design decision has evidence.** PASS — [research.md](../research.md) D1–D10 cite
  file:line or a measurement, and record four first-pass conclusions that were wrong.
- [x] **Contradictions between design areas are resolved before tasks.** PASS — R1–R11 in
  [plan.md](../plan.md); the four Phase 1 designs had each assumed a different shape for the
  same seam function.

## Known gaps (accepted, not hidden)

- **Re-render on language change is not covered by any automated test.** The plan buys
  `renderToStaticMarkup` over a render library, which covers the hook path and the
  infinite-suspense failure but not the re-render. Named in plan.md §Complexity Tracking and
  assigned to the manual sweep (T061).
- **The proving ground cannot validate the native plural fix.** Structural, not an oversight:
  web has full `Intl.PluralRules`, so the code path that is wrong on Hermes never executes here.
