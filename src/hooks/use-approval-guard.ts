/**
 * Approval detection + the never-unlimited spending-cap editor — NATIVE.
 *
 * Hermes has no WebAssembly, so iOS/Android cannot run the `approval_guard`
 * Rust machine; this is the TypeScript twin of `use-approval-guard.web.ts`,
 * built on the same `services/approval-guard` primitives the native submit
 * guard already uses. It exists so the signing COMPONENTS are identical on
 * both platforms: they render one controller shape and decide nothing.
 *
 * Every rule below is a line-for-line port of what the components used to do
 * inline — `SigningSheet`'s metadata/batch effects, `ApprovalView`'s allowance
 * and balance reads, `EditableApproveCard`'s mode → choice derivation and its
 * "a grant-all preselects nothing" rule, `BatchCallsView`'s per-leg gating —
 * so native behaviour is unchanged by the migration. The Rust machine
 * (`rust/crates/vela-core/src/app/approval_guard.rs`) is the specification of
 * record; `rust/crates/vela-core/tests/app_approval_guard.rs` and
 * `src/__tests__/services/approval-guard-parity.test.ts` pin the two together.
 *
 * Editor text is stored CANONICAL (ASCII digits, '.' decimal): the card
 * localizes it for display and hands back `parseLocaleNumber`'d text, exactly
 * as the core's contract requires, so the two platforms parse identically.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BLEIncomingRequest } from '@/models/types';
import {
  detectApproval, rewriteApprovalParams,
  type ApprovalChoice,
} from '@/services/approval-guard';
import {
  applyPreset, deriveEditor, fallbackMeta, initEditor, legGrantsBroad, legNeedsChoice,
  legShowsEditor, IDLE_META, LOADING_META,
  type EditorSlot,
} from '@/services/approval-guard-editor';
import { resolveTokenMetadata } from '@/services/token-metadata';
import { readErc20Allowance, readErc20Balance } from '@/services/token-reads';

import type {
  ApprovalBatchState, ApprovalChoiceView, ApprovalEditorMode,
  ApprovalGuardController, ApprovalGuardInput, ApprovalGuardSurface, ApprovalIncreaseTotal,
  ApprovalLegState, ApprovalTokenMeta,
} from './approval-guard-controller-types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------


function toServiceChoice(choice: ApprovalChoiceView): ApprovalChoice {
  return choice.type === 'amount' ? { type: 'amount', amountRaw: choice.amountRaw } : { type: choice.type };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type MetaMap = Map<string, ApprovalTokenMeta>;

export function useApprovalGuard(input: ApprovalGuardInput): ApprovalGuardController {
  const request: BLEIncomingRequest | null = input.request ?? null;
  const { chainId, walletAddress } = input;
  const readOnly = input.readOnly ?? false;
  const method = request?.method ?? '';
  const params = request?.params;

  // A request's identity for every reset below. `id` alone is not enough: the
  // harness replays scenarios that reuse it.
  const requestKey = useMemo(() => {
    try {
      return `${request?.id ?? ''}|${method}|${JSON.stringify(params ?? [])}|${chainId}|${readOnly}`;
    } catch {
      return `${request?.id ?? ''}|${method}|${chainId}|${readOnly}`;
    }
  }, [request?.id, method, params, chainId, readOnly]);

  const approval = useMemo(
    () => (request ? detectApproval(request.method, request.params) : null),
    [request],
  );

  const calls: any[] | null = useMemo(() => {
    if (method !== 'wallet_sendCalls') return null;
    const raw = params?.[0]?.calls;
    return Array.isArray(raw) && raw.length > 0 ? raw : null;
  }, [method, params]);

  const legApprovals = useMemo(
    () =>
      calls
        ? calls.map((c: any) => detectApproval('eth_sendTransaction', [{ to: c.to, data: c.data, value: c.value }]))
        : null,
    [calls],
  );

  // --- reads ---------------------------------------------------------------

  const [meta, setMeta] = useState<{ key: string; value: ApprovalTokenMeta } | null>(null);
  useEffect(() => {
    const token = approval?.tokenAddress;
    if (!token) return;
    let cancelled = false;
    const fallback = fallbackMeta(token);
    resolveTokenMetadata(chainId, [token])
      .then((map) => {
        if (cancelled) return;
        const m = map.get(token.toLowerCase());
        setMeta({
          key: requestKey,
          value: m
            ? { symbol: m.symbol, decimals: m.decimals, verified: true, loading: false }
            : fallback,
        });
      })
      .catch(() => { if (!cancelled) setMeta({ key: requestKey, value: fallback }); });
    return () => { cancelled = true; };
  }, [approval?.tokenAddress, chainId, requestKey]);

  const [allowance, setAllowance] = useState<{ key: string; value: bigint | null } | null>(null);
  useEffect(() => {
    if (approval?.kind !== 'increaseAllowance' || !walletAddress || !approval.tokenAddress) return;
    let cancelled = false;
    readErc20Allowance(chainId, approval.tokenAddress, walletAddress, approval.spender)
      .then((a) => { if (!cancelled) setAllowance({ key: requestKey, value: a }); })
      .catch(() => { if (!cancelled) setAllowance({ key: requestKey, value: null }); });
    return () => { cancelled = true; };
  }, [approval?.kind, approval?.tokenAddress, approval?.spender, walletAddress, chainId, requestKey]);

  const [balance, setBalance] = useState<{ key: string; value: bigint | null } | null>(null);
  useEffect(() => {
    // Fires for every calldata approval except NFT grants — including
    // decreaseAllowance, where the preset is then suppressed.
    if (!approval?.tokenAddress || !walletAddress) return;
    if (approval.locus.type !== 'calldata-word' || approval.kind === 'setApprovalForAll') return;
    let cancelled = false;
    readErc20Balance(chainId, approval.tokenAddress, walletAddress)
      .then((b) => { if (!cancelled) setBalance({ key: requestKey, value: b }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [approval?.tokenAddress, approval?.kind, approval?.locus.type, walletAddress, chainId, requestKey]);

  const [batchMeta, setBatchMeta] = useState<{ key: string; value: MetaMap } | null>(null);
  const batchTokens = useMemo(
    () =>
      legApprovals
        ? Array.from(new Set(legApprovals.map((a) => a?.tokenAddress?.toLowerCase()).filter(Boolean) as string[]))
        : [],
    [legApprovals],
  );
  const batchTokensKey = batchTokens.join(',');
  useEffect(() => {
    if (batchTokens.length === 0) return;
    let cancelled = false;
    resolveTokenMetadata(chainId, batchTokens)
      .then((map) => {
        if (cancelled) return;
        const out: MetaMap = new Map();
        for (const tk of batchTokens) {
          const m = map.get(tk);
          out.set(tk, m
            ? { symbol: m.symbol, decimals: m.decimals, verified: true, loading: false }
            : fallbackMeta(tk));
        }
        setBatchMeta({ key: requestKey, value: out });
      })
      // The WHOLE read failing leaves an empty map: legs render …/18/unverified.
      .catch(() => { if (!cancelled) setBatchMeta({ key: requestKey, value: new Map() }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchTokensKey, chainId, requestKey]);

  const [recipients, setRecipients] = useState<{ key: string; value: string[][] } | null>(null);
  const reportBatchRecipients = useCallback(
    (value: string[][]) => setRecipients({ key: requestKey, value }),
    [requestKey],
  );

  // --- editor state --------------------------------------------------------
  //
  // Only OVERRIDES are stored. The mount state is derived from the detection,
  // so a new request needs no reset effect (and can never render one frame of
  // the previous request's choice).
  const [edits, setEdits] = useState<{
    key: string;
    single: EditorSlot | undefined;
    legs: Record<number, EditorSlot>;
  }>({ key: '', single: undefined, legs: {} });

  const liveEdits = edits.key === requestKey ? edits : null;

  const effectiveMeta: ApprovalTokenMeta = approval?.tokenAddress
    ? (meta && meta.key === requestKey ? meta.value : LOADING_META)
    : IDLE_META;
  const effectiveBalance = balance && balance.key === requestKey ? balance.value : null;

  const singleSlot: EditorSlot =
    liveEdits && liveEdits.single !== undefined ? liveEdits.single : initEditor(approval);

  const editor = useMemo(
    () => (approval ? deriveEditor(singleSlot, approval, effectiveMeta, effectiveBalance) : null),
    [singleSlot, approval, effectiveMeta, effectiveBalance],
  );

  const mutateSingle = useCallback((next: (slot: EditorSlot) => EditorSlot) => {
    setEdits((prev) => {
      const base = prev.key === requestKey ? prev : { key: requestKey, single: undefined, legs: {} };
      const current = base.single !== undefined ? base.single : initEditor(approval);
      return { ...base, key: requestKey, single: next(current) };
    });
  }, [requestKey, approval]);

  const mutateLeg = useCallback((index: number, next: (slot: EditorSlot) => EditorSlot) => {
    setEdits((prev) => {
      const base = prev.key === requestKey ? prev : { key: requestKey, single: undefined, legs: {} };
      const detected = legApprovals?.[index] ?? null;
      const current = base.legs[index] !== undefined
        ? base.legs[index]
        : (legShowsEditor(!readOnly, detected) ? initEditor(detected) : null);
      return { ...base, key: requestKey, legs: { ...base.legs, [index]: next(current) } };
    });
  }, [requestKey, legApprovals, readOnly]);

  const selectPreset = useCallback((mode: ApprovalEditorMode) => {
    if (!approval) return;
    mutateSingle((slot) => applyPreset(slot, approval, effectiveMeta, effectiveBalance, mode));
  }, [approval, effectiveMeta, effectiveBalance, mutateSingle]);
  const setCustomText = useCallback((text: string) => {
    mutateSingle((slot) => (slot?.kind === 'amount' ? { ...slot, customText: text } : slot));
  }, [mutateSingle]);
  const chooseGrant = useCallback(() => {
    mutateSingle((slot) => (slot?.kind === 'boolean' ? { ...slot, selected: 'grant' } : slot));
  }, [mutateSingle]);
  const chooseRevoke = useCallback(() => {
    mutateSingle((slot) => (slot?.kind === 'boolean' ? { ...slot, selected: 'revoke' } : slot));
  }, [mutateSingle]);

  // --- batch projection ----------------------------------------------------

  const effectiveBatchMeta: MetaMap | null =
    batchMeta && batchMeta.key === requestKey ? batchMeta.value : null;

  const batch: ApprovalBatchState | null = useMemo(() => {
    if (!calls || !legApprovals) return null;
    const editable = !readOnly;
    const legs: ApprovalLegState[] = calls.map((call: any, i: number) => {
      const ap = legApprovals[i];
      const token = ap?.tokenAddress?.toLowerCase();
      const resolved = token ? effectiveBatchMeta?.get(token) : undefined;
      const legMeta: ApprovalTokenMeta =
        resolved ?? (batchTokens.length > 0 && !effectiveBatchMeta ? LOADING_META : IDLE_META);
      const stored = liveEdits?.legs[i];
      const slot: EditorSlot = stored !== undefined
        ? stored
        : (legShowsEditor(editable, ap) ? initEditor(ap) : null);
      // A leg card carries no balance, so it never offers the Balance chip.
      const legEditor = ap ? deriveEditor(slot, ap, legMeta, null) : null;
      const choice = legEditor?.choice ?? null;
      return {
        to: call?.to ?? '',
        approval: ap,
        meta: legMeta,
        editor: legEditor,
        choice,
        needsEditor: legShowsEditor(editable, ap),
        needsChoice: legNeedsChoice(ap, choice),
        grantsBroad: legGrantsBroad(ap, choice),
      };
    });
    const rows = recipients && recipients.key === requestKey ? recipients.value : [];
    return {
      legs,
      anyUncapped: editable
        ? legs.some((leg) => leg.grantsBroad)
        : legs.some((leg) => leg.approval?.isUnbounded && !leg.approval.isReducing && !leg.approval.isBooleanGrant),
      anyToOwnToken: legs.some((leg, i) => {
        const to = leg.to?.toLowerCase();
        return !!to && (rows[i] ?? []).some((r) => r?.toLowerCase() === to);
      }),
      allSettled: !legs.some((leg) => leg.needsChoice),
    };
  }, [calls, legApprovals, readOnly, effectiveBatchMeta, batchTokens.length, liveEdits, recipients, requestKey]);

  const selectLegPreset = useCallback((index: number, mode: ApprovalEditorMode) => {
    const ap = legApprovals?.[index];
    if (!ap) return;
    const legMeta = batch?.legs[index]?.meta ?? IDLE_META;
    mutateLeg(index, (slot) => applyPreset(slot, ap, legMeta, null, mode));
  }, [legApprovals, batch, mutateLeg]);
  const setLegCustomText = useCallback((index: number, text: string) => {
    mutateLeg(index, (slot) => (slot?.kind === 'amount' ? { ...slot, customText: text } : slot));
  }, [mutateLeg]);
  const chooseLegGrant = useCallback((index: number) => {
    mutateLeg(index, (slot) => (slot?.kind === 'boolean' ? { ...slot, selected: 'grant' } : slot));
  }, [mutateLeg]);
  const chooseLegRevoke = useCallback((index: number) => {
    mutateLeg(index, (slot) => (slot?.kind === 'boolean' ? { ...slot, selected: 'revoke' } : slot));
  }, [mutateLeg]);

  // --- verdicts ------------------------------------------------------------

  const surface: ApprovalGuardSurface = batch
    ? 'batch'
    : !approval
      ? 'none'
      : approval.locus.type === 'typed-path'
        ? 'permit-sign'
        : 'approval-editor';

  const choice = editor?.choice ?? null;

  const increaseTotal: ApprovalIncreaseTotal | null = useMemo(() => {
    if (approval?.kind !== 'increaseAllowance') return null;
    // The row appears only once the read RESOLVED (either way).
    if (!allowance || allowance.key !== requestKey) return null;
    if (choice?.type === 'revoke') return { current: null, increment: 0n, total: 0n };
    const increment = choice?.type === 'amount' ? choice.amountRaw : (approval.amountRaw ?? 0n);
    return allowance.value !== null
      ? { current: allowance.value, increment, total: allowance.value + increment }
      : { current: null, increment, total: null };
  }, [approval, allowance, requestKey, choice]);

  const rewrittenParams = useMemo(() => {
    if (batch) {
      if (!Array.isArray(params?.[0]?.calls)) return null;
      let changed = false;
      const newCalls = params[0].calls.map((c: any, i: number) => {
        const leg = batch.legs[i];
        if (leg?.approval?.editable && leg.choice) {
          try {
            const [rw] = rewriteApprovalParams(
              'eth_sendTransaction',
              [{ to: c.to, data: c.data, value: c.value }],
              leg.approval,
              toServiceChoice(leg.choice),
            );
            changed = true;
            return { ...c, data: rw.data };
          } catch { return c; }
        }
        return c;
      });
      return changed ? [{ ...params[0], calls: newCalls }, ...params.slice(1)] : null;
    }
    if (!approval?.editable || !choice || !params) return null;
    // Fail CLOSED: a rewrite error leaves params untouched for the submit
    // guard to refuse.
    try {
      return rewriteApprovalParams(method, params, approval, toServiceChoice(choice));
    } catch {
      return null;
    }
  }, [batch, approval, choice, method, params]);

  const deadlineSec = approval?.deadline ? Number(approval.deadline) : 0;
  const expired = deadlineSec > 0 && deadlineSec < Math.floor(Date.now() / 1000);

  // Unverified decimals are flagged on the amount editor always, and on the
  // permit surface only for a bounded amount; the boolean card scales no
  // amount, so it has no warning to show.
  const decimalsUnverified =
    surface === 'approval-editor'
      ? singleSlot?.kind === 'amount' && !effectiveMeta.verified
      : surface === 'permit-sign'
        ? !!approval && !approval.isBooleanGrant && !approval.isUnbounded && !effectiveMeta.verified
        : false;

  return {
    surface,
    approval: batch ? null : approval,
    meta: batch ? { ...IDLE_META, loading: batchTokens.length > 0 && !effectiveBatchMeta } : effectiveMeta,
    editor,
    confirmAllowed: batch ? batch.allSettled : !(!!approval?.editable && !choice),
    rewrittenParams,
    increaseTotal,
    decimalsUnverified,
    expired: batch ? false : expired,
    batch,
    selectPreset,
    setCustomText,
    chooseGrant,
    chooseRevoke,
    selectLegPreset,
    setLegCustomText,
    chooseLegGrant,
    chooseLegRevoke,
    reportBatchRecipients,
  };
}
