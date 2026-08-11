/**
 * The shapes the payroll batch-import controller returns on every platform.
 *
 * A standalone module for the same reason `receive-controller-types.ts` is
 * one: a platform pair (`use-batch-import.ts` / `use-batch-import.web.ts`)
 * must never import its own base file — on web, Metro resolves that specifier
 * back to the `.web.ts` variant itself, and a self-referential re-export
 * recurses at module init. Both variants import from here instead.
 *
 * It also carries `trimNum`, the one value formatter the component and the
 * native controller share (the web controller gets the same shape out of the
 * core's view, already trimmed).
 */

import type { APIToken } from '@/models/types';
import { tokenPriceInFiat } from '@/services/fiat-convert';
import type { ParseResult } from '@/services/recipient-table';
import { convertibleRate, type FiatRateQuote } from '@/services/fiat-rate-quote';

/**
 * Re-exported for the importer's own call sites. The type — and the rule that
 * unwraps it — live in `services/fiat-rate-quote.ts` because the send screen
 * needs the identical guard on the identical hazard; a copy here would be a
 * second place for the two to drift.
 */
export type { FiatRateQuote };

/** Which unit the pasted numbers are in. Mirrors the core's `BatchUnit`. */
export type BatchUnitKey = 'fiat' | 'token';

/** Mirrors the core's `BatchRateStatus`. */
export type BatchRateStatusKey = 'loading' | 'ok' | 'failed';

/** One preview row — validated, de-duplicated, converted. Values only: the
 *  symbols, arrows and locale formatting stay in the component. */
export interface BatchPreviewRowView {
  line: number;
  name?: string;
  address: string;
  valid: boolean;
  /** Duplicate of an earlier VALID row — the first occurrence keeps the payment. */
  dup: boolean;
  /** The amount as pasted (a fiat figure in fiat mode, a token figure in token mode). */
  rawAmount: string;
  /** The converted token amount; '' when no positive rate is set in fiat mode. */
  tokenAmount: string;
  ok: boolean;
}

/** The hand-off draft for the split editor (`RecipientDraft` minus the row id,
 *  which the component assigns with `makeRecipientId`). */
export interface BatchRecipientDraft {
  address: string;
  /** Human token amount, decimal string. */
  amount: string;
  name?: string;
}

export interface BatchImportOptions {
  /** The sheet's visibility — every transition to `true` is a full reset. */
  visible: boolean;
  token: APIToken;
  /** The app's display currency: the default the amounts are read as. */
  currencyCode: string;
  maxRecipients: number;
  /** Called once per successful apply, with the capped + converted drafts. */
  onApplied: (recipients: BatchRecipientDraft[]) => void;
}

export interface BatchImportController {
  unit: BatchUnitKey;
  setUnit: (unit: BatchUnitKey) => void;
  /** The per-batch "Priced in" currency — scoped, never the app-wide setting. */
  fiatCode: string;
  setFiatCode: (code: string) => void;

  rawText: string;
  setRawText: (text: string) => void;
  fileName: string | null;
  busy: boolean;
  pickFile: () => void;
  saveTemplate: () => void;
  templateSaved: boolean;

  /** `!!token.priceUsd && token.priceUsd > 0` — drives the rate hints. */
  priced: boolean;
  rateStatus: BatchRateStatusKey;
  /** The rate string, and it always belongs to `fiatCode`. What is displayed
   *  IS what converts every row; EMPTY converts nothing and disables Apply —
   *  which is where an unknown rate, a failed fetch, and the whole round-trip
   *  after a "Priced in" switch all land. */
  rateInput: string;
  /** Feed dot-normalized input text (`parseLocaleNumber` output). */
  setRateText: (text: string) => void;
  rateEdited: boolean;
  resetRate: () => void;

  preview: BatchPreviewRowView[];
  /** More ok rows than the cap — shown TOGETHER with `rejected`. */
  overCap: boolean;
  rejected: number;
  /** How many recipients apply would hand over — what the CTA counts. */
  recipientCount: number;
  /** Σ of the capped token amounts, human decimal string. */
  totalToken: string;
  /** Σ of the capped fiat figures, trimmed — null when there is none. */
  totalFiat: string | null;
  overBalance: boolean;
  canApply: boolean;
  apply: () => void;
}

