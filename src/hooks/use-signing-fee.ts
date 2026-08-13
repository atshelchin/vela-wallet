/**
 * The signing sheet's fee half — WEB, driven by the portable Rust state machine
 * (spec 017, `rust/crates/vela-core/src/app/fee_policy.rs`).
 *
 * This file owns no rules. The two `estimateTransactionFee` calls it replaces
 * (`SigningSheet.tsx:280` for a contract call, `:370` for a `wallet_sendCalls`
 * batch) each produced a fee the card then went on to patch locally; both are
 * now one `QuoteRequested` on one live session, and the number that comes back
 * is the number the sheet displays, gates on and submits.
 *
 * The confirm gate is the core's `confirm_fee_ready` rather than the three
 * flags the sheet used to combine. That is a real change and a deliberate one:
 * the TypeScript expression gated a contract call on "estimating or failed" but
 * a BATCH only on "re-quoting", so a batch could arm its slider over a fee that
 * had not settled. `fee_policy` publishes one gate for both
 * (invariant ⑦), and the machine is where that judgement belongs.

 */

import { useEffect } from 'react';

import { useFeeQuote } from './use-fee-quote';
import type { SigningFeeController, SigningFeeInput } from './signing-fee-controller-types';
import type { FeeCall } from '@/services/wallet-state-core/generated/FeeCall';

/**
 * A shell call onto the core's wire. `value` is hex from the dApp and decimal
 * on the wire; `data` stays 0x-hex. Getting this backwards does not fail
 * loudly — it prices a different operation than the one being signed.
 */
function toCoreCall(call: { to: string; value?: string; data?: string }): FeeCall {
  let value = '0';
  try {
    value = BigInt(call.value ?? '0').toString();
  } catch {
    // A malformed value is not a number this wallet will sign; pricing it as
    // zero keeps the quote honest about the gas and lets the submit path
    // refuse the call on its own terms, exactly as `toShellCall` does.
    value = '0';
  }
  return { to: call.to, value, data: call.data && call.data !== '0x' ? call.data : '0x' };
}

export function useSigningFee(input: SigningFeeInput): SigningFeeController {
  const {
    tx, batchCalls, chainId, account, publicKeyHex, publicKeyLoaded, readOnly, requestKey,
  } = input;

  const fee = useFeeQuote();
  const { requestQuote } = fee;

  const useBatch = batchCalls !== null && batchCalls.length > 0;
  const costsGas = useBatch || tx !== null;
  /**
   * The effect's own precondition, named once and reused by the gate below.
   *
   * A fee that is never requested must not block confirm — a read-only replay
   * has no fee and is not about to send one, and gating it would be a guard
   * that traps the user rather than one that protects them. The old expression
   * gated on `estimatingGas`/`gasEstimateFailed`, both of which stay false when
   * no estimate is made, so this reproduces that and does not widen it.
   */
  const willQuote = costsGas && !!account && !readOnly && publicKeyLoaded;

  useEffect(() => {
    if (requestKey === null || !willQuote || !account) return;
    // The fee token is a QUOTE PARAMETER, and a new request starts back at
    // native — the same reset `SigningSheet.tsx:271` did, expressed as the
    // parameter it always was rather than as a `setState` beside the estimate.
    void requestQuote({
      chainId,
      account,
      calls: useBatch ? batchCalls.map(toCoreCall) : tx ? [toCoreCall(tx)] : [],
      feeToken: null,
      publicKeyHex,
    });
    // `requestKey` carries the CALLS, so it changes whenever what is priced
    // changes; `tx`/`batchCalls` are derived from the same request object and
    // listing them too would only add identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, chainId, account, publicKeyHex, willQuote, requestQuote]);

  const { view, pending, asked } = fee;
  return {
    cardProps: {
      safeAddress: account ?? '',
      chainId,
      controller: fee,
    },
    estimate: fee.estimate,
    feeToken: view.fee_token,
    // The core's single gate, widened over the account-context read that
    // precedes the dispatch so the slider cannot arm in the frame before the
    // machine starts.
    blocksConfirm: willQuote && (pending || !view.confirm_fee_ready),
    failed: asked && !pending && !view.busy && (view.failed != null || view.fee === null),
  };
}
