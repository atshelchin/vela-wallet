/**
 * The signing sheet's fee half — NATIVE (and the shared TypeScript
 * implementation the mobile app keeps).
 *
 * Extracted verbatim from `SigningSheet.tsx`'s request effect (spec 017): the
 * `eth_sendTransaction` estimate against the REAL tx, the `wallet_sendCalls`
 * estimate against the whole MultiSend, the native-asset reset on a new
 * request, and the three flags the confirm gate reads. Nothing about it
 * changed; it moved so the web twin could replace it wholesale.
 *
 * Hermes has no WebAssembly, so this stays the mobile path. `use-signing-fee.web.ts`
 * drives the Rust `fee_policy` machine instead; both expose
 * `SigningFeeController`.
 */

import { useCallback, useEffect, useState } from 'react';

import { estimateTransactionFee, type TransactionFeeEstimate } from '@/services/safe-transaction';
import type { SigningFeeController, SigningFeeInput } from './signing-fee-controller-types';

export function useSigningFee(input: SigningFeeInput): SigningFeeController {
  const {
    tx, batchCalls, chainId, account, publicKeyHex, publicKeyLoaded, readOnly, requestKey,
  } = input;

  // The user's remaining choice is the fee ASSET (null = native, else a
  // whitelisted stablecoin). The card loads the options; this owns the
  // selection so the approve path submits exactly what was quoted.
  const [gasFeeToken, setGasFeeToken] = useState<string | null>(null);
  const [feeEstimate, setFeeEstimate] = useState<TransactionFeeEstimate | null>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  // Explicit flag (vs inferring from a null estimate) so the confirm guard
  // doesn't flicker in the frame before estimation starts.
  const [gasEstimateFailed, setGasEstimateFailed] = useState(false);
  // The card fires this while it re-quotes internally (fee-asset switch /
  // refresh), so confirm stays disabled until the displayed quote settles —
  // the internal re-quote doesn't touch `estimatingGas`.
  const [feeBusy, setFeeBusy] = useState(false);

  const costsGas = tx !== null || (batchCalls !== null && batchCalls.length > 0);

  useEffect(() => {
    if (requestKey === null) {
      setFeeEstimate(null);
      setGasFeeToken(null);
      setGasEstimateFailed(false);
      return;
    }
    // A new request starts back at the native fee asset (the estimate below is
    // made without a token, so the displayed quote matches the selection).
    setGasFeeToken(null);
    if (!costsGas || !account || readOnly || !publicKeyLoaded) return;

    // Guard the async estimate so a slower previous request can't overwrite the
    // current one's state after it has been replaced.
    let cancelled = false;
    setEstimatingGas(true);
    setGasEstimateFailed(false);
    // A batch is an on-chain UserOp: estimate against the same MultiSend of
    // every call that `sendBatchCalls` submits. Otherwise the REAL tx, so the
    // displayed fee and the funding pre-check reflect this contract call or
    // deploy and not a dummy transfer.
    const useBatch = batchCalls !== null && batchCalls.length > 0;
    estimateTransactionFee(
      account,
      chainId,
      'fast',
      useBatch ? undefined : tx ?? undefined,
      useBatch ? batchCalls : undefined,
      undefined,
      publicKeyHex,
    )
      .then((fee) => { if (!cancelled) { setFeeEstimate(fee); setGasEstimateFailed(false); } })
      .catch(() => {
        if (cancelled) return;
        setFeeEstimate(null);
        setGasEstimateFailed(true);
      })
      .finally(() => { if (!cancelled) setEstimatingGas(false); });
    return () => { cancelled = true; };
    // `requestKey` stands in for the request object the effect used to key on;
    // `tx`/`batchCalls` are derived from it and would only add identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, chainId, account, publicKeyHex, publicKeyLoaded, readOnly]);

  const onFeeUpdate = useCallback((fee: TransactionFeeEstimate) => {
    setFeeEstimate(fee);
    setGasEstimateFailed(false);
  }, []);

  const useBatch = batchCalls !== null && batchCalls.length > 0;
  const isTx = !useBatch && tx !== null;

  return {
    cardProps: {
      safeAddress: account ?? '',
      chainId,
      feeEstimate,
      estimating: estimatingGas,
      publicKeyHex,
      tx: useBatch ? undefined : tx ?? undefined,
      batchCalls: useBatch ? batchCalls : undefined,
      gasFeeToken,
      onFeeTokenChange: setGasFeeToken,
      onFeeUpdate,
      onBusyChange: setFeeBusy,
    },
    estimate: feeEstimate,
    feeToken: gasFeeToken,
    // `SigningSheet.tsx:610-611`, verbatim — including the asymmetry that a
    // batch is NOT gated by `estimating`/`failed`, only by a re-quote.
    blocksConfirm: (isTx && (estimatingGas || gasEstimateFailed)) || ((isTx || useBatch) && feeBusy),
    failed: gasEstimateFailed,
  };
}
