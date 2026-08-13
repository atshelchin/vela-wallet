/**
 * The fee quote — WEB, driven by the portable Rust state machine (spec 017,
 * `rust/crates/vela-core/src/app/fee_policy.rs`).
 *
 * ONE live session per fee-showing surface. That word is the whole point of
 * this file: `fee_policy` is built around a session — `SelectFeeAsset`, the 30s
 * TTL, `options[].amount`, `confirm_fee_ready` — and the four earlier attempts
 * at this integration were pulled because they drove it as a per-estimate
 * promise driver while `GasFeeCard` went on patching estimates in TypeScript.
 * The shell and the core each decided part of one number, and every review
 * found the next place they disagreed
 * (`specs/017-crux-wallet-state-complete/integration-plan.md`).
 *
 * So: everything on a surface that asks about the fee asks THIS session. The
 * Send flow's pre-confirm estimate, the Max computation, the warm-up, the chip
 * switch and the refresh affordance are all events on one machine, and the
 * number it settles on is the number that is displayed, gated and submitted.
 *
 * What the shell still owns here is I/O and arithmetic-free bookkeeping: which
 * account is deployed, which passkey builds its initCode, and the promise
 * plumbing that lets the `send` core's `EstimateFee` operation be answered by a
 * live machine instead of a one-shot call.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { accountIsDeployed, type TransactionFeeEstimate } from '@/services/safe-transaction';
import { createFeeSession, type FeeSession } from '@/services/wallet-state-core/fee-session';
import { resolveFee } from '@/services/wallet-state-core/send-types';
import type { FeeCall } from '@/services/wallet-state-core/generated/FeeCall';
import type { FeeEstimateView } from '@/services/wallet-state-core/generated/FeeEstimateView';
import type { FeeFailure } from '@/services/wallet-state-core/generated/FeeFailure';
import type { FeeView } from '@/services/wallet-state-core/generated/FeeView';

import type { FeeCardController } from './fee-card-types';

/** Both flows quote at `fast`; the tier vocabulary survives because the multiplier table is math. */
const TIER = 'fast' as const;

/** The machine's own initial view, mirrored until the session commits its first. */
const IDLE_VIEW: FeeView = {
  busy: false,
  failed: null,
  fee: null,
  stale: false,
  fee_token: null,
  options: [],
  confirm_fee_ready: false,
};

export interface FeeQuoteRequest {
  chainId: number;
  account: string;
  /**
   * The REAL calls being priced, WITHOUT the fee leg — the core appends that
   * itself, to the recipient its own quote named, so what is simulated is what
   * is submitted. An empty list asks for a transfer-sized preview.
   */
  calls: FeeCall[];
  /** `null` = native. A quote PARAMETER: it changes the operation being priced. */
  feeToken: string | null;
  /**
   * The passkey public key that builds the initCode for an undeployed Safe.
   *
   * Carried on the REQUEST rather than held by the session, so the key that
   * builds the initCode belongs to the operation being priced. The `send` core
   * loads it for the account it is sending from and states it on `EstimateFee`;
   * taking a session-level mirror instead would be a second copy of one fact,
   * and the two could disagree across an account switch.
   */
  publicKeyHex: string | undefined;
}

/**
 * How a quote request ended.
 *
 * `context_unavailable` is not a verdict about a fee — it says the shell could
 * not obtain an input the question requires (an indeterminate `eth_getCode`),
 * so the core was never asked. `estimateTransactionFee` produces the same
 * outcome today by throwing out of `isDeployed`. Guessing a deployment status
 * is the one thing that must not happen here: guessing "deployed" ships an op
 * with empty initCode for a fresh account, guessing "undeployed" attaches
 * initCode to a live one, and both are rejected at submit.
 *
 * `abandoned` is the surface moving on under an in-flight request — leaving the
 * confirm step, or switching chain.
 */
export type FeeQuoteOutcome =
  | { kind: 'ok'; estimate: FeeEstimateView }
  | { kind: 'failed'; failure: FeeFailure }
  | { kind: 'context_unavailable' }
  | { kind: 'abandoned' };

