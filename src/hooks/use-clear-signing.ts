/**
 * Signing-sheet parse pipeline + message adjudication — NATIVE controller.
 *
 * A thin wrapper over `services/clear-signing.ts`, `siwe.ts` and
 * `decode-sign-message.ts`, which stay the mobile implementation: Hermes has no
 * WebAssembly, so the Rust machine cannot run here (FR-202). Every call and
 * every branch below is the one `SigningSheet.tsx` made inline before this hook
 * existed, so iOS/Android behaviour is unchanged.
 *
 * Two exceptions, both of which REMOVE a contradiction the sheet had with
 * itself, and both of which land identically on web (that is the point — the
 * two platforms must not disagree about a phishing verdict):
 *
 * 1. `nonPrintable` now comes from the canonical decode verdict
 *    (`decodeSignMessage`), not from `MessageSignView`'s second, ASCII-only
 *    regex. That regex flagged every message containing CJK or an emoji as
 *    "possibly a transaction in disguise" while the very same message rendered
 *    as perfectly readable text — a false alarm on a security surface, which
 *    teaches users to ignore the real one.
 * 2. The SIWE domain binding is adjudicated ONCE. It used to be computed
 *    separately for the warning haptic and for the red banner, so a change to
 *    either could make the buzz and the banner disagree.
 *
 * `use-clear-signing.web.ts` is the web twin, driven by the `clear_signing`
 * core, where the same two rules are the core's own.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  resolveTransaction,
  resolveTypedData,
  type ClearSignResult,
} from '@/services/clear-signing';
import { adjudicateMessage, projectBlindTyped } from '@/services/clear-signing-adjudication';

import type {
  ClearCall,
  ClearConfirm,
  ClearSigningController,
  ClearSigningRequest,
  ClearSurface,
} from './clear-signing-controller-types';

// ---------------------------------------------------------------------------
// Method classification — the sheet's own `method.includes(...)` tests
// ---------------------------------------------------------------------------

type Kind = 'none' | 'tx-plain' | 'tx-call' | 'typed' | 'personal_sign' | 'eth_sign';

function kindOf(request: ClearSigningRequest | null): Kind {
  if (!request) return 'none';
  const { method, params } = request;
  if (method === 'eth_sendTransaction' && params?.[0]) {
    const data = params[0].data;
    return !data || data === '0x' ? 'tx-plain' : 'tx-call';
  }
  if (method.includes('signTypedData') && params) return 'typed';
  if (method === 'personal_sign' && params?.[0] !== undefined) return 'personal_sign';
  if (method === 'eth_sign' && params) return 'eth_sign';
  return 'none';
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function useClearSigning(
  request: ClearSigningRequest | null,
  chainId: number,
): ClearSigningController {
  const kind = kindOf(request);
  const [clearSign, setClearSign] = useState<ClearSignResult | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!request) {
      setClearSign(null);
      setResolving(false);
      return;
    }
    const { method, params } = request;
    if (method === 'eth_sendTransaction' && params?.[0]) {
      setResolving(true);
      resolveTransaction(params[0].to, params[0].data, params[0].value, chainId)
        .then(setClearSign)
        .catch(() => setClearSign(null))
        .finally(() => setResolving(false));
      return;
    }
    if (method.includes('signTypedData') && params) {
      setResolving(true);
      const typedDataRaw = params[1] ?? params[0];
      try {
        const typedData = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;
        resolveTypedData(typedData, chainId)
          .then(setClearSign)
          .catch(() => setClearSign(null))
          .finally(() => setResolving(false));
      } catch {
        // Untrusted JSON that doesn't parse resolves blind.
        setClearSign(null);
        setResolving(false);
      }
      return;
    }
    setClearSign(null);
  }, [request, chainId]);

  const message = useMemo(
    () =>
      request && (kind === 'personal_sign' || kind === 'eth_sign')
        ? adjudicateMessage(kind, request.params ?? [], request.requestOrigin)
        : null,
    [request, kind],
  );
  const blindTyped = useMemo(() => {
    if (!request || kind !== 'typed') return null;
    const params = request.params ?? [];
    return projectBlindTyped(params[1] ?? params[0]);
  }, [request, kind]);

  const resolveCall = useCallback(
    (call: ClearCall, legChainId: number) =>
      // `to` is absent only for a raw contract-creation leg, which the resolver
      // reads as a deployment (never as a call to the zero address).
      resolveTransaction(call.to as string, call.data, call.value, legChainId).catch(() => null),
    [],
  );

  return {
    resolving,
    clearSign,
    message,
    blindTyped,
    surface: deriveSurface(kind, resolving, clearSign),
    confirm: deriveConfirm(kind, clearSign),
    dangerHaptic:
      message?.danger_class === 'eth_sign' || message?.danger_class === 'siwe_phish',
    resolveCall,
  };
}

/**
 * Which surface renders. Resolution ALWAYS outranks a blind surface — the sheet
 * must never flash a red "Unknown" that a descriptor is about to replace.
 */
function deriveSurface(kind: Kind, resolving: boolean, clearSign: ClearSignResult | null): ClearSurface {
  if (resolving) return 'loading';
  switch (kind) {
    case 'none':
      return 'none';
    case 'eth_sign':
      return 'eth_sign';
    case 'personal_sign':
      return 'message_sign';
    case 'tx-plain':
    case 'tx-call':
      return clearSign ? 'clear_sign' : 'blind_transaction';
    case 'typed':
      return clearSign ? 'clear_sign' : 'blind_typed_data';
  }
}

/** Confirm-button semantics, in the order `buttonLabel()` reads them. */
function deriveConfirm(kind: Kind, clearSign: ClearSignResult | null): ClearConfirm {
  if (clearSign) {
    return clearSign.type === 'signature'
      ? { type: 'sign' }
      : { type: 'confirm_intent', intent: clearSign.intent };
  }
  switch (kind) {
    case 'personal_sign':
    case 'typed':
      return { type: 'sign' };
    // A plain native send reads "Confirm Send", matching its own eyebrow.
    case 'tx-plain':
      return { type: 'confirm_intent', intent: 'send' };
    // Blind contract call, eth_sign, nothing presented: a neutral "Confirm",
    // never "Approve" — that verb belongs only to an actual token approval.
    case 'tx-call':
    case 'eth_sign':
    case 'none':
      return { type: 'confirm' };
  }
}
