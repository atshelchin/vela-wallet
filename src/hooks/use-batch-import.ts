/**
 * useBatchImport — the payroll batch importer's controller, NATIVE (and the
 * shared TypeScript implementation the mobile app keeps).
 *
 * Extracted verbatim from `BatchImportSheet.tsx` (spec 017, group G5): the
 * table parse, the USD→fiat rate fetch, the rate mirror, the fiat→token
 * conversion, the cap and every gate. The component above it now only renders.
 * The web twin (`use-batch-import.web.ts`) drives the Rust `batch_import`
 * machine instead; both expose `BatchImportController`.
 *
 * Rate invariant: the rate string in the input IS the applied rate — display
 * and conversion never diverge (the old toFixed(2) mirror showed "0" for
 * sub-cent prices while converting at the true value, and a touch then zeroed
 * every row). Its corollary, since an empty string converts nothing: a rate
 * this controller cannot vouch for leaves the field EMPTY and Apply disabled,
 * rather than quietly converting at it. TWO ways a rate is unvouchable, and
 * both are refused by the same check (`autoPricePerToken`): nobody could fetch
 * it, or it was fetched for a different currency — which is why the rate is
 * stored as a `FiatRateQuote` carrying its own code, and never as a bare
 * number that a "Priced in" switch can silently relabel. Both twins hold this;
 * the web core's `auto_price_per_token` is the same guard in Rust.
 *
 * Per-open reset: every field an open owns lives in ONE `BatchOpenState`, and
 * opening REPLACES it. A reset written as a list of `setX(...)` calls is a
 * list that drifts — this one had, and the field it had lost was the rate, so a
 * reopened sheet showed "Fetching rate…" over the last session's number and
 * converted at it. The Rust twin resets by assigning its `Model` on `Open`;
 * this is the same move. Nothing outside `visible` may trigger it, which is why
 * `priced` rides a ref: a background price refresh flipping it used to wipe the
 * operator's pasted payroll mid-edit.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAddress } from '@/models/types';
import { resolveQuote } from '@/services/currency';
import { toBaseUnits, fromBaseUnits } from '@/services/eip681';
import { fiatToTokenAmount } from '@/services/fiat-convert';
import { pickTable, saveTextFile } from '@/services/file-io';
import { showAlert } from '@/services/platform';
import { parseRecipientTableText, parseRecipientTable, type ParseResult } from '@/services/recipient-table';

import {
  autoPricePerToken,
  freshBatchOpen,
  trimNum,
  type BatchImportController,
  type BatchImportOptions,
  type BatchOpenState,
  type BatchPreviewRowView,
} from './batch-import-controller-types';

const TEMPLATE_CSV =
  'name,address,amount\n' +
  'Alice,0x1111111111111111111111111111111111111111,5000\n' +
  'Bob,0x2222222222222222222222222222222222222222,8000\n' +
  'Carol,0x3333333333333333333333333333333333333333,6500\n';

export function useBatchImport({
  visible,
  token,
  currencyCode,
  maxRecipients,
  onApplied,
}: BatchImportOptions): BatchImportController {
  const { t } = useTranslation();
  const priced = !!token.priceUsd && token.priceUsd > 0;

  // ONE state value for everything an open owns, so the reset below is a
  // replacement rather than a checklist — see `BatchOpenState`. Individual
  // fields are updated through `patch`.
  const [openState, setOpenState] = useState<BatchOpenState>(() => freshBatchOpen(priced, currencyCode));
  const {
    unit, fiatCode, rawText, fileParsed, fileName, busy, templateSaved,
    rateQuote, rateStatus, typedRate, rateEdited,
  } = openState;
  const patch = (fields: Partial<BatchOpenState>) => setOpenState((prev) => ({ ...prev, ...fields }));

  // Latest-value ref: a background price refresh replacing the token object
  // must NOT re-run the reset effect below. `priced` was in its dependency
  // array, so an unpriced token that got a price mid-edit flipped `priced`
  // false→true and silently wiped the operator's pasted payroll — unit back to
  // 'fiat', `rawText` emptied, preview gone, no message, mid-paste. The core has
  // no equivalent trigger (its reset is the `open` EVENT and nothing else), and
  // the web twin keeps `token` in a ref for exactly this reason; native does too.
  const pricedRef = useRef(priced);
  pricedRef.current = priced;

  // Reset per-open so the sheet never reopens with a stale paste/rate. Every
  // transition to visible replaces the whole value: nothing survives an open
  // unless `freshBatchOpen` says it does, which is what stopped the previous
  // session's RATE from surviving — it did, silently, while the status read
  // "Fetching rate…", and a payroll pasted in that window converted at it with
  // Apply green.
  useEffect(() => {
    if (!visible) return;
    setOpenState(freshBatchOpen(pricedRef.current, currencyCode));
  }, [visible, currencyCode]);

  // USD→fiat rate for the chosen currency (auto rate). Re-fetch when it changes;
  // status drives the loading/failure hints so a dead "0" is never unexplained.
  //
  // `resolveQuote`, NOT `getRate`: `getRate` is the DISPLAY helper and ends in
  // `?? 1`, which is indistinguishable from "the rate really is 1". Keeping the
  // `null` is what makes `rateStatus === 'failed'` reachable at all — it is the
  // same honest observation the web executor hands the Rust core. And the quote
  // carries the code it was fetched for, so a late answer can never label
  // itself with whatever currency the sheet has moved on to.
  useEffect(() => {
    if (!visible) return;
    const forCode = fiatCode; // the currency THIS fetch is about
    let cancelled = false;
    patch({ rateStatus: 'loading' });
    resolveQuote(forCode)
      .then((quote) => {
        if (cancelled) return;
        patch(quote == null
          ? { rateQuote: null, rateStatus: 'failed' }
          : { rateQuote: quote, rateStatus: 'ok' });
      })
      .catch(() => { if (!cancelled) patch({ rateQuote: null, rateStatus: 'failed' }); });
    return () => { cancelled = true; };
  }, [visible, fiatCode]);

  // Fiat per 1 token, or 0 when it cannot be known — an unknown, invalid, or
  // other-currency rate is refused instead of silently converting. See
  // `autoPricePerToken`; the empty rate it produces is what the "Rate
  // unavailable — enter one manually" hint asks the user to fill in.
  //
  // `fiatCode` is passed as the currency being priced, which is what keeps the
  // PREVIOUS currency's rate from mirroring through a "Priced in" switch: the
  // quote's own code no longer matches, so nothing is quoted until the new
  // fetch lands. The component showed the old rate for that whole round-trip —
  // USD→CNY carried rate 1 across, and every 5000-a-row payroll line went out
  // at ~7.2x with Apply green.
  const autoRate = autoPricePerToken(token.priceUsd, rateQuote, fiatCode);

  // The rate mirrors the auto rate until the user overrides it, DERIVED rather
  // than mirrored into state by an effect: a passive effect commits a frame
  // late, and that frame is one in which `fiatCode` is already the new currency
  // while the field still holds the old one's rate — the exact state Apply must
  // never see. Significant-digit formatting; a positive rate never shows "0".
  const rateInput = rateEdited ? typedRate : autoRate > 0 ? formatRate(autoRate) : '';

  // The displayed string is the single source of the applied rate.
  const effPricePerToken = parseFloat(rateInput) || 0;

  const parsed: ParseResult = useMemo(
    () => fileParsed ?? parseRecipientTableText(rawText),
    [fileParsed, rawText],
  );

  // Build the preview: validate, de-dupe by address, and convert fiat→token.
  const preview: BatchPreviewRowView[] = useMemo(() => {
    const seen = new Set<string>();
    return parsed.rows.map((r) => {
      const address = r.address.trim();
      const valid = isAddress(address);
      const low = address.toLowerCase();
      const dup = valid && seen.has(low);
      if (valid) seen.add(low);
      const fiatNum = parseFloat(r.rawAmount) || 0;
      const tokenAmount =
        unit === 'fiat'
          ? effPricePerToken > 0
            ? fiatToTokenAmount(fiatNum, effPricePerToken, token.decimals)
            : ''
          : r.rawAmount;
      const ok = valid && !dup && parseFloat(tokenAmount) > 0;
      return { line: r.line, name: r.name, address, valid, dup, rawAmount: r.rawAmount, tokenAmount, ok };
    });
  }, [parsed, unit, effPricePerToken, token.decimals]);

  const okRows = preview.filter((r) => r.ok);
  const capped = okRows.slice(0, maxRecipients);
  const overCap = okRows.length > maxRecipients;

  const totalTokenBase = capped.reduce((s, r) => s + toBaseUnits(r.tokenAmount, token.decimals), 0n);
  const totalTokenHuman = fromBaseUnits(totalTokenBase, token.decimals);
  const totalFiat = unit === 'fiat' ? capped.reduce((s, r) => s + (parseFloat(r.rawAmount) || 0), 0) : 0;
  const balBase = toBaseUnits(token.balance || '0', token.decimals);
  const overBalance = totalTokenBase > balBase;

  const rejected = preview.length - okRows.length + parsed.errors.length;
  const canApply = capped.length > 0 && !overBalance && (unit === 'token' || effPricePerToken > 0);

  const pickFile = async () => {
    patch({ busy: true });
    try {
      const picked = await pickTable();
      if (!picked) return;
      patch({ fileName: picked.name });
      if (picked.text != null) {
        patch({ rawText: picked.text, fileParsed: null });
      } else if (picked.bytes) {
        patch({ rawText: '', fileParsed: await parseRecipientTable(picked.bytes, picked.name) });
      }
    } catch {
      showAlert(t('send.batchImportFailedTitle', { defaultValue: 'Could not read file' }), t('send.batchImportFailedBody', { defaultValue: 'Please use a CSV, TSV, TXT, or Excel file.' }));
    } finally {
      patch({ busy: false });
    }
  };

  const saveTemplate = async () => {
    try {
      await saveTextFile('vela-payroll-template.csv', TEMPLATE_CSV, 'text/csv');
      patch({ templateSaved: true });
    } catch {
      // Share sheet dismissed / unavailable — silently keep the plain label.
    }
  };

  return {
    unit,
    setUnit: (next) => patch({ unit: next }),
    fiatCode,
    // A pick in the scoped per-batch currency sheet returns the mirror to auto
    // — and the mirror has nothing to show until the new currency's fetch
    // lands, because the quote still in hand is the OLD currency's.
    setFiatCode: (code) => patch({ fiatCode: code, rateEdited: false }),
    rawText,
    // Typing clears any picked file, exactly as the paste box did inline.
    setRawText: (text) => patch({ rawText: text, fileParsed: null, fileName: null }),
    fileName,
    busy,
    pickFile: () => { void pickFile(); },
    saveTemplate: () => { void saveTemplate(); },
    templateSaved,
    priced,
    rateStatus,
    rateInput,
    setRateText: (text) => patch({ typedRate: text.replace(/[^0-9.]/g, ''), rateEdited: true }),
    rateEdited,
    resetRate: () => patch({ rateEdited: false }),
    preview,
    overCap,
    rejected,
    recipientCount: capped.length,
    totalToken: totalTokenHuman,
    totalFiat: totalFiat > 0 ? trimNum(totalFiat) : null,
    overBalance,
    canApply,
    apply: () => onApplied(capped.map((r) => ({ address: r.address, amount: r.tokenAmount, name: r.name }))),
  };
}

const RATE_SIG_DIGITS = 4;
/**
 * Rate → plain-decimal string with 4 significant digits, trailing zeros trimmed.
 * Never returns "0" for a positive rate (that string, once touched, zeroed every
 * row via parseFloat) — and the returned string IS the applied rate, so what the
 * user reads is exactly what the conversion uses.
 */
function formatRate(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const exp = Math.floor(Math.log10(n));
  const decimals = Math.min(Math.max(RATE_SIG_DIGITS - 1 - exp, 0), 18);
  const fixed = n.toFixed(decimals);
  const s = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return parseFloat(s) > 0 ? s : '';
}