export interface FeeQuoteController extends FeeCardController {
  /**
   * The settled quote in the shape the submit paths sign
   * (`sendUserOpInBand`, `sendBatchCalls`). `resolveFee` hands back the
   * ORIGINAL object whenever this process produced it, so a Tempo estimate
   * keeps the `inBand` flag the wire does not carry.
   *
   * It is `view.fee` and nothing else: there is no second place a fee can come
   * from on web, which is the entire point of this integration.
   */
  estimate: TransactionFeeEstimate | null;
  /** Price this operation. Resolves when the quote settles. */
  requestQuote(request: FeeQuoteRequest): Promise<FeeQuoteOutcome>;
  /** Leaving the confirm step: drop the asset choice and any stale ERC-20 estimate. */
  leaveConfirm(): void;
  /** The form now targets a different chain — every earlier quote is invalid for it. */
  chainChanged(chainId: number): void;
}

export function useFeeQuote(): FeeQuoteController {
  const [view, setView] = useState<FeeView>(IDLE_VIEW);
  /**
   * `pending` covers the account-context read too, so no surface ever renders
   * "estimate failed" in the frame between deciding to quote and the machine
   * starting; `asked` distinguishes an idle machine from a failed one, which
   * both project `fee: null`.
   */
  const [pending, setPending] = useState(false);
  const [asked, setAsked] = useState(false);
  /**
   * The last request never reached the core, so the core's view is an answer to
   * a DIFFERENT question and must not be published as this one's.
   *
   * Without this the surface renders the previous request's quote: the core was
   * never told the question changed, so its own chain guard cannot help — it
   * still believes the earlier request is live. On the signing sheet that is
   * "displayed = signed" broken in the most direct way available, because
   * `confirm_fee_ready` would still be true and the approve path would sign the
   * previous operation's fee for this one.
   */
  const [contextLost, setContextLost] = useState(false);

  // The key the LIVE request carries, read by the executor at the moment the
  // core asks for a simulation. A `Requote` re-runs the same request, so it
  // rightly reuses the same key; a new request replaces it.
  const publicKeyRef = useRef<string | undefined>(undefined);

  const sessionRef = useRef<FeeSession | null>(null);
  /**
   * The request awaiting settlement. At most one: a new `QuoteRequested`
   * supersedes the previous run inside the core (it bumps `attempt`, and every
   * older result is dropped), so holding a queue here would only let this file
   * disagree with the machine about which run is live.
   */
  const pendingRef = useRef<((outcome: FeeQuoteOutcome) => void) | null>(null);
  /** Guards the await inside `requestQuote`: a slower deployment read must not dispatch. */
  const seqRef = useRef(0);
  /**
   * The last request, kept only so the retry affordance works after a failure
   * that happened BEFORE the core was asked. In every other case the core holds
   * the request context itself and `Requote` is the right event.
   */
  const lastRequestRef = useRef<FeeQuoteRequest | null>(null);
  const neverReachedCoreRef = useRef(false);
  /**
   * True only while a `QuoteRequested` dispatch is on the stack.
   *
   * `EffectLoop.start` commits the core's PRISTINE view before it dispatches
   * anything — `busy: false, fee: null, failed: null`. That view is
   * indistinguishable from "the run finished with nothing", so settling on it
   * resolved every first request as abandoned, which the `send` core reads as a
   * refused estimate and never advances to confirm. Views committed during the
   * dispatch are recorded and not judged; the request is settled once, after the
   * dispatch returns, against the view it actually produced.
   */
  const dispatchingRef = useRef(false);
  const latestViewRef = useRef<FeeView>(IDLE_VIEW);

  const settle = useCallback((outcome: FeeQuoteOutcome) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    if (resolve) setPending(false);
    resolve?.(outcome);
  }, []);

  /**
   * A settled view as the outcome it reports. Which of the three endings it is
   * comes from the SAME view the surface is rendering, so this can never report
   * something the screen disagrees with.
   */
  const settleFrom = useCallback((view: FeeView) => {
    if (!pendingRef.current || view.busy) return;
    if (view.fee) settle({ kind: 'ok', estimate: view.fee });
    else if (view.failed) settle({ kind: 'failed', failure: view.failed });
    else settle({ kind: 'abandoned' });
  }, [settle]);

  const ensureSession = useCallback((): FeeSession => {
    if (sessionRef.current) return sessionRef.current;
    const session = createFeeSession({
      onView: (next) => {
        setView(next);
        latestViewRef.current = next;
        if (!dispatchingRef.current) settleFrom(next);
      },
      onError: (error) => console.error('[fee-policy] core fault:', error),
      publicKeyHex: () => publicKeyRef.current,
    });
    sessionRef.current = session;
    return session;
  }, [settleFrom]);

  useEffect(() => () => {
    // An unmount abandons whatever was in flight; leaving a caller's promise
    // pending forever would wedge the `send` core's effect loop, which is still
    // waiting for exactly one answer to its `EstimateFee`.
    settle({ kind: 'abandoned' });
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, [settle]);

  const requestQuote = useCallback(
    async (request: FeeQuoteRequest): Promise<FeeQuoteOutcome> => {
      const seq = ++seqRef.current;
      lastRequestRef.current = request;
      publicKeyRef.current = request.publicKeyHex;
      setAsked(true);
      // Settle the previous caller BEFORE anything else: the dispatch below
      // supersedes its run inside the core, so its promise can never be
      // answered by the machine again.
      settle({ kind: 'abandoned' });
      setPending(true);

      // Deployment status decides whether the priced op carries initCode, and
      // `accountIsDeployed` throws rather than answer an indeterminate read.
      // There is no honest value to pass the core here, so the core is not
      // asked — guessing "deployed" ships an op with empty initCode for a fresh
      // account, guessing "undeployed" attaches initCode to a live one, and the
      // bundler rejects both.
      let deployed: boolean;
      try {
        deployed = await accountIsDeployed(request.account, request.chainId);
      } catch {
        if (seq === seqRef.current) {
          neverReachedCoreRef.current = true;
          setContextLost(true);
          setPending(false);
        }
        return { kind: 'context_unavailable' };
      }
      if (seq !== seqRef.current) return { kind: 'abandoned' };
      neverReachedCoreRef.current = false;
      setContextLost(false);

      const session = ensureSession();
      return new Promise<FeeQuoteOutcome>((resolve) => {
        pendingRef.current = resolve;
        const event = {
          type: 'quote_requested' as const,
          chain_id: request.chainId,
          account: request.account,
          deployed,
          public_key_available: publicKeyRef.current != null,
          tier: TIER,
          calls: request.calls,
          fee_token: request.feeToken,
        };
        dispatchingRef.current = true;
        try {
          if (sessionStarted.has(session)) session.dispatch(event);
          else { sessionStarted.add(session); session.start(event); }
        } finally {
          dispatchingRef.current = false;
        }
        // Judged once, here, against the view the dispatch produced — never
        // against the pristine one `start` publishes on its way in. A pipeline
        // that began is busy and settles later; one that refused outright
        // (no passkey for an undeployed account) is already final.
        settleFrom(latestViewRef.current);
      });
    },
    [ensureSession, settle, settleFrom],
  );

  const dispatch = useCallback(
    (event: Parameters<FeeSession['dispatch']>[0]) => {
      const session = sessionRef.current;
      // Nothing has been quoted yet, so there is nothing to select, refresh or
      // reset. Constructing a core to tell it that would only cost a wasm
      // instance on a screen that never showed a fee.
      if (!session) return;
      session.dispatch(event);
    },
    [],
  );

  const selectAsset = useCallback(
    (token: string | null) => dispatch({ type: 'select_fee_asset', token }),
    [dispatch],
  );
  const requote = useCallback(() => {
    // The core holds the request context and re-runs its own pipeline — unless
    // the last attempt never reached it, in which case `Requote` would be a
    // no-op and the retry affordance a dead button.
    if (neverReachedCoreRef.current && lastRequestRef.current) {
      void requestQuote(lastRequestRef.current);
      return;
    }
    dispatch({ type: 'requote' });
  }, [dispatch, requestQuote]);
  const leaveConfirm = useCallback(() => dispatch({ type: 'leave_confirm' }), [dispatch]);
  const chainChanged = useCallback(
    (chainId: number) => dispatch({ type: 'chain_changed', chain_id: chainId }),
    [dispatch],
  );

  // One masking point, so no consumer has to remember: a view that answers a
  // superseded question is not published at all. Every derived value below —
  // the card's rows, `confirm_fee_ready`, the estimate the submit path signs —
  // then falls to "no quote", which is the truth.
  const published = contextLost ? IDLE_VIEW : view;

  return {
    view: published,
    pending,
    asked,
    estimate: resolveFee(published.fee),
    requestQuote,
    selectAsset,
    requote,
    leaveConfirm,
    chainChanged,
  };
}

/**
 * Which sessions have had `start` called.
 *
 * The shared effect loop draws a real distinction: `start` commits the initial
 * view before dispatching, `dispatch` does not. Calling `start` twice would
 * republish a stale view over a live one. A WeakSet rather than a ref so a
 * disposed session is collectable.
 */
const sessionStarted = new WeakSet<FeeSession>();
