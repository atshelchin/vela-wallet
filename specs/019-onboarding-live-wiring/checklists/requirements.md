# Specification Quality Checklist: Live Onboarding — Create & Sign In Wired to the Core

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-24
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
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

Three deliberate deviations from a strict reading of the checklist, all following the
precedent set by specs 014 and 018 in this repository:

1. **"Why" and "Design Authority" sections precede the mandatory ones.** Both are house
   style here (014 has "Design Source of Truth", 018 has "Why" and "Design Authority").
   They carry the rationale and the mock→state mapping that reviewers need first.

2. **The Design Authority table names the core's view-model stages** (`form`, `add_keys`,
   `created`) and the design file's own token names. These are the vocabulary the product
   owner and the mocks already share, not implementation choices being smuggled in — the
   spec still says nothing about how any client renders them.

3. **FR-027 to FR-030 reference platform capability rather than platform APIs.** The
   desktop assumption (a FIDO2 USB security key is required) is a genuine user-visible
   product constraint for this feature and belongs in the spec, so it is stated in
   Assumptions in user terms rather than hidden in the plan.

Zero `[NEEDS CLARIFICATION]` markers: every open question raised during exploration was
resolved by the founder before the spec was written (v2 replaces the 014 containers,
two acknowledgements, session wired in the same feature, system passkeys retained as one
of three methods, desktop on direct CTAP, app-owned passkey path deferred to 020).
