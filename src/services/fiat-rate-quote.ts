/**
 * fiat-rate-quote — a USD→fiat multiplier that cannot be separated from the
 * currency it prices, and the ONE question anything that converts money must
 * ask of it.
 *
 * Every screen in this app that turns a fiat figure into a token amount does
 * the same multiplication, and every one of them has the same two ways to get
 * it catastrophically wrong:
 *
 *   - UNKNOWN treated as 1. `resolveRate` answers `null` when no source can
 *     price a currency; the display helper `getRate` collapses that onto 1 so a
 *     balance card renders. Fed to a conversion instead, "1" is a claim — 1 USD
 *     = 1 CNY — and a 5000 CNY payroll line pays 5000 USDT, ~7x.
 *   - MISLABELLED. A perfectly good rate, for a DIFFERENT currency: the one
 *     still in hand while a switch's fetch is in flight, or a late answer for a
 *     currency already abandoned. More dangerous than unknown, because the
 *     number is plausible — it renders, it converts, and it turns the button
 *     green.
 *
 * A bare `number` cannot express either case, which is why the rate travels as
 * a {@link FiatRateQuote} and is unwrapped only by {@link convertibleRate},
 * which is handed the currency the caller is about to price and refuses
 * anything else. Shared by the batch importer's `autoPricePerToken`, the
 * display-currency hook pair, and (through them) the send screen's
 * fiat-denominated amount input — and mirrored in Rust by
 * `batch_import::auto_price_per_token` and `display_currency`'s `Pair`.
 *
 * Owner ruling, first made for the payroll importer and then extended to
 * single-send as the same failure wearing a different screen: when the number
 * that moves money is unknown — or is known to be about something else — stop;
 * do not guess. DISPLAY may degrade (show the USD figure, show nothing);
 * CONVERSION may not.
 */

/**
 * A fetched USD→fiat multiplier, inseparable from the currency it prices.
 *
 * The twin of the Rust core's `batch_import::FiatRate` and of
 * `display_currency::Pair`.
 */
export interface FiatRateQuote {
  /** The currency this rate was fetched FOR — not necessarily the one the
   *  screen is showing now. */
  code: string;
  /** USD → `code` multiplier, exactly as the source answered it. */
  rate: number;
}

/**
 * The multiplier this quote licenses for `forCode`, or `null` when it licenses
 * none. The only supported way to get a number back out of a quote.
 *
 * FOUR cases, three of which answer `null`:
 *   - `null`/`undefined` — UNKNOWN: nobody could price it, or the fetch has not
 *     landed. Nothing is asserted about the rate.
 *   - `rate` not finite / `<= 0` — INVALID: a source answered something that is
 *     not a rate.
 *   - `code !== forCode` — MISLABELLED: a real rate, about another currency.
 *   - `code === forCode && rate > 0` — KNOWN: the only case that converts.
 *
 * The comparison is exact, deliberately: `'cny'` is not `'CNY'` here, because
 * the fix for a case-mismatched code is to normalize at the source that
 * produced it, not to let a lenient comparison decide what a rate is about.
 */
export function convertibleRate(
  quote: FiatRateQuote | null | undefined,
  forCode: string,
): number | null {
  if (quote == null || quote.code !== forCode) return null;
  return Number.isFinite(quote.rate) && quote.rate > 0 ? quote.rate : null;
}
