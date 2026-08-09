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
 * every row).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAddress } from '@/models/types';
import { getRate } from '@/services/currency';
import { toBaseUnits, fromBaseUnits } from '@/services/eip681';
import { fiatToTokenAmount, tokenPriceInFiat } from '@/services/fiat-convert';
import { pickTable, saveTextFile } from '@/services/file-io';
import { showAlert } from '@/services/platform';
import { parseRecipientTableText, parseRecipientTable, type ParseResult } from '@/services/recipient-table';

import {
  trimNum,
  type BatchImportController,
  type BatchImportOptions,
  type BatchPreviewRowView,
  type BatchRateStatusKey,
  type BatchUnitKey,
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

  const [unit, setUnit] = useState<BatchUnitKey>(priced ? 'fiat' : 'token');
  const [fiatCode, setFiatCode] = useState(currencyCode);
  const [rawText, setRawText] = useState('');
  const [fileParsed, setFileParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [usdFiatRate, setUsdFiatRate] = useState<number | null>(null);
  const [rateStatus, setRateStatus] = useState<BatchRateStatusKey>('loading');
  const [rateInput, setRateInput] = useState('');
  const [rateEdited, setRateEdited] = useState(false);

  // Reset per-open so the sheet never reopens with a stale paste/rate.
  useEffect(() => {
    if (!visible) return;
    setUnit(priced ? 'fiat' : 'token');
    setFiatCode(currencyCode);
    setRawText('');
    setFileParsed(null);
    setFileName(null);
    setTemplateSaved(false);
    setRateEdited(false);
  }, [visible, priced, currencyCode]);

  // USD→fiat rate for the chosen currency (auto rate). Re-fetch when it changes;
  // status drives the loading/failure hints so a dead "0" is never unexplained.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setRateStatus('loading');
    getRate(fiatCode)
      .then((r) => { if (!cancelled) { setUsdFiatRate(r); setRateStatus('ok'); } })
      .catch(() => { if (!cancelled) { setUsdFiatRate(null); setRateStatus('failed'); } });
    return () => { cancelled = true; };
  }, [visible, fiatCode]);

  const autoPricePerToken = tokenPriceInFiat(token.priceUsd, usdFiatRate ?? 0); // fiat per 1 token
  // Keep the editable rate field mirroring the auto rate until the user overrides
  // it. Significant-digit formatting: a positive rate never mirrors as "0".
  useEffect(() => {
    if (rateEdited) return;
    setRateInput(autoPricePerToken > 0 ? formatRate(autoPricePerToken) : '');
  }, [autoPricePerToken, rateEdited]);

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
    setBusy(true);
    try {
      const picked = await pickTable();
      if (!picked) return;
      setFileName(picked.name);
      if (picked.text != null) {
        setRawText(picked.text);
        setFileParsed(null);
      } else if (picked.bytes) {
        setRawText('');
        setFileParsed(await parseRecipientTable(picked.bytes, picked.name));
      }
    } catch {
      showAlert(t('send.batchImportFailedTitle', { defaultValue: 'Could not read file' }), t('send.batchImportFailedBody', { defaultValue: 'Please use a CSV, TSV, TXT, or Excel file.' }));
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    try {
      await saveTextFile('vela-payroll-template.csv', TEMPLATE_CSV, 'text/csv');
      setTemplateSaved(true);
    } catch {
      // Share sheet dismissed / unavailable — silently keep the plain label.
    }
  };

  return {
    unit,
    setUnit,
    fiatCode,
    // A pick in the scoped per-batch currency sheet returns the mirror to auto.
    setFiatCode: (code) => { setFiatCode(code); setRateEdited(false); },
    rawText,
    // Typing clears any picked file, exactly as the paste box did inline.
    setRawText: (text) => { setRawText(text); setFileParsed(null); setFileName(null); },
    fileName,
    busy,
    pickFile: () => { void pickFile(); },
    saveTemplate: () => { void saveTemplate(); },
    templateSaved,
    priced,
    rateStatus,
    rateInput,
    setRateText: (text) => { setRateInput(text.replace(/[^0-9.]/g, '')); setRateEdited(true); },
    rateEdited,
    resetRate: () => setRateEdited(false),
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
