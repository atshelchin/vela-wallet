# Feature Specification: Batch Import Column Inference (digit-bearing names)

**Feature Branch**: `013-batch-import-columns`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "修复 issue #137 —— Web 端批量转账导入:当收款人名字包含数字时,
导入的行会被解析错乱,名字列和金额列互换。复现:名单里每人固定发 0.01 USDT,名字为
`123123` 的收款人被解析成金额 123,123.00 USDT、名字 0.01;纯文字名字的行全部正确。"

**Issue**: [#137 — Batch send import mixes up name and amount when a recipient's name contains digits](https://github.com/mondaylabsltd/vela-wallet/issues/137)

## Why

The batch importer infers column roles **per row, by content**: the address is
the cell that validates as an address, and the amount is *the first remaining
cell that yields digits after stripping every non-numeric character*. That
stripping is the root cause: it happily extracts a "number" out of a cell that
is plainly text — a payee named `123123` (or `Alice123`, or `团队2024`) becomes
the amount, and the real amount cell (`0.01`) is demoted to the name.

The failure is quiet and expensive. Nothing errors: the preview shows a
plausible row, and a payroll operator who trusts the sheet can sign a
single-UserOp batch that pays one employee **123,123 USDT instead of 0.01**.
The importer's whole purpose is that a spreadsheet can be trusted end-to-end;
a parser that swaps money and label on valid input breaks the feature's core
promise, not an edge case.

The fix must not sacrifice what the importer already does well: column order is
deliberately flexible (`address,amount`, `amount,address`, `name,address,amount`
all parse, pasted or uploaded, with currency symbols and thousands separators
tolerated), and existing sheets that parse correctly today must keep parsing
identically.

## Why (part 2) — the payroll still did not reach the chain

Fixing the parser made the preview correct, and the corrected batch was then
refused by the relay:

```
in-band settlement rejected UserOperation
paid=4603572816058075872 required=4643859330530512244 shortfall=40286514472436372
```

**0.87% short.** Not a bug in the amounts — a mismatch in how the two sides
price gas. The wallet funds `totalGas × networkFeePerGas × 3`; the relay
requires `allocated_gas × (2 × base_fee + tip) × 1.4`. Two unrelated formulas
over two different gas bases, quoted seconds apart, with nothing coupling them:
whether a send succeeds depends on where base fee, tip and the gas buffer happen
to sit at that instant. The markup multiplies both sides, so it provides no
tolerance at all.

The `2 ×` in the relay's cap is the key: it is *inclusion headroom*, not cost. A
transaction only ever pays `base_fee + tip`. So the relay was refusing a payment
that comfortably covered its real cost, because that payment did not also fund a
cap the chain was never going to charge.

And the refusal was invisible. The wallet polls only
`eth_getUserOperationReceipt`, which stays `null` for a locally-rejected op
forever, so the send screen showed "Sent! Confirming on-chain…" indefinitely and
the stored transaction stayed `pending`. The operator learned the payroll had
failed by reading Redis.

## User Scenarios & Testing *(mandatory)*

### User Story 0 - A payroll survives ordinary gas volatility (Priority: P1)

A payroll operator confirms a batch. Between the confirm screen and execution
the market moves, and what they signed no longer funds the relay's quoted fee
cap. The transaction still goes through — priced at what they approved — and if
the market is genuinely above their budget it waits and sends itself when fees
settle, rather than being thrown away.

**Why this priority**: without it, the corrected batch from US1 still does not
pay anyone.

**Independent Test**: reproduce the shortfall (a signed reimbursement 0.87%
below the quoted requirement) and assert the operation is executed at the
repriced fee rather than rejected.

**Acceptance Scenarios**:

1. **Given** a reimbursement that falls short at the quoted `2 × base_fee + tip`
   cap but still funds a cap above the inclusion floor, **When** the executor
   settles the bundle, **Then** the outer transaction is signed at the
   affordable cap and the operation executes — with the relay's markup intact
   against the fee the chain actually charges.
2. **Given** a bundle where several payers underpay by different amounts,
   **When** it is repriced, **Then** the cap is the one the *weakest* payer can
   fund, so no operation cross-subsidizes another.
3. **Given** a reimbursement too small to fund an includable fee, **When** the
   executor settles, **Then** the operation is held — not rejected — and retried
   with backoff as the market moves.
4. **Given** an operation held past its waiting budget, **When** the budget is
   spent, **Then** it is rejected with a reason that says fees stayed too high
   and nothing was sent.
5. **Given** a rejection that no price can cure (malformed calldata, wrong
   recipient, unsupported asset), **When** it is evaluated, **Then** it is
   rejected immediately, never held.
6. **Given** an operation the relay has rejected, **When** the wallet polls,
   **Then** it reports the failure promptly instead of showing "confirming"
   until it times out; **and given** a held operation, **Then** it says the
   transaction is waiting for fees and keeps it pending.

---

### User Story 1 - A digit-bearing name never steals the amount (Priority: P1)

A payroll operator imports a sheet of `name,address,amount` rows where every
recipient gets the same fixed amount. Some names are plain words, some contain
digits, and some are digits only (employee IDs used as names). Every row parses
with the amount taken from the amount column and the name preserved verbatim.

**Why this priority**: This is issue #137 itself — the only story that, if
unfixed, moves the wrong amount of money.

**Independent Test**: Paste the issue's reproduction table (mixed plain and
digit-bearing names, fixed `0.01` amount) and verify every recipient previews at
`0.01` with names intact.

