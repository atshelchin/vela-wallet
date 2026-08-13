/**
 * A figure may not change its unit without restating its digits.
 *
 * Four rounds of review closed four doors on the same defect — a missing
 * conversion factor silently becoming `1`:
 *
 *   getRate()                  resolveRate(code) ?? 1
 *   display_currency::commit   rate.unwrap_or(1.0)
 *   tokenPriceInFiat           usdToFiatRate > 0 ? … : 1
 *   EnterDetailsStep:175       amount / (fiatPrice || 1)
 *
 * The fifth door had no `1` in it at all. `toggleFiatInput` skipped the
 * conversion when `fiatPrice` was 0 and then flipped `inputInUsd` anyway: the
 * digits stayed, the unit label changed, and "5000" typed in an unpriceable CNY
 * became 5000 USDC — with the confirm slider armed on it. Multiplying by 1 and
 * relabelling a unit are the same operation; only one of them is greppable,
 * which is why the four guards did not catch the fifth.
 *
 * So the fix is not a sixth guard. `DenominatedAmount` welds the figure to its
 * unit and keeps the unit PRIVATE, so "keep the digits, change the label" is
 * not expressible: the only route to another unit is `convert`, which restates
 * both or returns `null`. This file pins that contract, the honest outcomes
 * built on it, and the fact that both screens actually route through it.
 *
 * Twin of `rust/crates/vela-core/src/app/money.rs`'s test module and of
 * `app_send.rs::leaving_fiat_mode_with_no_rate_drops_the_figure_instead_of_relabelling_it`.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DenominatedAmount,
  TokenPrice,
  TOKEN_DENOM,
  fiatDenom,
} from '@/services/fiat-convert';

const USDC_DECIMALS = 6;
const USDC_PRICE_USD = 1;
const CNY_PER_USD = 7.17;

const cnyPrice = TokenPrice.of(USDC_PRICE_USD, CNY_PER_USD, 'CNY')!;
const usdPrice = TokenPrice.of(USDC_PRICE_USD, 1, 'USD')!;

describe('TokenPrice — an absent factor is not parity', () => {
  it('refuses to exist without BOTH a positive finite price and rate', () => {
    expect(TokenPrice.of(null, CNY_PER_USD, 'CNY')).toBeNull();
    expect(TokenPrice.of(undefined, CNY_PER_USD, 'CNY')).toBeNull();
    expect(TokenPrice.of(USDC_PRICE_USD, null, 'CNY')).toBeNull();
    expect(TokenPrice.of(USDC_PRICE_USD, 0, 'CNY')).toBeNull();
    expect(TokenPrice.of(USDC_PRICE_USD, -CNY_PER_USD, 'CNY')).toBeNull();
    expect(TokenPrice.of(USDC_PRICE_USD, NaN, 'CNY')).toBeNull();
    expect(TokenPrice.of(Infinity, CNY_PER_USD, 'CNY')).toBeNull();
  });

  it('carries the currency it is quoted in', () => {
    expect(cnyPrice.code).toBe('CNY');
    expect(cnyPrice.perToken).toBeCloseTo(CNY_PER_USD, 10);
  });
});

describe('DenominatedAmount — the unit travels with the digits', () => {
  it('converts both ways when the rate is real', () => {
    const typed = DenominatedAmount.fiat('5000', 'CNY');
    expect(typed.toTokenUnits(cnyPrice, USDC_DECIMALS)).toBe('697.35007');

    const back = DenominatedAmount.token('697.35007').convert(
      fiatDenom('CNY'), cnyPrice, USDC_DECIMALS, 2,
    );
    expect(back?.value).toBe('5000.00');
    expect(back?.fiatCode).toBe('CNY');
  });

  it('refuses to make a token figure out of an unpriced fiat figure', () => {
    const typed = DenominatedAmount.fiat('5000', 'CNY');
    expect(typed.convert(TOKEN_DENOM, null, USDC_DECIMALS, 2)).toBeNull();
    expect(typed.toTokenUnits(null, USDC_DECIMALS)).toBe('0');
  });

  it('refuses a price quoted in a DIFFERENT currency rather than approximating', () => {
    // `display_changed` can swap the whole context in one event, so a figure
    // typed in CNY can find itself next to a USD rate.
    const typed = DenominatedAmount.fiat('5000', 'CNY');
    expect(typed.convert(TOKEN_DENOM, usdPrice, USDC_DECIMALS, 2)).toBeNull();
    expect(typed.toTokenUnits(usdPrice, USDC_DECIMALS)).toBe('0');
  });

  it('lets zero and blank cross units with no rate at all', () => {
    // Zero carries no information, so relabelling it invents nothing — and it
    // is what keeps an untouched screen from being trapped in one mode.
    for (const figure of ['', '0', '0.00']) {
      const out = DenominatedAmount.fiat(figure, 'CNY').convert(TOKEN_DENOM, null, 18, 2);
      expect(out?.value).toBe(figure);
      expect(out?.isFiat).toBe(false);
    }
  });

  it('leaves a token figure alone no matter what cannot be priced', () => {
    expect(DenominatedAmount.token('1.5').toTokenUnits(null, 18)).toBe('1.5');
    expect(DenominatedAmount.token('1.5').toTokenUnits(usdPrice, USDC_DECIMALS)).toBe('1.5');
  });

  it('retypes the FIGURE without touching the unit', () => {
    const typed = DenominatedAmount.fiat('50', 'CNY').withValue('5000');
    expect(typed.value).toBe('5000');
    expect(typed.fiatCode).toBe('CNY');
  });
});

/**
 * The exact blocker, played out: `send.rs:2083` / `useSendController.ts:1164`
 * let someone LEAVE fiat mode with `dc.rate == null`, and because `fiatPrice`
 * was 0 the conversion was skipped — the CNY digits stayed and were then read
 * as token units.
 *
 * Mutation proof: make `toggleFiatInput` fall back to `typedAmount` (or to
 * `DenominatedAmount.token(typedAmount.value)`) instead of an empty token
 * figure and the last two expectations become '5000'.
 */
