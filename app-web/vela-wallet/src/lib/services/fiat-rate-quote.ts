/**
 * fiat-rate-quote — a USD→fiat multiplier that cannot be separated from the
 * currency it prices, and the ONE question anything that converts money must
 * ask of it. Ported verbatim from src/services/fiat-rate-quote.ts @ c13e89d4.
 *
 * Two ways to get the multiplication catastrophically wrong:
 *   - UNKNOWN treated as 1. `resolveRate` answers `null` when no source can
 *     price a currency. Fed to a conversion as 1, "1 USD = 1 CNY" pays a 5000
 *     CNY payroll line as 5000 USDT, ~7x.
 *   - MISLABELLED. A perfectly good rate for a DIFFERENT currency — the one
 *     still in hand while a switch's fetch is in flight. More dangerous than
 *     unknown, because the number is plausible.
 *
 * A bare `number` cannot express either case, which is why the rate travels
 * as a {@link FiatRateQuote} and is unwrapped only by {@link convertibleRate},
 * which is handed the currency the caller is about to price and refuses
 * anything else. Mirrored in Rust by `batch_import::auto_price_per_token` and
 * `display_currency`'s `Pair`.
 *
 * Owner ruling: when the number that moves money is unknown — or is known to
 * be about something else — stop; do not guess. DISPLAY may degrade (show the
 * USD figure); CONVERSION may not.
 */

/** A fetched USD→fiat multiplier, inseparable from the currency it prices. */
export interface FiatRateQuote {
	/** The currency this rate was fetched FOR — not necessarily the one showing. */
	code: string;
	/** USD → `code` multiplier, exactly as the source answered it. */
	rate: number;
}

/**
 * The multiplier this quote licenses for `forCode`, or `null` when it
 * licenses none. FOUR cases, three of which answer `null`:
 *   - `null`/`undefined` — UNKNOWN
 *   - `rate` not finite / `<= 0` — INVALID
 *   - `code !== forCode` — MISLABELLED
 *   - `code === forCode && rate > 0` — KNOWN: the only case that converts.
 *
 * The comparison is exact, deliberately: `'cny'` is not `'CNY'` — the fix for
 * a case-mismatched code is at the source that produced it.
 */
export function convertibleRate(
	quote: FiatRateQuote | null | undefined,
	forCode: string
): number | null {
	if (quote == null || quote.code !== forCode) return null;
	return Number.isFinite(quote.rate) && quote.rate > 0 ? quote.rate : null;
}
