/**
 * useBatchImport — WEB, driven by the portable Rust state machine
 * (spec 017, `rust/crates/vela-core/src/app/batch_import.rs`).
 *
 * This file owns no rules. It builds one core session per mount, dispatches
 * `open` on every transition to visible (the machine's full per-open reset),
 * and projects the view. The table interpreter, the fiat→token math, the
 * dedupe, the cap, the balance gate and the rate mirror are decided (and
 * tested) in Rust; the shell keeps the file picker, SheetJS, the rate source,
 * haptics and all locale formatting.

 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/services/platform';
import { createBatchImportSession } from '@/services/wallet-state-core/batch-import-session';
import type { BatchImportEvent } from '@/services/wallet-state-core/generated/BatchImportEvent';
import type { BatchToken } from '@/services/wallet-state-core/generated/BatchToken';
import type { BatchView } from '@/services/wallet-state-core/generated/BatchView';
import type { APIToken } from '@/models/types';

import type {
  BatchImportController,
  BatchImportOptions,
  BatchPreviewRowView,
} from './batch-import-controller-types';

/** The machine's own not-yet-opened view — mirrored here only until the
 *  session's first committed view arrives. */
const EMPTY: BatchView = {
  opened: false,
  unit: 'fiat',
  fiat_code: '',
  raw_text: '',
  file_name: null,
  busy: false,
  file_error: false,
  template_saved: false,
  priced: false,
  rate_status: 'loading',
  rate_input: '',
  rate_edited: false,
  preview: [],
  over_cap: false,
  rejected: 0,
  recipient_count: 0,
  total_token: '0',
  total_fiat: null,
  over_balance: false,
  can_apply: false,
  recipients: [],
  applied: false,
};

/** The token facts the core needs — money crosses the wire as decimal text. */
function toBatchToken(token: APIToken): BatchToken {
  return {
    symbol: token.symbol,
    decimals: token.decimals,
    balance: token.balance || '0',
    price_usd: token.priceUsd ?? null,
  };
}

function toPreview(view: BatchView): BatchPreviewRowView[] {
  return view.preview.map((row) => ({
    line: row.line,
    name: row.name ?? undefined,
    address: row.address,
    valid: row.valid,
    dup: row.dup,
    rawAmount: row.raw_amount,
    tokenAmount: row.token_amount,
    ok: row.ok,
  }));
}

export function useBatchImport({
  visible,
  token,
  currencyCode,
  maxRecipients,
  onApplied,
}: BatchImportOptions): BatchImportController {
  const { t } = useTranslation();
  const [view, setView] = useState<BatchView>(EMPTY);
  const loop = useRef<ReturnType<typeof createBatchImportSession> | null>(null);

  // Latest-value refs: these must not re-open (and so reset) the sheet when a
  // background balance refresh replaces the token object or the language flips.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const tRef = useRef(t);
  tRef.current = t;
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;
  const recipientsRef = useRef(view.recipients);
  recipientsRef.current = view.recipients;

  // One core per mount. Also covers React 19 StrictMode's development
  // double-mount: the first core is freed before the second is built.
  useEffect(() => {
    const session = createBatchImportSession({
      onView: setView,
      onError: (error) => console.error('[batch-import] core fault:', error),
    });
    loop.current = session;
    return () => {
      loop.current = null;
      session.dispose();
    };
  }, []);

  // Every open is a FULL reset in the core (and bumps the attempt, so an
  // in-flight rate from a previous open can never label this one).
  useEffect(() => {
    if (!visible) return;
    loop.current?.dispatch({
      type: 'open',
      token: toBatchToken(tokenRef.current),
      currency_code: currencyCode,
      max_recipients: maxRecipients,
    });
  }, [visible, currencyCode, maxRecipients]);

  // A file the picker could not read — today's alert, once per failed pick
  // (the flag is cleared by the next pick request).
  useEffect(() => {
    if (!view.file_error) return;
    showAlert(tRef.current('send.batchImportFailedTitle', { defaultValue: 'Could not read file' }), tRef.current('send.batchImportFailedBody', { defaultValue: 'Please use a CSV, TSV, TXT, or Excel file.' }));
  }, [view.file_error]);

  // `applied` flips once per successful apply; the drafts are already capped
  // and converted.
  useEffect(() => {
    if (!view.applied) return;
    onAppliedRef.current(
      recipientsRef.current.map((r) => ({ address: r.address, amount: r.amount, name: r.name ?? undefined })),
    );
  }, [view.applied]);

  const dispatch = (event: BatchImportEvent) => loop.current?.dispatch(event);

  return {
    unit: view.unit,
    setUnit: (unit) => dispatch({ type: 'set_unit', unit }),
    fiatCode: view.fiat_code,
    setFiatCode: (code) => dispatch({ type: 'set_fiat_code', code }),
    rawText: view.raw_text,
    setRawText: (text) => dispatch({ type: 'set_raw_text', text }),
    fileName: view.file_name,
    busy: view.busy,
    pickFile: () => dispatch({ type: 'pick_file_requested' }),
    saveTemplate: () => dispatch({ type: 'save_template_requested' }),
    templateSaved: view.template_saved,
    priced: view.priced,
    rateStatus: view.rate_status,
    rateInput: view.rate_input,
    // The dot-normalization (`parseLocaleNumber`) happens in the component,
    // BEFORE the event: the core applies only the `[^0-9.]` strip.
    setRateText: (text) => dispatch({ type: 'edit_rate', text }),
    rateEdited: view.rate_edited,
    resetRate: () => dispatch({ type: 'reset_rate_to_auto' }),
    preview: toPreview(view),
    overCap: view.over_cap,
    rejected: view.rejected,
    recipientCount: view.recipient_count,
    totalToken: view.total_token,
    totalFiat: view.total_fiat,
    overBalance: view.over_balance,
    canApply: view.can_apply,
    apply: () => dispatch({ type: 'apply' }),
  };
}
