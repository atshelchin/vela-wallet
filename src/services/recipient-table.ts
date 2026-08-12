/**
 * recipient-table — parse a pasted or uploaded payee table into recipient rows,
 * for the payroll batch importer. A row carries one recipient address and one
 * amount (fiat by default; the importer applies the fiat→token conversion). A
 * name column is optional and, if present, becomes the contact label.
 *
 * The text path (CSV / TSV / TXT / pasted table) is pure and synchronous. The
 * Excel path lazily `import('xlsx')` so SheetJS (~1MB) never sits on the app's
 * startup path — it loads only when a user actually opens an .xlsx file.
 *
 * Column order is inferred, not fixed: the address is the cell that looks like an
 * address; the amount is a cell that READS as a number (letter-bearing cells like
 * `Alice123` / `团队2024` never qualify while a letter-free numeric cell exists —
 * issue #137: a digit-bearing name must not steal the amount); any remaining text
 * cell is the name. So `address,amount`, `amount,address`, and
 * `name,address,amount` all parse. When several cells in a row read as numbers,
 * the winner is chosen by header label (EN/zh synonyms) → the column this table's
 * unambiguous rows use → the first candidate after the address → first candidate.
 */
import { isAddress } from '@/models/types';

/** One successfully-read payee row. `line` is the 1-based source row (header excluded). */
export interface ParsedRow {
  line: number;
  name?: string;
  /** The address exactly as written; the caller lowercases/validates downstream. */
  address: string;
  /** The amount as a clean numeric string ("5000", "173.88"); caller converts fiat→token. */
  rawAmount: string;
}

export interface ParseError {
  line: number;
  raw: string;
  reason: 'no-address' | 'no-amount';
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
}

const DELIMITERS = [',', '\t', ';'] as const;

/**
 * Pick the delimiter for the table. We prefer whichever one splits the first line
 * into a cell that actually looks like an address (so `addr;¥5,000.50` chooses `;`
 * over the thousands-comma), and otherwise the one that yields the most columns.
 */
