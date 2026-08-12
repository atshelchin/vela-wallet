import {
  tokenPriceInFiat,
  fiatToTokenAmount,
  DenominatedAmount,
  TokenPrice,
} from '@/services/fiat-convert';

/**
 * What `resolveTokenAmount(amount, inFiat, priceUsd, decimals, rate)` used to
 * be, with the one thing it could not express restored: the currency.
 *
 * That helper took a boolean where a currency belongs, so it labelled the
 * figure and the price with the same `const ANY = ''` and its currency
 * comparison was `'' === ''` — vacuously true for every caller in the app. The
 * cases below are its cases, unchanged, now stated in a named currency; the
 * comparison they used to skip has a test of its own at the bottom.
 */
const resolve = (
  amount: string,
  code: string | null,
  priceUsd: number | null | undefined,
  decimals = 18,
  rate: number | null = 1,
  quotedIn = 'CNY',
) =>
  (code === null ? DenominatedAmount.token(amount) : DenominatedAmount.fiat(amount, code))
    .toTokenUnits(TokenPrice.of(priceUsd, rate, quotedIn), decimals);

describe('tokenPriceInFiat', () => {
  test('USDT (priceUsd=1) at a CNY rate is just the rate', () => {
    expect(tokenPriceInFiat(1, 7.1)).toBeCloseTo(7.1, 10);
  });
  test('ETH price scales by the fiat rate', () => {
    expect(tokenPriceInFiat(3000, 7.1)).toBeCloseTo(21300, 6);
  });
  test('unknown / non-positive price ⇒ 0 (the "cannot convert" sentinel)', () => {
    expect(tokenPriceInFiat(null, 7.1)).toBe(0);
    expect(tokenPriceInFiat(undefined, 7.1)).toBe(0);
    expect(tokenPriceInFiat(0, 7.1)).toBe(0);
    expect(tokenPriceInFiat(-5, 7.1)).toBe(0);
  });
  test('a non-positive fiat rate falls back to 1 (USD passthrough)', () => {
    expect(tokenPriceInFiat(2, 0)).toBe(2);
    expect(tokenPriceInFiat(2, -1)).toBe(2);
  });
});

describe('fiatToTokenAmount — the payroll conversion', () => {
  test('7100 CNY ÷ (1 USDT = 7.1 CNY) = 1000 USDT', () => {
    expect(fiatToTokenAmount(7100, 7.1, 6)).toBe('1000');
  });
  test('a fractional payroll figure truncates to token decimals', () => {
    // 1234.56 CNY / 7.1 = 173.8816901..., USDT has 6 decimals
    expect(fiatToTokenAmount(1234.56, 7.1, 6)).toBe('173.88169');
  });
  test('strips trailing zeros but keeps meaningful decimals', () => {
    expect(fiatToTokenAmount(710, 7.1, 6)).toBe('100');
    expect(fiatToTokenAmount(15, 10, 18)).toBe('1.5');
  });
  test('non-positive fiat ⇒ "0"', () => {
    expect(fiatToTokenAmount(0, 7.1, 6)).toBe('0');
    expect(fiatToTokenAmount(-100, 7.1, 6)).toBe('0');
  });
  test('unknown price ⇒ "0" (never divide by zero)', () => {
    expect(fiatToTokenAmount(1000, 0, 6)).toBe('0');
    expect(fiatToTokenAmount(1000, -1, 6)).toBe('0');
  });
  test('a 0-decimal token stays an integer (no trailing-zero mangling)', () => {
    // regression guard: the old inline /\.?0+$/ strip turned "100" into "1"
    expect(fiatToTokenAmount(300, 3, 0)).toBe('100');
  });
});

describe('the single-send fiat toggle resolution (behaviour preserved)', () => {
  test('token mode returns the typed amount untouched', () => {
    expect(resolve('1.5', null, 3000, 18, 7.1)).toBe('1.5');
  });
  test('token mode returns the typed amount untouched even with nothing priced', () => {
    expect(resolve('1.5', null, null, 18, null)).toBe('1.5');
    expect(resolve('1.5', null, 0, 18, 7.1)).toBe('1.5');
  });
  test('an unpriced token in fiat mode converts NOTHING — it does not keep the fiat digits', () => {
    // An unpriced token and an unpriceable currency are the same hole in
    // `priceUsd × rate`. This used to return '100', so a price feed dropping a
    // token while "100" sat on screen in CNY turned it into 100 whole tokens.
    expect(resolve('100', 'CNY', null, 6, 7.1)).toBe('0');
    expect(resolve('100', 'CNY', 0, 6, 7.1)).toBe('0');
    expect(resolve('100', 'CNY', NaN, 6, 7.1)).toBe('0');
  });
  test('fiat mode divides by the token price in display currency', () => {
    // 7100 CNY of USDT (priceUsd=1) at rate 7.1 ⇒ 1000 USDT
    expect(resolve('7100', 'CNY', 1, 6, 7.1)).toBe('1000');
    // 21300 CNY of ETH (priceUsd=3000) at rate 7.1 ⇒ 1 ETH
    expect(resolve('21300', 'CNY', 3000, 18, 7.1)).toBe('1');
  });
  test('non-positive fiat input ⇒ "0"', () => {
    expect(resolve('0', 'CNY', 1, 6, 7.1)).toBe('0');
    expect(resolve('', 'CNY', 1, 6, 7.1)).toBe('0');
  });
  test('a USD figure against a USD rate of 1 is itself', () => {
    expect(resolve('3000', 'USD', 3000, 18, 1, 'USD')).toBe('1');
  });

  /**
   * The comparison `const ANY = ''` used to make vacuous, and the reason the
   * helper had to go rather than gain a parameter: nine call sites went through
   * it, so nine call sites had the guard switched off.
   *
   * Mutation proof: drop the `price.code !== this.code` check in
   * `DenominatedAmount.toTokenUnits` and the first two lines return '1000' —
   * 7100 CNY paid out at a USD rate.
   */
  test('a figure is never converted by another currency’s price', () => {
    expect(resolve('7100', 'CNY', 1, 6, 7.1, 'USD')).toBe('0');
    expect(resolve('7100', 'USD', 1, 6, 7.1, 'CNY')).toBe('0');
    expect(resolve('7100', 'CNY', 1, 6, 7.1, 'CNY')).toBe('1000');
  });
});