**Acceptance Scenarios**:

1. **Given** a table containing `Alice,0xA…,0.01` and `123123,0xB…,0.01`,
   **When** it is imported, **Then** both rows parse with amount `0.01`, and the
   second row's name is `123123`.
2. **Given** a row whose name mixes letters and digits (`Alice123,0xA…,5000`),
   **When** it is imported, **Then** the amount is `5000` — never a digit run
   extracted from the name.
3. **Given** a row whose name mixes CJK and digits (`团队2024,0xA…,300`),
   **When** it is imported, **Then** the amount is `300`.
4. **Given** a single pasted row `123123,0xA…,0.01` (no other rows to learn
   from), **When** it is imported, **Then** the amount is `0.01` and the name is
   `123123`.

---

### User Story 2 - A recognized header row locks column roles (Priority: P2)

An operator uses the downloadable template (header `name,address,amount`) or a
Chinese-labelled sheet (`姓名,地址,金额`). The header — already detected and
dropped today — additionally pins which column is the amount and which is the
name, so no content heuristic can override the operator's declared layout.

**Why this priority**: The issue reporter's sheet came from the template flow;
honoring an explicit header removes all ambiguity for every template user, in
any of the wallet's languages.

**Independent Test**: Import a headered sheet whose name column is entirely
numeric (employee IDs) and verify amounts come from the labelled amount column.

**Acceptance Scenarios**:

1. **Given** a sheet with header `name,address,amount` where every name is a
   numeric ID, **When** it is imported, **Then** every amount comes from the
   third column and every ID lands in the name field.
2. **Given** a header `姓名,地址,金额` with the same data, **When** it is
   imported, **Then** the result is identical to scenario 1.
3. **Given** a headered sheet where a row's labelled amount cell is not a
   positive number (`Alice,0xA…,abc`), **When** it is imported, **Then** that
   row is reported as a no-amount error — the parser does not go hunting for a
   number in other columns.

---

### User Story 3 - Everything that parsed before still parses the same (Priority: P3)

Operators with existing sheets — two-column `address,amount`, amount-first
`amount,address`, currency symbols (`¥5,000.50`), currency suffixes
(`5000 USDT`), semicolon/tab delimiters, Excel uploads — re-import them after
the fix and get byte-identical results.

**Why this priority**: The importer is live; a fix that re-breaks working
payroll sheets converts one incident into many.

**Independent Test**: The pre-existing unit-test suite for the parser passes
unmodified.

**Acceptance Scenarios**:

1. **Given** every input shape in the existing parser test suite, **When**
   parsed after the fix, **Then** rows, names, amounts, errors, and line
   numbers are unchanged.
2. **Given** a row whose amount carries a currency suffix (`0xA…,5000 USDT`)
   and no other numeric cell, **When** it is imported, **Then** the amount is
   `5000`, as today.

---

### Edge Cases

- A sheet exported with a leading row-number column (`1,Alice,0xA…,5000`): the
  amount must come from the column after the address, not the row number.
- A table whose *every* name is digits-only and that has no header: rows are
  individually ambiguous; resolution must be deterministic and prefer the
  amount-after-address convention used by the template.
- Ragged pastes (rows with different column counts, e.g. two-column and
  three-column lines mixed): each row still resolves; table-level evidence is
  advisory, never a crash.
- Rows that legitimately have no amount anywhere must still be reported as
  `no-amount` errors — a digit run inside a text cell is not an amount.