function sniffDelimiter(firstLine: string): string {
  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const cells = splitCsvLine(firstLine, d);
    const score = (cells.some((c) => isAddress(c.trim())) ? 1000 : 0) + (cells.length - 1);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** Split one CSV line, honouring simple double-quoted cells with "" escapes.
 *  Exported so the contacts CSV importer shares the exact same cell semantics. */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Reduce a cell to a positive decimal string, or '' if it isn't one. Strips
 * currency symbols, spaces, and thousands separators (`¥5,000.00` → `5000.00`).
 * NOTE: on comma-delimited text a value split by a thousands comma is already two
 * cells and can't be recovered — the CSV template documents "no thousands commas".
 * Excel cells arrive intact, so this is a text-CSV-only caveat.
 */
function cleanAmount(cell: string): string {
  const stripped = cell.replace(/[^0-9.]/g, '');
  if (!stripped) return '';
  if ((stripped.match(/\./g) || []).length > 1) return ''; // "1.2.3" — ambiguous
  const n = parseFloat(stripped);
  return Number.isFinite(n) && n > 0 ? stripped : '';
}

/** Header labels (lowercased) that pin a column's role when the first non-blank
 *  row is dropped as a header. Unrecognized labels fall back to content
 *  inference, so an unknown header is never worse than no header. */
const AMOUNT_LABELS = new Set([
  'amount', 'amt', 'sum', 'value', 'money', 'pay', 'salary', 'wage',
  '金额', '数量', '工资', '薪资', '薪酬', '数额', '转账金额', '发放金额',
]);
const NAME_LABELS = new Set([
  'name', 'username', 'nickname', 'employee', 'recipient', 'payee', 'contact',
  '姓名', '名字', '名称', '收款人', '员工', '昵称',
]);
const ADDRESS_LABELS = new Set([
  'address', 'addr', 'wallet', 'account', 'to',
  '地址', '钱包', '钱包地址', '账户', '账号', '收款地址',
]);

const CURRENCY_SIGNS = '¥$€£₩₽₹฿¢￥＄';
const CJK_CURRENCY = '元円圆块';
/** Lowercased codes that may flank a number. Any ALL-CAPS 2–5 letter token is
 *  also accepted (an unlisted ticker), which a capitalized name like `Alice`
 *  or `Team` is not. */
const CURRENCY_CODES = new Set([
  'usd', 'usdt', 'usdc', 'busd', 'dai', 'cny', 'rmb', 'eur', 'gbp', 'jpy', 'hkd',
  'krw', 'twd', 'sgd', 'aud', 'cad', 'chf', 'inr', 'brl', 'rub', 'thb', 'vnd',
  'myr', 'php', 'idr', 'eth', 'btc', 'bnb', 'pol', 'matic', 'sol', 'trx', 'ton',
]);

/**
 * The shape a cell must have to be READ as an amount: a well-formed decimal,
 * optionally flanked by currency signs and/or one short currency token.
 * Deliberately not `cleanAmount`'s strip-everything regex — that one is the
 * value CLEANER, and using it as a detector is what caused issue #137
 * (`123123` as a name, `Alice123`, `团队2024`, `2026-08-05`, `1e5` all
 * "cleaned" into plausible amounts).
 */
const AMOUNT_SHAPE = new RegExp(
  `^(?<lead>[A-Za-z]{1,5})?(?<leadSign>[${CURRENCY_SIGNS}]+)?\\s*` +
    `(?<num>\\d{1,3}(?:[,\\s'’]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+)` +
    `\\s*[${CURRENCY_SIGNS}]*\\s*(?<trail>[A-Za-z]{1,5}|[${CJK_CURRENCY}])?$`,
  'u',
);

const isCurrencyCode = (w: string) => CURRENCY_CODES.has(w.toLowerCase()) || /^[A-Z]{2,5}$/.test(w);

/** Does this cell read as an amount? (Value extraction stays with cleanAmount.) */
function isAmountCell(cell: string): boolean {
  const m = AMOUNT_SHAPE.exec(cell.trim());
  if (!m?.groups) return false;
  const { lead, leadSign, trail } = m.groups;
  // A leading word is a currency token only if it is a known/ticker-shaped code,
  // or a 1–3 letter code glued to a sign (`R$`, `US$`, `HK$`).
  if (lead && !isCurrencyCode(lead) && !(leadSign && lead.length <= 3)) return false;
  if (trail && !new RegExp(`^[${CJK_CURRENCY}]$`, 'u').test(trail) && !isCurrencyCode(trail)) return false;
  return cleanAmount(cell) !== '';
}

/** Interpret an already-split cell matrix. The first non-blank row is dropped as
 *  a header only when it carries no address (a real data row always has one);
 *  every later address-less row is reported as an error, not silently skipped.
 *
 *  A row can hold several cells that read as numbers (a digit-only NAME next to
 *  the amount — issue #137), so the amount COLUMN is settled per table shape
 *  before any row is emitted: header label → the column that rows with an
 *  unambiguous amount-after-address use → the column single-candidate rows use.
 *  Evidence is scoped to rows of the same shape (cell count + address position);
 *  a 2-column `amount,address` row must not speak for a 3-column
 *  `name,address,amount` row, which is how vote-mixing reintroduced #137. */
function interpretRows(matrix: string[][]): ParseResult {
  // Pass 0: normalize, drop blanks, split off the (optional) header row.
  interface Row { cells: string[]; addrIdx: number; cand: number[]; shape: string }
  const dataRows: Row[] = [];
  let header: string[] | null = null;
  let seenAnyRow = false;
  const rawRows: string[][] = [];
  matrix.forEach((cellsRaw) => {
    const cells = cellsRaw.map((c) => String(c ?? '').trim());
    if (cells.every((c) => c.length === 0)) return; // blank line
    if (!seenAnyRow) {
      seenAnyRow = true;
      if (cells.findIndex((c) => isAddress(c)) === -1) { header = cells; return; }
    }
    rawRows.push(cells);
  });

  const norm = (s: string) => s.trim().toLowerCase();
  const headerCells: string[] = header ?? [];
  const headerAmountIdx = headerCells.findIndex((c) => AMOUNT_LABELS.has(norm(c)));
  const headerNameIdx = headerCells.findIndex((c) => NAME_LABELS.has(norm(c)));
  const headerAddrIdx = headerCells.findIndex((c) => ADDRESS_LABELS.has(norm(c)));

  // Pass 1: locate the address and every cell that reads as an amount.
  rawRows.forEach((cells) => {
    // A labelled address column wins, so an address pasted into the NAME column
    // cannot capture the payment.
    const addrIdx =
      headerAddrIdx !== -1 && isAddress(cells[headerAddrIdx] ?? '')
        ? headerAddrIdx
        : cells.findIndex((c) => isAddress(c));
    const cand: number[] = [];
    if (addrIdx !== -1) {
      for (let i = 0; i < cells.length; i++) {
        if (i !== addrIdx && i !== headerNameIdx && isAmountCell(cells[i])) cand.push(i);
      }
    }
    dataRows.push({ cells, addrIdx, cand, shape: `${cells.length}:${addrIdx}` });
  });

  // Pass 2: settle one amount column per shape. Rows whose amount sits after the
  // address (the template convention) vote first; only if no row of that shape
  // has one do single-candidate rows — which may be a lone digit-only name on a
  // row whose real amount cell is blank — get to decide.
  const byShape = new Map<string, { after: Map<number, number>; single: Map<number, number> }>();
  const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
  dataRows.forEach(({ addrIdx, cand, shape }) => {
    if (addrIdx === -1 || cand.length === 0) return;
    const tally = byShape.get(shape) ?? { after: new Map(), single: new Map() };
    byShape.set(shape, tally);
    const firstAfter = cand.find((i) => i > addrIdx);
    if (firstAfter !== undefined) bump(tally.after, firstAfter);
    if (cand.length === 1) bump(tally.single, cand[0]);
  });
  const winner = (m: Map<number, number>): number => {
    let best = -1;
    let bestN = 0;
    for (const [col, n] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
      if (n > bestN) { bestN = n; best = col; }
    }
    return best;
  };
  const shapeAmountIdx = new Map<string, number>();
  byShape.forEach((tally, shape) => {
    const w = tally.after.size > 0 ? winner(tally.after) : winner(tally.single);
    if (w !== -1) shapeAmountIdx.set(shape, w);
  });

  // Pass 3: emit rows/errors in source order.
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  dataRows.forEach(({ cells, addrIdx, cand, shape }, rowIdx) => {
    const dataLine = rowIdx + 1;
    const raw = cells.join(' , ');
    if (addrIdx === -1) {
      errors.push({ line: dataLine, raw, reason: 'no-address' });
      return;
    }

    // An explicit header is authoritative wherever the row actually has that
    // column; a ragged row without it falls back to the inferred column.
    const pinned =
      headerAmountIdx !== -1 && headerAmountIdx !== addrIdx && headerAmountIdx < cells.length
        ? headerAmountIdx
        : shapeAmountIdx.get(shape) ?? -1;
    const amtIdx =
      pinned !== -1 && pinned !== addrIdx
        ? pinned
        : cand.find((i) => i > addrIdx) ?? (cand.length > 0 ? cand[0] : -1);
    // Reading only from the settled column is what makes a blank amount cell an
    // error the operator can see, instead of a name silently becoming a payment.
    const amount = amtIdx === -1 || !isAmountCell(cells[amtIdx] ?? '') ? '' : cleanAmount(cells[amtIdx]);
    if (!amount) {
      errors.push({ line: dataLine, raw, reason: 'no-amount' });
      return;
    }

    // Name: the header-labelled column first; else the first leftover cell that
    // reads as text (so a row-number column never labels the payee); else the
    // first non-empty leftover (a digit-only name is still a name).
    const leftover = (c: string, i: number) => i !== addrIdx && i !== amtIdx && c.length > 0;
    const name =
      (headerNameIdx !== -1 && headerNameIdx !== addrIdx && headerNameIdx !== amtIdx
        ? cells[headerNameIdx]
        : undefined) ||
      cells.find((c, i) => leftover(c, i) && !isAmountCell(c)) ||
      cells.find(leftover) ||
      undefined;
    rows.push({ line: dataLine, name, address: cells[addrIdx], rawAmount: amount });
  });

  return { rows, errors };
}

/** Parse delimited text (CSV / TSV / TXT / pasted). Pure + synchronous. */
export function parseRecipientTableText(text: string): ParseResult {
  const clean = text.replace(/^﻿/, ''); // strip BOM
  const lines = clean.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: [] };
  const delim = sniffDelimiter(lines[0]);
  return interpretRows(lines.map((l) => splitCsvLine(l, delim)));
}

/** Read an .xlsx/.xls workbook's first sheet into a cell matrix via lazy SheetJS.
 *  Exported because the web shell hands the matrix straight to the Rust
 *  `batch_import` core (which owns the interpretation), while native keeps
 *  using `parseRecipientTable` below — one SheetJS call site for both. */
export async function readWorkbookMatrix(bytes: Uint8Array): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  // header:1 ⇒ array-of-arrays; defval keeps column positions stable.
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
}

function isExcelName(name?: string): boolean {
  return !!name && /\.(xlsx|xlsm|xlsb|xls)$/i.test(name);
}

/**
 * Parse a table from either text or an Excel workbook. Pass a string for
 * CSV/TSV/TXT/pasted content, or bytes (+ a `.xlsx` filename) for Excel.
 */
export async function parseRecipientTable(
  input: string | Uint8Array,
  filename?: string,
): Promise<ParseResult> {
  if (typeof input === 'string' && !isExcelName(filename)) {
    return parseRecipientTableText(input);
  }
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return interpretRows(await readWorkbookMatrix(bytes));
}
