/**
 * Approval detection + the never-unlimited spending-cap editor — WEB, driven
 * by the portable Rust state machine (spec 017,
 * `rust/crates/vela-core/src/app/approval_guard.rs`).
 *
 * This file owns no rules. It builds one core session per signing request,
 * forwards taps/keystrokes as events, and PROJECTS whatever the core decided
 * into the shape the signing components render. The eight approval shapes,
 * `isUnbounded`/`isBooleanGrant`/`isReducing`/`editable`, the mode → choice
 * derivation (including "unbounded starts with no choice" and "a custom amount
 * ≥ cap derives none plus an error"), the boolean card's deliberate tap, the
 * per-leg batch gating, the increaseAllowance resulting total and the
 * confirm-time re-encode are all decided (and tested) in Rust.
 *
 * Two things stay here because they are shell concerns:
 *
 * - the **words**: `blockReason` is a semantic enum on the wire and the
 *   English sentences live below, byte-identical to the ones
 *   `services/approval-guard.ts` produces on native, so the two platforms
 *   cannot drift;
 * - the **wire codec**: the core speaks snake_case and decimal strings (JS
 *   number precision loss is exactly the bug it avoids); components speak the
 *   `DetectedApproval` shape and `bigint`.
 *
 * `useLayoutEffect`, not `useEffect`: detection used to be a synchronous
 * `useMemo`, so the sheet painted the approval surface on its very first
 * frame. A layout effect keeps that — the core's first view lands before the
 * browser paints, so no blind-transaction frame flashes underneath.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ApprovalKind, DetectedApproval } from '@/services/approval-guard';
import { createApprovalGuardSession } from '@/services/wallet-state-core/guard-session';
import type { GuardChoice } from '@/services/wallet-state-core/generated/GuardChoice';
import type { GuardDetectedApproval } from '@/services/wallet-state-core/generated/GuardDetectedApproval';
import type { GuardEditorMode } from '@/services/wallet-state-core/generated/GuardEditorMode';
import type { GuardEditorView } from '@/services/wallet-state-core/generated/GuardEditorView';
import type { GuardTokenMetaView } from '@/services/wallet-state-core/generated/GuardTokenMetaView';
import type { GuardView } from '@/services/wallet-state-core/generated/GuardView';

import type {
  ApprovalChoiceView, ApprovalEditorMode, ApprovalEditorState, ApprovalGuardController,
  ApprovalGuardInput, ApprovalGuardSurface, ApprovalLegState, ApprovalTokenMeta,
} from './approval-guard-controller-types';

const EMPTY_VIEW: GuardView = {
  surface: 'none',
  detected: null,
  meta: { symbol: '…', decimals: 18, verified: false, loading: false },
  editor: null,
  confirm_allowed: true,
  rewritten_params_json: null,
  increase_total: null,
  decimals_unverified: false,
  expired: false,
  batch: null,
};

// --- wire codec -------------------------------------------------------------

const KIND: Record<GuardDetectedApproval['kind'], ApprovalKind> = {
  erc20_approve: 'erc20-approve',
  increase_allowance: 'increaseAllowance',
  decrease_allowance: 'decreaseAllowance',
  set_approval_for_all: 'setApprovalForAll',
  erc2612_permit: 'erc2612-permit',
  dai_permit: 'dai-permit',
  permit2_single: 'permit2-single',
  permit2_batch: 'permit2-batch',
};

/**
 * The two block sentences, verbatim from `services/approval-guard.ts` (which
 * is still the native guard). The core carries the REASON; the words are the
 * shell's, on both platforms, from one place each.
 */
const BLOCK_REASON: Record<NonNullable<GuardDetectedApproval['block_reason']>, string> = {
  off_chain_permit:
    "Off-chain permit — the dApp submits its own amount on-chain, so the wallet can't cap it. To limit spending, use an on-chain approval instead.",
  dai_permit_full_balance: 'DAI permit grants full-balance access; sign as requested or reject.',
};

const MODE_TO_WIRE: Record<ApprovalEditorMode, GuardEditorMode> = {
  requested: 'requested',
  balance: 'balance',
  custom: 'custom',
  revoke: 'revoke',
  grant: 'grant',
};

function toBig(value: string | null | undefined): bigint | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function toApproval(detected: GuardDetectedApproval | null): DetectedApproval | null {
  if (!detected) return null;
  return {
    kind: KIND[detected.kind],
    tokenAddress: detected.token_address ?? undefined,
    spender: detected.spender,
    amountRaw: toBig(detected.amount_raw),
    amountBits: detected.amount_bits === 160 ? 160 : detected.amount_bits === 256 ? 256 : undefined,
    isUnbounded: detected.is_unbounded,
    isBooleanGrant: detected.is_boolean_grant,
    isReducing: detected.is_reducing,
    editable: detected.editable,
    blockReason: detected.block_reason ? BLOCK_REASON[detected.block_reason] : undefined,
    deadline: toBig(detected.deadline),
    locus:
      detected.locus.type === 'calldata_word'
        ? { type: 'calldata-word', wordIndex: detected.locus.word_index }
        : { type: 'typed-path', path: detected.locus.path },
  };
}

function toChoice(choice: GuardChoice | null): ApprovalChoiceView | null {
  if (!choice) return null;
  if (choice.type === 'amount') {
    const amountRaw = toBig(choice.amount_raw);
    return amountRaw === undefined ? null : { type: 'amount', amountRaw };
  }
  return choice.type === 'revoke' ? { type: 'revoke' } : { type: 'grant' };
}

function toMeta(meta: GuardTokenMetaView): ApprovalTokenMeta {
  return {
    symbol: meta.symbol,
    decimals: meta.decimals,
    verified: meta.verified,
    loading: meta.loading,
  };
}

