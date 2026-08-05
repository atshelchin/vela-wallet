# Specification Quality Checklist: Crux-Owned Onboarding State (Create + Sign In)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *with one deliberate
      deviation, see Notes*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Deliberate deviation on "no implementation details".** Two classes of concrete
artifact are named in the spec, and both are acceptance targets rather than
implementation choices:

1. `e2e/onboarding-verify.spec.ts` and `e2e/onboarding-sync.spec.ts` (FR-027,
   SC-001). "The existing suites pass unmodified" is not testable unless the
   suites are named.
2. The current locations of the rules in the **Why** table
   (`CreateWalletScreen.tsx`, `pendingReg`, the floating `.catch`). This is
   evidence for the problem statement — the "before" picture — not a prescription
   of the "after".

No framework, language or API of the *solution* appears in Requirements or
Success Criteria: they say "the shared core", "the platform shell", "declared
effect", never `crux_core`, `wasm`, or a function signature. Those belong in
`plan.md`.

**Scope decisions already resolved with the founder** (2026-08-05), so no
`[NEEDS CLARIFICATION]` markers were needed:

| Decision | Choice |
| --- | --- |
| Where the state machines live | Feature-gated module inside the shared core crate; default build unchanged |
| Web rollout | Direct switch on web; native path untouched; existing e2e is the gate |
| Extraction depth | All business rules, including recovery, retries and health probing |
| If the web size budget is exceeded | Trim first; stop and escalate rather than raise the ceiling |

**Measured before planning**: the state-machine framework costs +95,288 wasm
bytes under this repo's release profile (84,233 → 179,521 in an isolated
two-crate spike). Current artifact is 656,895 of a 1,000,000 hard ceiling, so
SC-006 has ~343 KB of headroom to absorb the framework plus both machines.