/**
 * The importer's auto rate — `forCode` per 1 token, or `0` when it cannot be
 * known.
 *
 * FOUR cases the mirror must not collapse into one:
 *   - `null`/`undefined` — UNKNOWN: no source could price the currency, or the
 *     fetch has not landed yet. Nothing is asserted about the rate.
 *   - `rate <= 0` — INVALID: a source answered something that is not a rate.
 *   - `code !== forCode` — MISLABELLED: a perfectly good rate for a DIFFERENT
 *     currency. Just as unusable as unknown, and more dangerous, because it is
 *     a plausible number: it renders, it converts, and it turns Apply green.
 *   - `code === forCode && rate > 0` — KNOWN: the only case that converts.
 *
 * The first three return `0`, which empties the rate field — and because the
 * displayed string IS the applied rate, no row converts and `canApply` stays
 * false until the user types a rate by hand.
 *
 * This is deliberately a CALL-SITE guard rather than an edit to
 * `fiat-convert.ts::tokenPriceInFiat`, whose `usdToFiatRate > 0 ? … : 1`
 * fallback is a legitimate display convenience elsewhere (the balance card
 * renders the USD figure rather than a blank) — the same split `currency.ts`
 * draws between `resolveRate` (money) and `getRate` (display).
 *
 * What the fallback cost here: an unpriceable currency mirrored as rate 1, so a
 * `5000 CNY` payroll line previewed as 5000 USDT — worth ~698 — with Apply
 * enabled. ~7x the intended payout behind a green button. The `code` check is
 * the same refusal reached from the other side: keeping USD's rate of 1 across
 * a switch to CNY misprices that identical line identically. Owner ruling, and
 * the twin of the Rust core's `auto_price_per_token`: when the number that
 * moves money is unknown — or is known to be about something else — stop; do
 * not guess.
 */
export function autoPricePerToken(
  priceUsd: number | null | undefined,
  quote: FiatRateQuote | null | undefined,
  forCode: string,
): number {
  // The four-way discrimination itself is `convertibleRate` — shared with the
  // send screen, which faces the same hazard through `useDisplayCurrency`.
  // Here its `null` becomes the importer's `0`, i.e. an empty rate field.
  const rate = convertibleRate(quote, forCode);
  if (rate == null) return 0;
  return tokenPriceInFiat(priceUsd, rate);
}

/**
 * Every piece of state one OPEN of the sheet owns — as one value, not eleven.
 *
 * The native controller holds exactly this object and resets it by REPLACING
 * it, so "what does an open clear" is answered by the type rather than by a
 * list of `setX(...)` calls someone has to remember to extend. It used to be
 * that list, and the list had drifted: it cleared the paste, the file, the
 * currency and the rate-edited flag, but not the RATE. Reopening the sheet
 * therefore showed "Fetching rate…" over the previous session's rate string —
 * and since the displayed string IS the applied rate, a payroll pasted in that
 * window converted at the old currency's number with Apply green. The Rust twin
 * never had the bug because its reset is a single `Model` assignment on `Open`;
 * this type is that assignment.
 */
export interface BatchOpenState {
  unit: BatchUnitKey;
  /** The per-batch "Priced in" currency. */
  fiatCode: string;
  rawText: string;
  /** A picked spreadsheet's parsed rows, when the paste box is not the source. */
  fileParsed: ParseResult | null;
  fileName: string | null;
  busy: boolean;
  templateSaved: boolean;
  /** The rate, WITH the currency it was fetched for. Never a bare number. */
  rateQuote: FiatRateQuote | null;
  rateStatus: BatchRateStatusKey;
  /** What the user typed into the rate field; only consulted when `rateEdited`. */
  typedRate: string;
  rateEdited: boolean;
}

/**
 * A freshly opened sheet. The twin of `batch_import.rs`'s `Open` handler: a
 * currency, a unit that depends only on whether the token has a price, and
 * NOTHING carried over — no paste, no file, no rate, no rate status.
 *
 * `rateStatus: 'loading'` rather than `'failed'` because an open always starts
 * a fetch; `rateQuote: null` because the quote in hand belongs to the previous
 * open and, being for a currency this open has not confirmed, could only ever
 * mislabel itself here.
 */
export function freshBatchOpen(priced: boolean, currencyCode: string): BatchOpenState {
  return {
    unit: priced ? 'fiat' : 'token',
    fiatCode: currencyCode,
    rawText: '',
    fileParsed: null,
    fileName: null,
    busy: false,
    templateSaved: false,
    rateQuote: null,
    rateStatus: 'loading',
    typedRate: '',
    rateEdited: false,
  };
}

/** Trim a float to a compact, trailing-zero-free string (fiat figures only). */
export function trimNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '');
}
