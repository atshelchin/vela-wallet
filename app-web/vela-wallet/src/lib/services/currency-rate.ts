/**
 * The display-currency RATE waterfall (research D13): only `resolveRate` and
 * its quoted twin from src/services/currency.ts @ c13e89d4 — the seeding /
 * persistence half of that file became the `display_currency` core in 016.
 *
 * USD → `code`:
 *   1. Chainlink fiat/USD feed (ENS-addressed on Ethereum mainnet)
 *   2. the configurable fiat-rate endpoint (cached + persisted in fiat-fx)
 *   → `null` when neither can price it. `null` is NOT 1: the core's
 *   `rate_resolved { rate: null }` keeps the shell formatting in USD and
 *   refusing conversion.
 */
import type { FiatRateQuote } from './fiat-rate-quote';
import { getFxRate } from './fiat-fx';
import { getChainlinkRate, isChainlinkFiat } from './fiat-rates';

export async function resolveRate(code: string): Promise<number | null> {
	if (code === 'USD') return 1;

	if (isChainlinkFiat(code)) {
		try {
			const r = await getChainlinkRate(code);
			if (r != null && r > 0) return r;
		} catch {
			/* fall through to the configured endpoint */
		}
	}

	try {
		const r = await getFxRate(code);
		if (r != null && r > 0) return r;
	} catch {
		/* fall through */
	}

	return null;
}

/**
 * `resolveRate`, with the answer carrying the currency it is about — the one
 * way anything that CONVERTS money should ask (unwrapped by `convertibleRate`).
 */
export async function resolveQuote(code: string): Promise<FiatRateQuote | null> {
	const rate = await resolveRate(code);
	return rate === null ? null : { code, rate };
}
