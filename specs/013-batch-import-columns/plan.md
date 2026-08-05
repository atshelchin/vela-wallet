# Implementation Plan: Batch Import Column Inference (digit-bearing names)

**Branch**: `013-batch-import-columns` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-batch-import-columns/spec.md`

## Summary

Issue #137: the batch-send importer picks the amount as *the first cell whose
non-digits strip away to a positive number*, so a recipient name containing
digits (`123123`, `Alice123`, `团队2024`) is mistaken for the amount and the
real amount lands in the name field. Fix inside the single parsing module
`src/services/recipient-table.ts`: separate amount *detection* from amount
*cleaning* (a letter-bearing cell is never an amount while a letter-free
numeric cell exists), and resolve rows with several numeric cells using
table-level evidence — header labels (EN + zh), the column unambiguous rows
use, then position after the address. Value cleaning (`¥5,000.50` → `5000.50`)
and all currently-correct parses are preserved bit-for-bit. Full rationale and
rejected alternatives: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5 (Expo / React Native Web app at repo root)

**Primary Dependencies**: none new — pure-function change; SheetJS (`xlsx`)
stays a lazy import used only to produce the cell matrix

**Storage**: N/A

**Testing**: Jest (`src/__tests__/services/recipient-table.test.ts`),
Playwright E2E (`e2e/batch-send.spec.ts`)

**Target Platform**: Web (the importer ships on the web wallet; the module is
platform-neutral TS)

**Project Type**: mobile/web app — single shared `src/` tree

**Performance Goals**: parsing stays O(rows × cells); tables are ≤ a few
hundred rows, imperceptible

**Constraints**: `parseRecipientTableText` stays pure + synchronous;
`splitCsvLine`'s exported semantics untouched (shared with contacts importer);
no change to `ParsedRow` / `ParseError` / `ParseResult` shapes

**Scale/Scope**: one service module + its test file; no UI change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is the unfilled
template — no ratified principles to gate against. House rules applied
instead: pure logic stays in `src/services/` with unit coverage; behavior
changes land with regression tests; no new dependencies. PASS.

## Project Structure

### Documentation (this feature)

```text
specs/013-batch-import-columns/
├── spec.md              # Feature specification (issue #137)
├── plan.md              # This file
├── research.md          # Root cause + algorithm decision record
├── quickstart.md        # Repro + verification walkthrough
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown
```

### Source Code (repository root)

```text
src/
├── services/
│   └── recipient-table.ts                    # THE fix: detection tiers +
│                                             #   header mapping + resolution
├── components/send/
│   └── BatchImportSheet.tsx                  # consumer — no change expected
└── __tests__/services/
    └── recipient-table.test.ts               # existing suite (must stay
                                              #   green unmodified) + new
                                              #   regression describe-blocks

e2e/
└── batch-send.spec.ts                        # paste-path E2E — must stay green
```

**Structure Decision**: single-module fix. All parsing logic already funnels
through `interpretRows()` in `src/services/recipient-table.ts` for both the
text and Excel paths, so the change lands in exactly one file plus its tests.

## Design

### Detection (per row, address cell excluded)

| Tier | Rule | Accepts | Rejects |
| --- | --- | --- | --- |
| strict | no `\p{L}` letters anywhere, cleans to > 0 | `0.01`, `5,000.50`, `¥300` | `Alice123`, `团队2024`, `5000 USDT` |
| permissive (only when strict set is empty) | cleans to > 0 and begins with the number — optional currency symbols, or ≤5-letter code + whitespace, before the first digit | `5000 USDT`, `USD 5000`, `¥ 300` | `Alice123` (word glued to digits) |

`cleanAmount()` keeps its exact current behavior but is invoked only on the
*chosen* cell — it goes back to being a cleaner, not a detector.

### Resolution (rows with > 1 candidate)

1. header-pinned amount column (synonyms in research.md R3)
2. the column most often chosen by this table's unambiguous rows
3. first candidate at an index greater than the address index
4. first candidate (legacy order)

Implementation shape: `interpretRows()` becomes two passes — pass 1 finds each
row's address + candidate set and resolves single-candidate rows (recording
their chosen column); pass 2 resolves ambiguous rows using header info + the
pass-1 tally. Output arrays keep source order and the existing line-numbering
and error-reporting contract.

### Header mapping

Applied only to the row that is *already* dropped as a header today (first
non-blank row without an address). Recognized labels pin roles: amount column
becomes the sole amount source for every row (unparseable → `no-amount`);
name column is excluded from candidates and preferred for the name field.
Unrecognized headers change nothing.

## Complexity Tracking

No constitution violations; table intentionally empty.
