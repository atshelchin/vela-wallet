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

## User Scenarios & Testing *(mandatory)*

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
