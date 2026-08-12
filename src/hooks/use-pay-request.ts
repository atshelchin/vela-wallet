/**
 * `/pay` landing-page request parsing — NATIVE controller.
 *
 * Moved from `PayScreen.tsx` for spec 016. Hermes has no WebAssembly, so this
 * TypeScript path serves iOS/Android; the web variant
 * (`use-pay-request.web.ts`) is driven by the portable Rust machine.
 *
 * The amount grammar here MIRRORS that machine's
 * (`app/payment_request.rs::is_strict_amount`) rather than the tolerant parse
 * this file was moved with, because that parse had three defects on a query
 * nobody controls:
 *
 *   - `amount=1e18` and `amount=1,5` reached `BigInt(...)` and threw
 *     mid-render, taking the whole page down;
 *   - `amount=0x10` was zero-padded and read as HEX — the page displayed
 *     `0x10` and encoded 268,435,456 base units;
 *   - `amount=-3` produced a negative amount.
 *
 * Anything outside the grammar is an invalid request, which is the surface the
 * screen already had for a bad recipient or chain. Keeping the two platforms
 * on one grammar is the point: a link that opens in Vela on a phone must mean
 * exactly what it means in the browser.
 */
import { useMemo } from 'react';

import { isAddress } from '@/models/types';
import { buildEIP681, toBaseUnits } from '@/services/eip681';

import type { PayQueryParams, PayRequestController } from './receive-controller-types';

/**
 * ASCII digits with at most one dot and at least one digit, and no more
 * fractional digits than the asset carries. Mirrors `is_strict_amount`,
 * including its acceptance of the `.5` / `1.` shapes the request builder's own
 * sanitizer can emit (links carrying them are already in the wild).
 */
export function isStrictPayAmount(amount: string, decimals: number): boolean {
  const dot = amount.indexOf('.');
  const intPart = dot < 0 ? amount : amount.slice(0, dot);
  const frac = dot < 0 ? null : amount.slice(dot + 1);
  const digits = (s: string) => /^[0-9]*$/.test(s);
  if (!digits(intPart)) return false;
  if (frac === null) return intPart.length > 0;
  if (!digits(frac) || frac.length > decimals) return false;
  return intPart.length > 0 || frac.length > 0;
}

export function usePayRequest(p: PayQueryParams): PayRequestController {
  return useMemo(() => {
    const to = (p.to ?? '').trim();
    const chainId = parseInt(p.chain ?? '', 10);
    const token = (p.token ?? '').trim();
    const rawAmount = (p.amount ?? '').trim();
    const symbol = (p.sym ?? '').trim() || 'tokens';
    const decimals = parseInt(p.dec ?? '18', 10) || 18;
    const networkName = (p.net ?? '').trim() || (Number.isFinite(chainId) ? `Chain ${chainId}` : '');

    // A malformed amount invalidates the whole request rather than being
    // dropped: an open request would show "any amount" for a link that asked
    // for a specific one.
    const amountOk = !rawAmount || isStrictPayAmount(rawAmount, decimals);
    const valid = isAddress(to) && Number.isFinite(chainId) && amountOk;
    const amount = amountOk ? rawAmount : '';

    const eip681 = valid
      ? buildEIP681({ recipient: to, chainId, tokenAddress: token || null, decimals, amount })
      : '';
    const amountBase = valid && amount ? toBaseUnits(amount, decimals).toString() : '';

    return { valid, to, chainId, token, amount, symbol, decimals, networkName, eip681, amountBase };
  }, [p.to, p.chain, p.token, p.amount, p.sym, p.dec, p.net]);
}
