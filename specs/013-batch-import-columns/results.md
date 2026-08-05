# Results: Batch Import Column Inference (issue #137)

**Branch**: `013-batch-import-columns` | **Date**: 2026-08-05

## Outcome

`src/services/recipient-table.ts` no longer treats "strips down to digits" as
"is an amount". A cell must *read* as a number (currency signs and one short
currency token tolerated), and the amount **column** is settled per row shape —
header label → the column used by rows with an amount after the address → the
column used by single-candidate rows — before any row is emitted.

## Verification

| Check | Result |
| --- | --- |
| Pre-existing parser tests (compatibility contract, unmodified) | 19/19 pass |
| New regression tests | 30 added, all pass (49 total in the file) |
| Full `src/__tests__/services/` suite | 1187/1187 pass, 99 suites |
| `tsc --noEmit` | clean |
| `eslint` on changed files | clean |

Reproduction from the issue (`Alice,0xA…,0.01` + `123123,0xB…,0.01`) now parses
both rows at `0.01` with names intact (SC-001).

## Adversarial review (multi-agent, 4 lenses × 2 skeptics)

The review ran against the **first** implementation (commit `d3fad6c`) and is
the reason a second implementation exists. 26 of 32 verifier agents aborted on
a model quota limit, so "unrefuted" findings were re-checked by hand rather
than trusted as refuted.

**Confirmed critical — fixed.** Table-wide voting was keyed by absolute column
index with no row-shape context: a legal 2-column `amount,address` row voted
for column 0 and decided a 3-column `name,address,amount` row whose column 0 is
the NAME, re-creating issue #137 (`5000,addr` + `123123,addr,0.01` → paid
123,123). Vote ties also resolved leftmost, making the positional tier
unreachable. Fixed by scoping evidence to `(cell count, address index)` and
settling one column per shape. Regression test: *"a 2-column amount-first row
does not decide a 3-column row"*.

**Verified by hand and fixed** (reported as findings, left unverified by the
quota failures):

| Finding | Status |
| --- | --- |
| A row with a blank/unparseable amount cell voted for its own digit-only name, poisoning the table | Fixed — rows read only the settled column, so the blank cell is a `no-amount` error |
| `Team 2024`, `Bob 007`, `3M` accepted as amounts (FR-006) | Fixed — a leading word is a currency token only if it is a known/ticker-shaped code |
| `R$ 5000`, `US$ 5,000.50`, `MATIC 5000` regressed to `no-amount` (FR-005) | Fixed — sign-glued and 5-letter codes accepted; tests cover all three |
| A header made ragged rows lacking that column fail (FR-005) | Fixed — header pins only where the row has the column |
| An address in a header-labelled NAME column captured the payment | Fixed — a labelled address column wins over first-address-found |
| `1e5` → 15, `1.00E+05` → 1.0005, `2026-08-05` → 20260805, `0x123` → 123 (pre-existing, not regressions) | Fixed — all rejected as `no-amount` |
| `1,23` (European decimal comma) silently became 123 | Now `no-amount` — ambiguous input is refused, not guessed |

## Deliberate behavior changes

- A recognized header makes its labelled amount column authoritative: a row
  whose labelled cell is unparseable errors instead of a hunt through other
  columns.
- A cell that is not a well-formed number is never an amount, so tables that
  previously imported a date, a truncated address, or scientific notation as
  money now report `no-amount`. This is the point: silence became visible.

## Not covered

The Playwright E2E (`e2e/batch-send.spec.ts`) was not executed here; its pasted
fixtures are plain two-column `address,amount` rows, which the unit suite
covers directly (SC-004 verified statically, not by running the browser).
