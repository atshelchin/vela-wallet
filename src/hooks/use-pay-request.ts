/**
 * `/pay` landing-page request parsing — NATIVE controller.
 *
 * Today's logic, moved verbatim from `PayScreen.tsx` for spec 016. Hermes has
 * no WebAssembly, so this TypeScript path stays as-is on iOS/Android; the web
 * variant (`use-pay-request.web.ts`) is driven by the portable Rust machine,
 * whose strict amount grammar also fixes the malformed-amount crash the
 * inline parse has (research.md D8 — web only, per FR-019).
 */
import { useMemo } from 'react';

import { isAddress } from '@/models/types';
import { buildEIP681, toBaseUnits } from '@/services/eip681';

import type { PayQueryParams, PayRequestController } from './receive-controller-types';

export function usePayRequest(p: PayQueryParams): PayRequestController {
  return useMemo(() => {
    const to = (p.to ?? '').trim();
    const chainId = parseInt(p.chain ?? '', 10);
    const token = (p.token ?? '').trim();
    const amount = (p.amount ?? '').trim();
    const symbol = (p.sym ?? '').trim() || 'tokens';
    const decimals = parseInt(p.dec ?? '18', 10) || 18;
    const networkName = (p.net ?? '').trim() || (Number.isFinite(chainId) ? `Chain ${chainId}` : '');
    const valid = isAddress(to) && Number.isFinite(chainId);

    const eip681 = buildEIP681({ recipient: to, chainId, tokenAddress: token || null, decimals, amount });
    const amountBase = amount ? toBaseUnits(amount, decimals).toString() : '';

    return { valid, to, chainId, token, amount, symbol, decimals, networkName, eip681, amountBase };
  }, [p.to, p.chain, p.token, p.amount, p.sym, p.dec, p.net]);
}
