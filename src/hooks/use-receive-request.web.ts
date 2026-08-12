/**
 * Receive-screen request controller — WEB, driven by the portable Rust state
 * machine (spec 016, `rust/crates/vela-core/src/app/payment_request.rs`).
 *
 * This file owns no rules. It creates one core session per account, forwards
 * picks/keystrokes as events, and renders whatever the core projects: the
 * acknowledge gate, the sanitized amount, the EIP-681 URI and the pay-link.
 * `payLinkBase()` (the shell's origin probe) is passed in at start — the core
 * never touches `window.location`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { payLinkBase } from '@/services/eip681';
import { createPaymentRequestSession } from '@/services/wallet-state-core/session';
import type { PaymentRequestView } from '@/services/wallet-state-core/generated/PaymentRequestView';

import type { ReceiveMode, ReceiveRequestController, RequestAssetFacts } from './receive-controller-types';

export function useReceiveRequest(address: string | undefined): ReceiveRequestController {
  const [view, setView] = useState<PaymentRequestView | null>(null);
  const session = useRef<ReturnType<typeof createPaymentRequestSession> | null>(null);

  useEffect(() => {
    if (!address) return;
    setView(null);
    const loop = createPaymentRequestSession({
      onView: setView,
      onError: (error) => console.error('[receive-request] core fault:', error),
    });
    session.current = loop;
    loop.start({
      type: 'start',
      account: address,
      recipient: address,
      base_url: payLinkBase(),
    });
    return () => {
      loop.dispose();
      session.current = null;
    };
  }, [address]);

  const acknowledge = useCallback(() => {
    session.current?.dispatch({ type: 'acknowledge' });
  }, []);

  const pickAsset = useCallback((facts: RequestAssetFacts) => {
    session.current?.dispatch({
      type: 'asset_picked',
      chain_id: facts.chainId,
      token_address: facts.tokenAddress,
      symbol: facts.symbol,
      decimals: facts.decimals,
      network_name: facts.networkName,
    });
  }, []);

  const setAmountText = useCallback((text: string) => {
    session.current?.dispatch({ type: 'amount_changed', text });
  }, []);

  // The tab is a core fact because the payloads below are derived from it.
  // Until this was dispatched the core's `mode` was permanently `Address`, so
  // `qr_value` and `copy_payload` answered with the bare address in request
  // mode — right-looking fields nobody could safely read.
  const setMode = useCallback((mode: ReceiveMode) => {
    session.current?.dispatch({ type: 'mode_changed', mode });
  }, []);

  return {
    recipient: address ?? '',
    // Loading (null) until the core has read the per-account flag.
    warned: view == null || view.gate_loading ? null : view.acknowledged,
    acknowledge,
    asset: view
      ? {
          chainId: view.asset.chain_id,
          tokenAddress: view.asset.token_address,
          symbol: view.asset.symbol,
          decimals: view.asset.decimals,
          networkName: view.asset.network_name,
        }
      : { chainId: 1, tokenAddress: null, symbol: 'ETH', decimals: 18, networkName: 'Ethereum' },
    pickAsset,
    amount: view?.amount ?? '',
    setAmountText,
    qrValue: view?.eip681_uri ?? '',
    payLink: view?.pay_link ?? '',
    hasAmount: view?.has_amount ?? false,

    // Before the first view lands (and while no address exists) the screen is
    // covered by the acknowledge gate — `warned` is null there — so these
    // conservative defaults are never what the user is looking at.
    mode: view?.mode ?? 'address',
    setMode,
    qrPayload: view?.qr_value ?? '',
    copyPayload: view?.copy_payload ?? '',
    canCopy: view?.can_copy ?? false,
    canSave: view?.can_save ?? false,
  };
}
