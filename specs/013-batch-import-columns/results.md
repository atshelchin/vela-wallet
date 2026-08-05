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

## In-band settlement (US0) — the payroll now reaches the chain

The corrected batch was still refused by the relay, 0.87% short
(`paid=4603572816058075872 required=4643859330530512244`). Cause: the wallet
funds `totalGas × networkFeePerGas × 3` while the relay requires
`allocated_gas × (2 × base_fee + tip) × 1.4` — unrelated formulas over
different gas bases, with the markup on both sides cancelling out any tolerance.

**Reprice instead of refuse.** The `2 ×` in the relay's cap is inclusion
headroom; the chain only charges `base_fee + tip`. The executor now treats the
signed reimbursement as a budget and reprices the outer transaction into it
(weakest payer sets the cap), as long as the result clears an inclusion floor of
1.5 × base fee + tip. The markup survives exactly, because the payment covers
`markup × gas × cap` and the chain cannot charge above `cap`. The floor is not
optional: the outbox broadcasts exact bytes with no fee-bump path, so an
underpriced transaction would wedge its lane's nonce.

**Hold instead of reject.** A shortfall that survives repricing goes to the
durable delayed inbox (5s → 5min backoff, Iggy offset advances so nothing queues
behind it) and executes itself when fees settle. After 12 attempts (≈30 min,
inside the 1-hour status-record TTL) it is rejected with a distinct reason.
Rejections no price can cure — malformed calldata, unproven transfer logs,
unsupported asset — are still immediate.

**Make the wait visible.** The wallet polled only
`eth_getUserOperationReceipt`, which stays `null` for a locally-rejected op
forever: a refused payroll rendered as "Sent! Confirming on-chain…"
indefinitely and stayed `pending` in storage. It now also polls
`eth_getUserOperationStatus` (12s cadence, first check deferred one interval)
and separates rejected (fail now, with the reason) from held (a waiting state
that keeps the record pending) from not-landed-yet (unchanged). A relay without
the method behaves exactly as before.

| Check | Result |
| --- | --- |
| `cargo test --bin vela-relay` | 158 pass, 0 fail (11 new settlement tests) |
| `cargo clippy` / `cargo fmt` on changed files | clean |
| Wallet `waitForReceipt` suite | 12 pass (6 pre-existing unchanged, 6 new) |
| Full wallet jest suite | 1531 pass, 128 suites |
| `npm run test:core` (i18n conformance corpus) | pass, all 15 locales |
| `tsc --noEmit` | clean |

Two deliberate baseline updates, both flagged in-code as "should only move
deliberately": the generated-path count in `scripts/gen-i18n.mjs`
(1243 → 1245) and the corpus leaf count in `resources-generated.test.ts`
(17,268 → 17,298) — two new keys × 15 locales.

## Not covered

- The Playwright E2E (`e2e/batch-send.spec.ts`) was not executed here; its
  pasted fixtures are plain two-column `address,amount` rows, which the unit
  suite covers directly (SC-004 verified statically, not by running the
  browser).
- The settlement change is verified by unit tests over the affordability and
  floor arithmetic, not against a live chain. The repricing and hold paths need
  a staging run — ideally replaying the issue's own UserOperation — before this
  is trusted in production.
- The relay's Tempo settlement path (`execute_tempo_bundle`) keeps its existing
  reject-on-shortfall behaviour. Tempo prices gas in pathUSD through a different
  cost model, so the same repricing argument does not transfer unexamined.
- The wallet's fee formula (`totalGas × networkFeePerGas × 3`) is untouched. The
  relay now absorbs the mismatch, but the two sides still compute the fee
  independently; aligning them is the durable fix and is not attempted here.
