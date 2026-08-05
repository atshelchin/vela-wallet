# Quickstart: Batch Import Column Inference

**Feature**: `013-batch-import-columns` — fix for
[issue #137](https://github.com/mondaylabsltd/vela-wallet/issues/137)

## Reproduce the bug (pre-fix)

1. Web wallet → Send → batch import (发薪表格导入).
2. Paste (or upload as CSV) — note the digit-only name on the second row:

   ```csv
   Alice,0x1111111111111111111111111111111111111111,0.01
   123123,0xaF5e4d00000000000000000000000000008b2Cde,0.01
   ```

3. Pre-fix preview: the second recipient shows amount **123123** and name
   **0.01** — name and amount swapped. Post-fix: both rows at `0.01`, second
   name `123123`.

## Verify with unit tests

```bash
npx jest src/__tests__/services/recipient-table.test.ts
```

- Pre-existing describe-blocks: must pass unmodified (SC-002).
- New blocks (`issue #137` / header pinning / ambiguity resolution): cover
  digit-only, letter+digit, and CJK+digit names, single-row ties, EN/zh
  headers, leading row-number columns, and currency-suffix amounts (SC-003).

## Verify the E2E paste path

```bash
npx playwright test e2e/batch-send.spec.ts
```

## What changed, one paragraph

`src/services/recipient-table.ts` no longer treats "strips to digits" as "is
an amount". A cell qualifies as an amount candidate only if it *reads* as a
number (no letters; currency symbols/suffixes tolerated), and when several
cells qualify, the winner is chosen by header label (EN/zh synonyms) → the
column the table's unambiguous rows use → the first candidate after the
address → legacy first-match. Value cleaning and every previously-correct
parse are unchanged.