- The Excel path and the pasted-text path must interpret an identical cell
  matrix identically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A cell containing letters in any script (Latin, CJK, etc.) MUST
  never be selected as the amount when any letter-free numeric cell exists in
  the same row.
- **FR-002**: When more than one cell in a row could be the amount, the parser
  MUST resolve the ambiguity with table-level evidence, in this precedence:
  a recognized header label, then the column that the table's unambiguous rows
  use, then position (first candidate after the address column), then first
  candidate.
- **FR-003**: A first-row header (already dropped today when it carries no
  address) whose cells match known synonyms — at minimum English and Chinese
  labels for name / address / amount — MUST pin those column roles: the amount
  is read only from the amount-labelled column, and a name-labelled column is
  never treated as the amount.
- **FR-004**: The name field MUST receive the row's remaining text cell
  verbatim — including names that are digits-only — and MUST NOT receive the
  amount value.
- **FR-005**: Every input that parses correctly today MUST parse to an
  identical result after the change (rows, errors, ordering, line numbers,
  amount cleaning of currency symbols and thousands separators).
- **FR-006**: A row with an address but no cell that qualifies as an amount
  MUST be reported as a `no-amount` error, never silently repaired.
- **FR-007**: Text (pasted / CSV / TSV / TXT) and Excel inputs MUST share the
  same row-interpretation logic, so a fix applies to both automatically.

#### In-band settlement (US0)

- **FR-008**: When a signed reimbursement does not fund the quoted outer fee
  cap, the relay MUST reprice the outer transaction down to the cap that
  reimbursement does fund, rather than refuse it — provided the repriced cap
  still clears an inclusion floor expressed as a multiple of the base fee.
- **FR-009**: Repricing MUST preserve the settlement markup against the fee the
  chain actually charges, and MUST use the weakest payer's affordable cap so no
  operation subsidizes another.
- **FR-010**: A shortfall that survives repricing MUST be held and retried with
  backoff, not rejected. A held operation MUST NOT block other operations queued
  behind it.
- **FR-011**: A hold MUST expire after a bounded waiting budget, after which the
  operation is rejected with a distinct, actionable reason.
- **FR-012**: Rejections that no price can cure (malformed calldata, unproven
  transfer logs, unsupported asset) MUST remain immediate rejections.
- **FR-013**: The wallet MUST distinguish, before any receipt exists, an
  operation that was rejected from one that is held from one that is simply not
  landed yet, and MUST reflect each in what the user sees: a failure, a wait, or
  ordinary confirmation. A relay without the status method MUST behave exactly
  as before.

### Key Entities

- **Parsed row**: one payee — source line number, optional display name,
  address as written, amount as a clean numeric string.
- **Column role**: per-table assignment of *address* / *amount* / *name* to
  cell positions, derived from header labels and row content.
- **Parse error**: a rejected row with its line number and reason
  (`no-address` / `no-amount`), surfaced in the import preview.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The exact reproduction table from issue #137 imports with every
  recipient at the fixed amount and every name preserved; the `123123` payee
  shows amount `0.01`, not `123123.00`.
- **SC-002**: 100% of the pre-existing parser unit tests pass without
  modification.
- **SC-003**: New regression tests cover digit-only names, mixed letter-digit
  names, CJK-digit names, single-row ambiguity, header pinning (EN + zh), the
  leading row-number column, and the currency-suffix amount — all passing.
- **SC-004**: The batch-send E2E flow (paste path) passes unchanged.
- **SC-005**: The exact shortfall from the rejected payroll (paid
  4603572816058075872 vs required 4643859330530512244) executes instead of being
  refused, and the repriced cap is provably above both the inclusion floor and
  `base_fee + tip`.
- **SC-006**: A rejected operation surfaces in the wallet within one status-poll
  interval instead of after the 120-second receipt timeout, and a held operation
  never renders as a failure.

## Assumptions

- The importer's documented flexible column orders (`address,amount`,
  `amount,address`, `name,address,amount`) remain the supported set; exotic
  orders such as `amount,address,name` with digit-only names stay best-effort.
- When a headerless table is a single ambiguous row, the template convention
  (amount after address) is the correct tie-break; the preview remains the
  operator's final verification surface.
- Header synonym coverage for English and Chinese labels is sufficient for the
  wallet's current audience; other languages fall back to content inference.
- The `no-amount` tightening for headered sheets (FR-003 / US2 scenario 3) is a
  deliberate behavior change: it converts a silent mis-parse into a visible
  error and is judged safe because it only fires when the operator explicitly
  labelled the column.
