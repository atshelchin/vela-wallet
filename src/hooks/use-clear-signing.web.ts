/**
 * Signing-sheet parse pipeline + message adjudication — WEB, driven by the
 * portable Rust state machine (spec 017,
 * `rust/crates/vela-core/src/app/clear_signing.rs`).
 *
 * This file owns no rules. The five-level decode fallback (local descriptor →
 * contract ERC-7730 → ERC-165 disambiguation → ERC calldata fallbacks → 4-byte
 * best effort → blind), the CREATE2/raw-create deployment read, the
 * safe/normal/caution/danger grading with its partial/unverified/expired floors,
 * the "never silently assume 18 decimals" rule, the SIWE domain-binding verdict,
 * the hex-vs-text predicate, the dispatch order and the confirm semantics are
 * all decided (and tested) in Rust. The shell fetches, calls, waits — and
 * renders what the core projects.
 *
 * ONE session per mounted sheet, not a module-level singleton: the machine
 * resolves one request at a time and supersedes anything in flight, so a second
 * mounted surface sharing it would cancel the first one's resolution. Batch legs
 * get their own throwaway sessions for the same reason.
 *
 * `use-clear-signing.ts` is the native twin, on the TypeScript services.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ClearSignResult } from '@/services/clear-signing';
import { resolvedFormatKeys } from '@/services/locale-format';
import { createClearSigningSession } from '@/services/wallet-state-core/clear-session';
import { toClearLocale, toShellResult } from '@/services/wallet-state-core/clear-types';
import type { ClearSigningEvent } from '@/services/wallet-state-core/generated/ClearSigningEvent';
import type { ClearSigningView } from '@/services/wallet-state-core/generated/ClearSigningView';

import type {
  ClearCall,
  ClearSigningController,
  ClearSigningRequest,
} from './clear-signing-controller-types';

type ClearSigningSession = ReturnType<typeof createClearSigningSession>;

/**
 * The machine's own initial view, mirrored only until the session's first
 * committed view arrives. A frozen literal, never a mutable module variable —
 * render must not read state that can change under a memoized component.
 */
const INITIAL_VIEW: ClearSigningView = Object.freeze<ClearSigningView>({
  resolving: false,
  resolved: false,
  result: null,
  message: null,
  surface: 'none',
  confirm: { type: 'confirm' },
  blind_typed: null,
  danger_haptic: false,
});

const asString = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''));

/** A tx field on the wire: absent stays absent, anything else is coerced. */
const asWire = (value: unknown): string | null =>
  value == null ? null : typeof value === 'string' ? value : String(value);

/** The typed payload as the core reads it: raw text if the dApp sent text. */
function typedJson(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  try {
    // A payload that can't be serialized (cyclic) resolves blind, exactly as
    // the sheet's `JSON.parse` try/catch did for one that can't be parsed.
    return JSON.stringify(raw) ?? 'null';
  } catch {
    return 'null';
  }
}

/** The request as one event. `cleared` covers every method this machine skips. */
function toEvent(request: ClearSigningRequest | null, chainId: number): ClearSigningEvent {
  if (!request) return { type: 'cleared' };
  const { method, params } = request;
  const requestOrigin = request.requestOrigin ?? null;

  if (method === 'eth_sendTransaction' && params?.[0]) {
    const tx = params[0];
    return {
      type: 'resolve_transaction',
      to: asWire(tx.to),
      data: asWire(tx.data),
      value: asWire(tx.value),
      chain_id: chainId,
      locale: toClearLocale(resolvedFormatKeys()),
    };
  }
  if (method.includes('signTypedData') && params) {
    return {
      type: 'resolve_typed_data',
      typed_data_json: typedJson(params[1] ?? params[0]),
      chain_id: chainId,
      locale: toClearLocale(resolvedFormatKeys()),
    };
  }
  if (method === 'personal_sign' && params?.[0] !== undefined) {
    // The whole param list travels: WHICH one carries the signed bytes is the
    // core's ruling, not the shell's.
    return {
      type: 'message_presented',
      method: 'personal_sign',
      params: params.map(asString),
      request_origin: requestOrigin,
    };
  }
  if (method === 'eth_sign' && params) {
    return {
      type: 'message_presented',
      method: 'eth_sign',
      params: params.map(asString),
      request_origin: requestOrigin,
    };
  }
  return { type: 'cleared' };
}

export function useClearSigning(
  request: ClearSigningRequest | null,
  chainId: number,
): ClearSigningController {
  const [view, setView] = useState<ClearSigningView>(INITIAL_VIEW);
  const session = useRef<ClearSigningSession | null>(null);
  const started = useRef(false);

  useEffect(
    () => () => {
      session.current?.dispose();
      session.current = null;
      started.current = false;
    },
    [],
  );

  /**
   * `useLayoutEffect`, not `useEffect` — the same reason `use-approval-guard.web.ts`
   * gives, and it has to be the same or the two halves of one sheet disagree
   * about what frame they are on.
   *
   * The core answers `message_presented` synchronously and marks a transaction
   * `resolving` synchronously, so committing the first view before the browser
   * paints reproduces what the pre-core sheet had when the surface was derived
   * from props: frame one is already this request's surface. Under a passive
   * effect frame one was `INITIAL_VIEW` (`surface: 'none'`), every
   * `clear.surface` branch missed, and the sheet painted a generic
   * "Signature request" fallback card — a calm, decoration-free frame in front
   * of a request that had not been decoded yet — before swapping in the real
   * (possibly red) surface.
   *
   * The session itself outlives the request on purpose: the machine supersedes
   * whatever is in flight, and keeping it means its descriptor / ERC-165 /
   * decimals caches survive from one request to the next.
   */
  useLayoutEffect(() => {
    if (!session.current) {
      session.current = createClearSigningSession({
        onView: setView,
        onError: (error) => console.error('[clear-signing] core fault:', error),
      });
    }
    const event = toEvent(request, chainId);
    if (started.current) {
      session.current.dispatch(event);
    } else {
      started.current = true;
      session.current.start(event);
    }
  }, [request, chainId]);

  const clearSign = useMemo(
    () => (view.result ? toShellResult(view.result) : null),
    [view.result],
  );

  /**
   * One batch leg through the same pipeline, on its own session — the machine
   * supersedes any in-flight run, so N legs cannot share one.
   */
  const resolveCall = useCallback(
    (call: ClearCall, legChainId: number) =>
      new Promise<ClearSignResult | null>((resolve) => {
        let leg: ClearSigningSession | null = null;
        let settled = false;
        const finish = (result: ClearSignResult | null) => {
          if (settled) return;
          settled = true;
          resolve(result);
          // After the dispatch that produced this view has fully unwound.
          queueMicrotask(() => {
            leg?.dispose();
            leg = null;
          });
        };
        leg = createClearSigningSession({
          onView: (legView) => {
            if (!legView.resolving && legView.resolved) {
              finish(legView.result ? toShellResult(legView.result) : null);
            }
          },
          onError: (error) => {
            console.error('[clear-signing] leg fault:', error);
            finish(null);
          },
        });
        leg.start({
          type: 'resolve_transaction',
          to: asWire(call.to),
          data: asWire(call.data),
          value: asWire(call.value),
          chain_id: legChainId,
          locale: toClearLocale(resolvedFormatKeys()),
        });
      }),
    [],
  );

  return {
    resolving: view.resolving,
    clearSign,
    message: view.message,
    blindTyped: view.blind_typed,
    surface: view.surface,
    confirm: view.confirm,
    dangerHaptic: view.danger_haptic,
    resolveCall,
  };
}