function toEditor(editor: GuardEditorView | null): ApprovalEditorState | null {
  if (!editor) return null;
  return {
    mode: editor.mode,
    customText: editor.custom_text,
    error:
      editor.error === 'invalid_amount'
        ? 'invalid-amount'
        : editor.error === 'unlimited_disabled'
          ? 'unlimited-disabled'
          : null,
    choice: toChoice(editor.choice),
    displayAmountRaw: toBig(editor.display_amount_raw) ?? null,
    requestedFinite: editor.requested_finite,
    hasBalanceCap: editor.has_balance_cap,
  };
}

const SURFACE: Record<GuardView['surface'], ApprovalGuardSurface> = {
  none: 'none',
  permit_sign: 'permit-sign',
  approval_editor: 'approval-editor',
  batch: 'batch',
};

/** `u32` on the wire; a chain id outside it cannot be serialised at all. */
function asU32(value: number): number {
  return Number.isInteger(value) && value >= 0 && value <= 4_294_967_295 ? value : 0;
}

export function useApprovalGuard(input: ApprovalGuardInput): ApprovalGuardController {
  const [view, setView] = useState<GuardView>(EMPTY_VIEW);
  const session = useRef<ReturnType<typeof createApprovalGuardSession> | null>(null);

  const method = input.request?.method ?? '';
  const paramsJson = useMemo(() => {
    try {
      return JSON.stringify(input.request?.params ?? []);
    } catch {
      return '[]';
    }
  }, [input.request]);
  const chainId = input.chainId;
  const walletAddress = input.walletAddress;
  const readOnly = input.readOnly ?? false;

  useLayoutEffect(() => {
    if (!method) {
      setView(EMPTY_VIEW);
      return;
    }
    const loop = createApprovalGuardSession({
      onView: setView,
      onError: (error) => console.error('[approval-guard] core fault:', error),
    });
    session.current = loop;
    loop.start({
      type: 'approval_detected',
      method,
      params_json: paramsJson,
      chain_id: asU32(chainId),
      wallet_address: walletAddress ?? null,
      read_only: readOnly,
      // The core owns no clock; deadline classification is the shell's `now`,
      // captured once per request exactly as `Date.now()` was read inline.
      now_ms: Date.now(),
    });
    // Also covers React 19 StrictMode's development double-mount: the first
    // core is freed before the second is built.
    return () => {
      loop.dispose();
      session.current = null;
    };
  }, [method, paramsJson, chainId, walletAddress, readOnly]);

  const selectPreset = useCallback((mode: ApprovalEditorMode) => {
    session.current?.dispatch({ type: 'preset_selected', mode: MODE_TO_WIRE[mode] });
  }, []);
  const setCustomText = useCallback((text: string) => {
    session.current?.dispatch({ type: 'custom_amount_changed', text });
  }, []);
  const chooseGrant = useCallback(() => {
    session.current?.dispatch({ type: 'grant_deliberately_chosen' });
  }, []);
  const chooseRevoke = useCallback(() => {
    session.current?.dispatch({ type: 'revoke_chosen' });
  }, []);

  const selectLegPreset = useCallback((index: number, mode: ApprovalEditorMode) => {
    session.current?.dispatch({ type: 'leg_preset_selected', index, mode: MODE_TO_WIRE[mode] });
  }, []);
  const setLegCustomText = useCallback((index: number, text: string) => {
    session.current?.dispatch({ type: 'leg_custom_amount_changed', index, text });
  }, []);
  const chooseLegGrant = useCallback((index: number) => {
    session.current?.dispatch({ type: 'leg_grant_deliberately_chosen', index });
  }, []);
  const chooseLegRevoke = useCallback((index: number) => {
    session.current?.dispatch({ type: 'leg_revoke_chosen', index });
  }, []);
  const reportBatchRecipients = useCallback((recipients: string[][]) => {
    session.current?.dispatch({ type: 'batch_recipients_resolved', recipients });
  }, []);

  const projected = useMemo(() => {
    const legs: ApprovalLegState[] | null = view.batch
      ? view.batch.legs.map((leg) => ({
          to: leg.to,
          approval: toApproval(leg.approval),
          meta: toMeta(leg.meta),
          editor: toEditor(leg.editor),
          choice: toChoice(leg.choice),
          needsEditor: leg.needs_editor,
          needsChoice: leg.needs_choice,
          grantsBroad: leg.grants_broad,
        }))
      : null;
    let rewrittenParams: any[] | null = null;
    if (view.rewritten_params_json) {
      try {
        const parsed = JSON.parse(view.rewritten_params_json);
        rewrittenParams = Array.isArray(parsed) ? parsed : null;
      } catch {
        rewrittenParams = null;
      }
    }
    const increment = toBig(view.increase_total?.increment);
    return {
      surface: SURFACE[view.surface],
      approval: toApproval(view.detected),
      meta: toMeta(view.meta),
      editor: toEditor(view.editor),
      confirmAllowed: view.confirm_allowed,
      rewrittenParams,
      increaseTotal:
        view.increase_total && increment !== undefined
          ? {
              current: toBig(view.increase_total.current) ?? null,
              increment,
              total: toBig(view.increase_total.total) ?? null,
            }
          : null,
      decimalsUnverified: view.decimals_unverified,
      expired: view.expired,
      batch:
        view.batch && legs
          ? {
              legs,
              anyUncapped: view.batch.any_uncapped,
              anyToOwnToken: view.batch.any_to_own_token,
              allSettled: view.batch.all_settled,
            }
          : null,
    };
  }, [view]);

  return {
    ...projected,
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
