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
 *  row is dropped as a header. The address column needs no label — an address
 *  cell is self-evident. Unrecognized labels fall back to content inference. */
const AMOUNT_LABELS = new Set([
  'amount', 'amt', 'sum', 'value', 'money', 'pay', 'salary', 'wage',
  '金额', '数量', '工资', '薪资', '薪酬', '数额', '转账金额', '发放金额',
]);
const NAME_LABELS = new Set([
  'name', 'username', 'nickname', 'employee', 'recipient', 'payee', 'contact',
  '姓名', '名字', '名称', '收款人', '员工', '昵称',
]);

/**
 * Amount DETECTION is stricter than amount CLEANING (issue #137): a cell counts
 * as an amount candidate only if it reads as a number and nothing else — no
 * letters in any script — so `Alice123` / `团队2024` / a digit-only NAME can
 * never shadow the true amount cell just because digits survive stripping.
 */
function isStrictAmountCell(cell: string): boolean {
  return !/\p{L}/u.test(cell) && cleanAmount(cell) !== '';
}

/** Fallback used only when a row has NO strict candidate: the cell must begin
 *  with the number — optional currency symbols, or a ≤4-letter currency code
 *  plus whitespace — keeping `5000 USDT` / `USD 5000` importable while still
 *  rejecting a word glued to digits. */
function isPermissiveAmountCell(cell: string): boolean {
  return /^(?:[A-Za-z]{1,4}\s+)?[^\p{L}]*\d/u.test(cell.trim()) && cleanAmount(cell) !== '';
}

/** Interpret an already-split cell matrix. The first non-blank row is dropped as
 *  a header only when it carries no address (a real data row always has one);
 *  every later address-less row is reported as an error, not silently skipped.
 *
 *  Amount-column resolution runs in two passes so a row with several numeric
 *  cells (e.g. a digit-only name AND an amount) can borrow evidence from the
 *  rest of the table: header label → the column unambiguous rows chose →
 *  first candidate after the address → first candidate (legacy order). */
function interpretRows(matrix: string[][]): ParseResult {
  // Pass 0: normalize, drop blanks, split off the (optional) header row.
  interface Row { cells: string[]; addrIdx: number }
  const dataRows: Row[] = [];
  let header: string[] | null = null;
  let seenAnyRow = false;
  matrix.forEach((cellsRaw) => {
    const cells = cellsRaw.map((c) => String(c ?? '').trim());
    if (cells.every((c) => c.length === 0)) return; // blank line
    const addrIdx = cells.findIndex((c) => isAddress(c));
    if (!seenAnyRow) {
      seenAnyRow = true;
      if (addrIdx === -1) { header = cells; return; }
    }
    dataRows.push({ cells, addrIdx });
  });

  const norm = (s: string) => s.trim().toLowerCase();
  const headerCells: string[] = header ?? [];
  const headerAmountIdx = headerCells.findIndex((c) => AMOUNT_LABELS.has(norm(c)));
  const headerNameIdx = headerCells.findIndex((c) => NAME_LABELS.has(norm(c)));

  // Pass 1: per-row candidate sets; rows with exactly one candidate resolve now
  // and their chosen column votes for the table's amount column.
  const candidateSets: number[][] = [];
  const votes = new Map<number, number>();
  dataRows.forEach(({ cells, addrIdx }) => {
    if (addrIdx === -1) { candidateSets.push([]); return; }
    const eligible = (i: number) => i !== addrIdx && i !== headerNameIdx;
    let cand: number[] = [];
    if (headerAmountIdx !== -1) {
      // An explicit header is authoritative: the amount is read from the
      // labelled column or the row errors — no hunting in other columns.
      if (eligible(headerAmountIdx) && cleanAmount(cells[headerAmountIdx] ?? '')) cand = [headerAmountIdx];
    } else {
      for (let i = 0; i < cells.length; i++) if (eligible(i) && isStrictAmountCell(cells[i])) cand.push(i);
      if (cand.length === 0) {
        for (let i = 0; i < cells.length; i++) if (eligible(i) && isPermissiveAmountCell(cells[i])) cand.push(i);
      }
    }
    candidateSets.push(cand);
    if (cand.length === 1) votes.set(cand[0], (votes.get(cand[0]) ?? 0) + 1);
  });

  // Pass 2: emit rows/errors in source order, resolving ambiguous rows with the
  // table-level evidence gathered above.
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  dataRows.forEach(({ cells, addrIdx }, rowIdx) => {
    const dataLine = rowIdx + 1;
    const raw = cells.join(' , ');
    if (addrIdx === -1) {
      errors.push({ line: dataLine, raw, reason: 'no-address' });
      return;
    }

    const cand = candidateSets[rowIdx];
    let amtIdx = -1;
    if (cand.length === 1) {
      amtIdx = cand[0];
    } else if (cand.length > 1) {
      let bestVotes = 0;
      for (const i of cand) {
        const v = votes.get(i) ?? 0;
        if (v > bestVotes) { bestVotes = v; amtIdx = i; }
      }
      if (amtIdx === -1) amtIdx = cand.find((i) => i > addrIdx) ?? cand[0];
    }
    const amount = amtIdx === -1 ? '' : cleanAmount(cells[amtIdx]);
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
      cells.find((c, i) => leftover(c, i) && !isStrictAmountCell(c)) ||
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

/** Read an .xlsx/.xls workbook's first sheet into a cell matrix via lazy SheetJS. */
async function parseWorkbook(bytes: Uint8Array): Promise<string[][]> {
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
  return interpretRows(await parseWorkbook(bytes));
}
