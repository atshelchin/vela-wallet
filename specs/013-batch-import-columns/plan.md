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

*(Revised after the adversarial review reproduced #137 through the first
design's table-wide voting — see research.md R2.)*

### Detection — one rule, `isAmountCell`

A cell reads as an amount only if it is a well-formed decimal (optional
thousands grouping), optionally flanked by currency signs and/or **one** short
currency token: a known code, an ALL-CAPS 2–5 letter ticker, a CJK currency
word, or a ≤3-letter code glued to a sign.

| Accepts | Rejects |
| --- | --- |
| `0.01`, `¥5,000.50`, `5 000`, `5000 USDT`, `USD 5000`, `MATIC 5000`, `R$ 5000`, `5000元` | `Alice123`, `团队2024`, `Team 2024`, `Bob 007`, `3M`, `1e5`, `1.00E+05`, `2026-08-05`, `0x123`, `1,23` |

`cleanAmount()` keeps its exact current behavior but is invoked only on the
*chosen* cell — it goes back to being a cleaner, not a detector.

### Resolution — the amount column is settled per row shape

Rows group by `(cell count, address index)`. Per shape:

1. header-labelled column, when the row actually has that column;
2. else the column most used by rows whose amount sits after the address;
3. else the column most used by rows with a single candidate.

Every row then reads only that column, so a blank amount cell is a visible
`no-amount` error rather than a name silently becoming a payment. Shapes with
no evidence fall back to first-candidate-after-address, then first candidate.
Evidence never crosses shapes — a 2-column `amount,address` row cannot speak
for a 3-column `name,address,amount` row.

Implementation shape: `interpretRows()` runs three passes — locate address +
candidates (a header-labelled address column wins, so an address pasted into
the name column cannot capture the payment); tally per shape; emit rows and
errors in source order with the existing line-numbering contract.

### Header mapping

Applied only to the row that is *already* dropped as a header today (first
non-blank row without an address). Recognized labels pin roles: amount column
becomes the sole amount source for every row (unparseable → `no-amount`);
name column is excluded from candidates and preferred for the name field.
Unrecognized headers change nothing.

## Design — in-band settlement (US0)

Lives in the relay, `/Volumes/data/production/vela-relay` (separate repository).

### Reprice, don't refuse

The executor quotes `max_fee = 2 × base_fee + tip` and requires
`markup × allocated_gas × max_fee`. The `2 ×` buys inclusion headroom; the chain
only ever charges `base_fee + tip`. So a payment that falls short at the quoted
cap is renegotiated instead of refused:

```
ratio      = min over payers of (paid / required)        # asset-agnostic, in bps
affordable = quoted_cap × ratio
floor      = base_fee × settlement_inclusion_floor_bps / 10_000 + tip
```

`affordable ≥ floor` → re-evaluate the whole bundle at `affordable`, sign at
that cap. The markup is preserved exactly: the payment covers
`markup × gas × affordable`, and the chain can never charge more than
`affordable`. The floor exists because the outbox broadcasts exact bytes and has
no fee-bump path — an underpriced transaction would wedge its lane's nonce, so
1.5× base fee (three blocks of maximum EIP-1559 growth) is the limit of what is
safe to sign.

### Hold, don't reject

A shortfall that survives repricing is a market condition, not a defect. The
operation moves to the existing durable delayed inbox — the same mechanism a
future account nonce uses — which retries with 5s → 5min backoff and lets the
Iggy offset advance so nothing queues behind it. `defer_user_operation` returns
the attempt count; past `settlement_hold_max_attempts` (12 attempts spend
~35 min — 5+10+20+40+80+160s then 300s each — inside the 1-hour status-record
TTL) the operation is rejected with a distinct reason.
Rejections that no price can cure are never held.

### Make the wait visible

`eth_getUserOperationStatus` already exists on the relay and the wallet never
called it, so a locally-rejected op read as "still confirming" forever. The
wallet now polls it alongside the receipt (12s cadence, first check deferred one
interval) and distinguishes three outcomes: rejected → fail now with the reason;
queued at stage `in_band_settlement_hold` → a waiting state that keeps the
transaction pending; anything else → unchanged. A relay that does not implement
the method returns an error and the wallet behaves exactly as before.

### Files

```text
vela-relay/src/
├── utils/config.rs                     # settlement_inclusion_floor_bps,
│                                       #   settlement_hold_max_attempts
├── worker/executor/settlement.rs       # is_shortfall, paid_ratio_bps,
│                                       #   affordable_fee_per_gas,
│                                       #   inclusion_floor_fee_per_gas
└── worker/executor/engine.rs           # settle_at_affordable_fee,
                                        #   hold_for_affordable_market,
                                        #   base_fee in TransactionContext

vela-wallet/src/
├── services/rpc-adapter.ts             # route eth_getUserOperationStatus
├── services/tx-reconciler.ts           # pollUserOpStatus, isFeeHold
├── services/safe-transaction.ts        # UserOpRejectedError, UserOpFeeHoldError
├── screens/wallet/useSendController.ts # feeHeld / feeRejected outcomes
├── screens/wallet/SendScreen.tsx       # holdReason wiring
└── components/ui/TransactionReceipt.tsx# held / rejected copy
```

## Complexity Tracking

No constitution violations; table intentionally empty.
