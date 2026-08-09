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
  /** The rate string. What is displayed IS what converts every row. */
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

/** Trim a float to a compact, trailing-zero-free string (fiat figures only). */
export function trimNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '');
}