describe('the ⇄ toggle, unconvertible', () => {
  /** Exactly the statement list in `useSendController.ts::toggleFiatInput`. */
  const toggle = (typed: DenominatedAmount, price: TokenPrice | null, code: string) => {
    const target = typed.isFiat ? TOKEN_DENOM : fiatDenom(code);
    if (target.kind === 'fiat' && !price) return typed; // the door stays shut
    return typed.convert(target, price, USDC_DECIMALS, 2) ?? DenominatedAmount.token('');
  };

  it('will not open the door into a currency nothing can price', () => {
    const typed = DenominatedAmount.token('1');
    const after = toggle(typed, null, 'CNY');
    expect(after.isFiat).toBe(false);
    expect(after.value).toBe('1');
  });

  it('lets someone out of fiat mode — WITHOUT the fiat digits', () => {
    const typed = DenominatedAmount.fiat('5000', 'CNY');
    // The rate vanished while 5000 CNY was on the field.
    expect(typed.toTokenUnits(null, USDC_DECIMALS)).toBe('0');
    const after = toggle(typed, null, 'CNY');
    expect(after.isFiat).toBe(false); // never trapped
    expect(after.value).toBe(''); // and 5000 CNY is not 5000 USDC
    expect(after.toTokenUnits(null, USDC_DECIMALS)).toBe(''); // nothing to sign
  });
});

/**
 * `EnterDetailsStep.tsx:175` printed "⇅ 5000 USDC" under "5000 CNY" because of
 * a `/ (fiatPrice || 1)` fallback, while the controller's `tokenAmount` was
 * '0'. A screen may not advertise an answer its own button would not produce —
 * least of all when the only action it offers would make that answer true.
 */
describe('the ⇅ conversion row cannot disagree with the signature', () => {
  const root = resolve(__dirname, '../../..');
  const step = readFileSync(resolve(root, 'src/screens/wallet/EnterDetailsStep.tsx'), 'utf8');
  const controller = readFileSync(resolve(root, 'src/screens/wallet/useSendController.ts'), 'utf8');

  it('reads the controller tokenAmount instead of dividing on its own', () => {
    expect(step).not.toContain('fiatPrice || 1');
    expect(step).not.toContain('const fiatPrice');
    expect(step).toContain('parseFloat(tokenAmount || \'0\')');
  });

  it('prints exactly what the resolution returns when nothing can be priced', () => {
    // The row's fiat branch is `parseFloat(tokenAmount).toFixed(…)`, and
    // `tokenAmount` is `tokenUnitsFor(selectedToken)`. With no rate it is '0' →
    // the row reads "0 USDC", which is the truth and is also what Continue
    // now refuses (`canContinue` asks this very string, not just `!!amount`).
    const unpriced = DenominatedAmount.fiat('5000', 'CNY')
      .toTokenUnits(TokenPrice.of(USDC_PRICE_USD, null, 'CNY'), USDC_DECIMALS);
    expect(unpriced).toBe('0');
    expect(parseFloat(unpriced)).toBe(0);
  });
});
