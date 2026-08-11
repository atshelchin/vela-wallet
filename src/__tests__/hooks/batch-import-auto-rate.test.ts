/**
 * `autoPricePerToken` — the NATIVE half of the batch importer's rate guard, and
 * the twin of the Rust core's `auto_price_per_token`.
 *
 * The importer's rate field is the single source of the applied rate: what the
 * string says is what every row converts at, and an EMPTY string converts
 * nothing (which is what disables Apply). So the only question this function
 * answers is "may we quote a rate at all", and it has to keep four cases apart
 * that a bare `number` cannot even express:
 *
 *   - UNKNOWN (`null`/`undefined`) — no source could price the currency, or the
 *     fetch has not landed yet.
 *   - INVALID (`rate <= 0`)        — a source answered something that is not a rate.
 *   - MISLABELLED (`code !== forCode`) — a real rate, for another currency.
 *   - KNOWN (`code === forCode && rate > 0`) — the only case that converts.
 *
 * `fiat-convert.ts::tokenPriceInFiat` merges the first two onto rate 1
 * (`usdToFiatRate > 0 ? … : 1`). That is fine where it lives — the balance card
 * would rather show the USD figure than a blank — but on the import path it
 * meant a `5000 CNY` payroll line previewed as 5000 USDT, worth ~698, with
 * Apply enabled: ~7x the intended payout behind a green button. The owner
 * overturned the ported quirk for the importer while leaving the shared helper
 * alone, so the discrimination lives here, at the call site.
 *
 * The MISLABELLED case is the same overpayment reached by the other road, and
 * it is why the rate travels as a `FiatRateQuote` rather than a number. Paste a
 * payroll priced in USD (rate 1), tap "Priced in" → CNY, and the component kept
 * mirroring 1 for the whole FX round-trip: "1 USDT = 1 CNY", Apply green, every
 * 5000 row paid as 5000 USDT instead of ~698. Unknown and mislabelled are one
 * refusal because they cost the same money.
 *
 * Mutation proof: drop `quote.code !== forCode` from the guard and the
 * "another currency's rate" cases below return 7.17 (and the USD→CNY payroll
 * pays 5000 instead of null); drop the `quote == null` screen, or restore
 * `tokenPriceInFiat(token.priceUsd, usdFiatRate ?? 0)` in `use-batch-import.ts`,
 * and every "refuses" case returns 1 instead of 0 — while the sibling
 * `batch-import-rate-guard.test.ts` reports `can_apply: true` for the same
 * unpriceable CNY batch on the web twin.
 */
import { autoPricePerToken, type FiatRateQuote } from '@/hooks/batch-import-controller-types';
import { tokenPriceInFiat } from '@/services/fiat-convert';

const USDT_PRICE_USD = 1;
const CNY_PER_USD = 7.17;

/** A rate as the shell hands it over: never without the currency it prices. */
const quote = (code: string, rate: number): FiatRateQuote => ({ code, rate });

const cny = (rate: number) => quote('CNY', rate);

describe('autoPricePerToken refuses any rate it cannot vouch for', () => {
  it('quotes nothing while the fetch has not landed (rate unknown)', () => {
    expect(autoPricePerToken(USDT_PRICE_USD, null, 'CNY')).toBe(0);
    expect(autoPricePerToken(USDT_PRICE_USD, undefined, 'CNY')).toBe(0);
  });

  it('quotes nothing for a non-positive answer (rate invalid)', () => {
    expect(autoPricePerToken(USDT_PRICE_USD, cny(0), 'CNY')).toBe(0);
    expect(autoPricePerToken(USDT_PRICE_USD, cny(-7.17), 'CNY')).toBe(0);
    expect(autoPricePerToken(USDT_PRICE_USD, cny(NaN), 'CNY')).toBe(0);
  });

  it('quotes nothing for another currency’s rate (rate mislabelled)', () => {
    // A perfectly good CNY rate says nothing about EUR.
    expect(autoPricePerToken(USDT_PRICE_USD, cny(CNY_PER_USD), 'EUR')).toBe(0);
    // And the switch that starts it all: USD is priced 1:1 against itself.
    expect(autoPricePerToken(USDT_PRICE_USD, quote('USD', 1), 'CNY')).toBe(0);
    // The comparison is the code, not a heuristic about the number.
    expect(autoPricePerToken(USDT_PRICE_USD, quote('cny', CNY_PER_USD), 'CNY')).toBe(0);
  });

  it('converts only on a known positive rate for the currency being priced', () => {
    expect(autoPricePerToken(USDT_PRICE_USD, cny(CNY_PER_USD), 'CNY')).toBeCloseTo(7.17, 10);
    expect(autoPricePerToken(3000, cny(7.17), 'CNY')).toBeCloseTo(21510, 6);
  });

  it('still refuses an unpriced token, rate or no rate', () => {
    expect(autoPricePerToken(null, cny(CNY_PER_USD), 'CNY')).toBe(0);
    expect(autoPricePerToken(0, cny(CNY_PER_USD), 'CNY')).toBe(0);
  });
});

describe('the shared display helper is left exactly as it was', () => {
  it('tokenPriceInFiat still answers 1:1 for an unknown rate — that is its job', () => {
    // The balance card renders the USD figure rather than a blank. Changing
    // THIS would have been the wrong fix; the guard belongs at the call site.
    expect(tokenPriceInFiat(USDT_PRICE_USD, 0)).toBe(1);
    expect(tokenPriceInFiat(3000, 0)).toBe(3000);
  });

  it('and the importer no longer inherits that fallback', () => {
    expect(autoPricePerToken(USDT_PRICE_USD, cny(0), 'CNY')).not.toBe(
      tokenPriceInFiat(USDT_PRICE_USD, 0),
    );
  });
});

describe('what the refusal buys: the payroll line that started this', () => {
  /** The importer divides the pasted fiat figure by the quoted rate. */
  const tokensFor = (fiat: number, q: FiatRateQuote | null, forCode: string) => {
    const price = autoPricePerToken(USDT_PRICE_USD, q, forCode);
    return price > 0 ? fiat / price : null; // null ⇒ empty field ⇒ Apply blocked
  };

  it('an unpriceable CNY pays out nothing instead of 7x', () => {
    expect(tokensFor(5000, null, 'CNY')).toBeNull();
    // What the old fallback produced: the fiat figure, one-for-one.
    expect(5000 / tokenPriceInFiat(USDT_PRICE_USD, 0)).toBe(5000);
  });

  it('a USD rate carried into CNY pays out nothing either — same 7x, other road', () => {
    expect(tokensFor(5000, quote('USD', 1), 'CNY')).toBeNull();
    // What the retained rate produced: 5000 USDT for a 5000 CNY salary line,
    // twenty rows of it, behind a green button.
    expect(5000 / tokenPriceInFiat(USDT_PRICE_USD, 1)).toBe(5000);
  });

  it('a priced CNY pays the ~698 it is actually worth', () => {
    expect(tokensFor(5000, cny(CNY_PER_USD), 'CNY')).toBeCloseTo(697.35, 2);
  });
});
