/**
 * `/pay` request parsing — WEB, driven by the portable Rust validator
 * (spec 016, `rust/crates/vela-core/src/app/payment_request.rs`).
 *
 * The validator is pure — `link_opened` requests no shell operations — so
 * this drives the core synchronously and renders the typed result. The strict
 * grammar replaces the inline parse's two confirmed defects: `amount=1e18`
 * crashed mid-render (BigInt SyntaxError) and `amount=0x10` was silently
 * hex-parsed into an enormous prefill (research.md D8).
 */
import { useMemo } from 'react';

import { validatePayQuery } from '@/services/wallet-state-core/validate-pay';

import type { PayQueryParams, PayRequestController } from './receive-controller-types';

const INVALID: Omit<PayRequestController, 'valid'> = {
  to: '',
  chainId: 0,
  token: '',
  amount: '',
  symbol: 'tokens',
  decimals: 18,
  networkName: '',
  eip681: '',
  amountBase: '',
};

export function usePayRequest(p: PayQueryParams): PayRequestController {
  return useMemo(() => {
    const pay = validatePayQuery(p);
    if (!pay) return { valid: false, ...INVALID };
    return {
      valid: true,
      to: pay.recipient,
      chainId: pay.chain_id,
      token: pay.token_address ?? '',
      amount: pay.amount ?? '',
      symbol: pay.symbol,
      decimals: pay.decimals,
      networkName: pay.network_name,
      eip681: pay.eip681_uri,
      amountBase: pay.amount_base ?? '',
    };
  }, [p.to, p.chain, p.token, p.amount, p.sym, p.dec, p.net]);
}
