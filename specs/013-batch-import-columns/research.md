# Research: Batch Import Column Inference

**Feature**: `013-batch-import-columns` | **Date**: 2026-08-05

## R1 — Root cause of issue #137

**Where**: `src/services/recipient-table.ts`, `interpretRows()` +
`cleanAmount()`.

The per-row amount pick is *first cell that survives `cleanAmount`*:

```ts
function cleanAmount(cell: string): string {
  const stripped = cell.replace(/[^0-9.]/g, '');   // ← extracts digits from ANY text
  …
  return Number.isFinite(n) && n > 0 ? stripped : '';
}

for (let i = 0; i < cells.length; i++) {
  if (i === addrIdx) continue;
  const cleaned = cleanAmount(cells[i]);
  if (cleaned) { amount = cleaned; amtIdx = i; break; }   // ← first match wins
}
```

Two defects compound:

1. **`cleanAmount` doubles as a detector but was designed as a cleaner.** Its
   strip-everything regex is right for `¥5,000.50` → `5000.50`, and wrong as a
   *test* of "is this cell an amount": `123123` → `123123`, `Alice123` → `123`,
   `团队2024` → `2024` all pass.
2. **First-match ordering favors the name column.** In the template order
   `name,address,amount` the name is scanned first, so any name that survives
   the cleaner shadows the true amount cell. The leftover amount cell (`0.01`)
   then falls through to the name pick (`first remaining non-empty cell`).

Reproduction (issue #137): `123123,0xaF5e…,0.01` → amount `123123`, name
`0.01`. Exactly the reported preview.

## R2 — Decision: shape-scoped amount column (revised after adversarial review)

> **Revision note.** The first implementation used two detection tiers plus a
> table-wide *vote* over single-candidate rows. A multi-agent adversarial review
> reproduced issue #137 through it: votes were keyed by absolute column index
> with no row-shape context, so a legal 2-column `amount,address` row voted for
> column 0 and that vote decided a 3-column `name,address,amount` row whose
> column 0 is the NAME (`5000,addr` + `123123,addr,0.01` → paid 123,123). Two
> further variants — a tie resolving leftmost, and a row with a blank amount
> cell voting for its own name — reached the same wrong outcome, and the
> permissive tier accepted `Team 2024` / `Bob 007` as amounts. The design below
> is the replacement; the rejected v1 is kept in the alternatives table.

**Decision**: one strict definition of "reads as an amount", plus an amount
**column settled per table shape** before any row is emitted.

**Detection — `isAmountCell`:** a cell qualifies only if it matches a
well-formed decimal (optional thousands grouping) optionally flanked by
currency signs and/or one short currency token, where a token is a known code
(`usdt`, `cny`, `matic`, …), an ALL-CAPS 2–5 letter ticker, a CJK currency word
(`元`), or a ≤3-letter code glued to a sign (`R$`, `US$`). `cleanAmount` goes
back to being only the value cleaner.

Accepts: `0.01`, `¥5,000.50`, `5 000`, `5000 USDT`, `USD 5000`, `MATIC 5000`,
`R$ 5000`, `5000元`. Rejects: `Alice123`, `团队2024`, `Team 2024`, `Bob 007`,
`3M`, `1e5`, `1.00E+05`, `2026-08-05`, `0x123`, `1,23` — every one of which the
old strip-everything detector turned into a payable number.

**Resolution — per shape, not per table:** rows are grouped by
`(cell count, address index)`. Within a shape the amount column is:

1. the header-labelled column (when the row actually has that column), else
2. the column most often used by rows whose amount sits **after** the address
   (the template convention), else
3. the column most often used by rows with exactly one candidate.

Every row of that shape then reads its amount **only** from the settled column,
so a blank amount cell becomes a visible `no-amount` error instead of silently
promoting the name. Rows of a shape with no evidence fall back to first
candidate after the address, then first candidate.

**Why this shape**: evidence never crosses row geometries (the confirmed
critical bug), the settled column makes missing amounts loud, and the exotic
`name,amount,address` order still resolves from its own shape's unambiguous
rows.

## R2b — Superseded: tiered candidate detection + table-wide votes

**Decision**: keep `cleanAmount` as the *value cleaner* it was designed to be,
and introduce a separate *detection* step with two tiers, then resolve
multi-candidate rows with table-level evidence.

**Detection tiers (per row, address cell excluded):**

- **Strict**: the cell contains no letters in any script (`\p{L}`) and cleans
  to a positive number. Catches `0.01`, `5,000.50`, `¥300`; rejects
  `Alice123`, `团队2024`, `5000 USDT`.
- **Permissive fallback** (only when a row has *zero* strict candidates): the
  cell cleans to a positive number and its digits are not preceded by a word —
  i.e. it starts with the number, optionally after currency symbols, or after a
  short (≤5-letter) currency code + whitespace. Keeps `5000 USDT` and
  `USD 5000` working; still rejects `Alice123`.

**Resolution precedence for rows with >1 candidate:**

1. **Header label** — a recognized amount column from the header row (R3).
2. **Table consistency** — the column that the table's *unambiguous* rows
   (exactly one candidate) chose most often.
3. **Position** — the first candidate after the address column (template
   convention `…,address,amount`; also neutralizes leading row-number columns).
4. **First candidate** — the old behavior, as the final fallback.

**Why this shape**:

- The issue's own table fixes itself twice over: rows named `Alice`/`Bob` are
  unambiguous and establish the amount column (tier 2); even a lone
  `123123,addr,0.01` row resolves by position (tier 3).
- Single-candidate rows resolve immediately, so **mixed-order pastes**
  (`5000,addr` next to `addr,3000`) keep working — a table-wide *locked*
  column mapping would break them.
- Every tier is deterministic; no input can flip between parses across runs.

**Alternatives considered**:

| Alternative | Rejected because |
| --- | --- |
| Strict detection only (no permissive tier) | Regresses `addr, 5000 USDT` — a currency-suffix amount that parses today would become `no-amount`. |
| Lock one column mapping for the whole table (majority vote over all rows) | Breaks ragged and mixed-order pastes that are legal today; a single weird row could outvote a valid one. |
| Require fixed column order / mandatory header | Documented flexibility (`address,amount`, `amount,address`, headerless paste) is a feature; the sheet doc and placeholder both promise it. |
| Fix only `cleanAmount` to reject letter-bearing cells | Leaves digits-only names (`123123` — the reported case!) unfixed: they contain no letters. |

## R3 — Decision: header synonym mapping (EN + zh)

**Decision**: when the first non-blank row is dropped as a header (existing
behavior: it carries no address), match its cells — trimmed, lowercased —
against synonym sets:

- **amount**: amount, amt, sum, value, money, pay, salary, wage, 金额, 数量,
  工资, 薪资, 薪酬, 数额, 转账金额, 发放金额
- **name**: name, username, nickname, employee, recipient, payee, contact,
  姓名, 名字, 名称, 收款人, 员工, 昵称
- **address**: address, addr, wallet, account, 地址, 钱包, 钱包地址, 账户,
  账号, 收款地址

Effects: an amount-labelled column becomes the *only* place a row's amount is
read from (an unparseable cell there → `no-amount`, a deliberate tightening —
see spec Assumptions); a name-labelled column is excluded from amount
candidates and preferred for the name field. Address detection stays per-row —
an address is self-evident.

**Why**: the wallet ships zh + en; the template header is `name,address,amount`;
the reporter's sheet came from a spreadsheet with headers. Recognizing the
declared layout beats inferring it. Unrecognized labels simply fall back to
content inference — no new failure mode.

## R4 — Blast radius

- `parseRecipientTableText` / `parseRecipientTable` are consumed only by
  `BatchImportSheet` (preview + apply). No other caller.
- `splitCsvLine` is shared with the contacts CSV importer (`contact-io.ts`) —
  **unchanged** by this fix.
- The Excel path funnels through the same `interpretRows` (FR-007) — the fix
  covers it with no extra work.
- E2E `e2e/batch-send.spec.ts` drives the paste path; existing pastes use
  plain-word names and stay green.

## R5 — Existing test expectations audited

Every case in `src/__tests__/services/recipient-table.test.ts` was traced
through the new algorithm on paper: delimiters, header drop, column-order
inference, BOM/CRLF, currency cleaning, checksummed addresses, blank lines,
error rows, empty input, and both xlsx dispatch tests produce identical
results. The xlsx test's `Carol , 0xcc… , ` row still errors as `no-amount`
via the header-pinned amount column (its labelled cell is empty).
