/**
 * fiat-convert — the shared fiat⇄token amount math, used by BOTH the single-send
 * fiat-input toggle ([SendScreen]) and the payroll batch importer ([BatchImportSheet]).
 *
 * Rates are expressed exactly as the rest of the app already models them, so callers
 * never have to reconcile two conventions:
 *   - `priceUsd`      — a token's unit price in USD (USDT ⇒ 1, ETH ⇒ ~3000; null ⇒ unpriced).
 *   - `usdToFiatRate` — the USD→fiat multiplier from `resolveRate(code)` /
 *                       `useDisplayCurrency().rate` (1 USD ≈ 7.1 CNY; Chainlink /
 *                       Frankfurter under the hood), and `null` when NO source
 *                       could price the currency. Deliberately NOT `getRate`,
 *                       whose `?? 1` is a display-only convenience that is
 *                       indistinguishable from "the rate really is 1".
 * A token's price in the display fiat is therefore just `priceUsd × usdToFiatRate`.
 *
 * Pure and dependency-free on purpose, so the money-shaping logic is exhaustively
 * unit-testable away from the price/rate/RPC stack.
 */

/** Strip trailing zeros (and a bare trailing dot) without mangling an integer. */
function stripTrailingZeros(s: string): string {
  if (!s.includes('.')) return s; // integers are left alone (guards decimals=0 tokens)
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * A token's unit price expressed in a fiat currency, or `0` when it can't be known.
 * `0` is the "can't convert" sentinel every consumer checks before dividing.
 */
export function tokenPriceInFiat(priceUsd: number | null | undefined, usdToFiatRate: number): number {
  if (!priceUsd || priceUsd <= 0) return 0;
  const rate = usdToFiatRate > 0 ? usdToFiatRate : 1;
  return priceUsd * rate;
}

/**
 * Convert a fiat amount into a human token-amount string, truncated (via `toFixed`)
 * to `decimals` so we never emit more precision than the token can carry — the same
 * precision guard the on-chain `toBaseUnits` will apply. `priceInFiat` is the token's
 * unit price in the SAME fiat currency as `fiat` (see {@link tokenPriceInFiat}).
 * Returns '0' for a non-positive fiat OR an unknown (≤0) price.
 */
export function fiatToTokenAmount(fiat: number, priceInFiat: number, decimals: number = 18): string {
  if (!(priceInFiat > 0)) return '0';
  if (!(fiat > 0)) return '0';
  return stripTrailingZeros((fiat / priceInFiat).toFixed(Math.max(0, Math.trunc(decimals))));
}

/**
 * A token's unit price in ONE named fiat currency.
 *
 * The only constructor is {@link TokenPrice.of}, and it returns `null` whenever
 * either factor is missing, non-finite or non-positive. That is the whole
 * point: an absent price and an absent rate are absent FACTORS, and the one
 * thing this codebase has repeatedly proven it must never do is spell an
 * absent factor `1`. The `code` travels with the number because a price is
 * meaningless without the currency it is quoted in.
 *
 * This is the same discipline `fiat-rate-quote.ts::FiatRateQuote` applies one
 * level up (a RATE inseparable from its currency), carried one level down to
 * the PRICE the send screen actually divides by — and then, via
 * {@link DenominatedAmount}, to the AMOUNT itself. Same rule at all three
 * levels: a number that moves money never travels without its unit.
 *
 * Twin of `money.rs::TokenPrice`.
 */
export class TokenPrice {
  private constructor(
    readonly code: string,
    readonly perToken: number,
  ) {}

  static of(
    priceUsd: number | null | undefined,
    usdToFiatRate: number | null | undefined,
    code: string,
  ): TokenPrice | null {
    if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
    if (usdToFiatRate == null || !Number.isFinite(usdToFiatRate) || usdToFiatRate <= 0) return null;
    const perToken = priceUsd * usdToFiatRate;
    if (!Number.isFinite(perToken) || perToken <= 0) return null;
    return new TokenPrice(code, perToken);
  }
}

/** What a figure is counted in: token units, or a named fiat currency. */
export type Denom = { kind: 'token' } | { kind: 'fiat'; code: string };

export const TOKEN_DENOM: Denom = { kind: 'token' };
export const fiatDenom = (code: string): Denom => ({ kind: 'fiat', code });

/**
 * A decimal figure welded to the unit it is counted in.
 *
 * Five defects in this wallet were the same defect: a missing conversion factor
 * silently became `1` (`?? 1`, `unwrap_or(1.0)`, `|| 1`, `rate > 0 ? rate : 1`).
 * The fifth contained no `1` at all — the conversion was SKIPPED, the digits
 * kept, and the unit label changed underneath them. Multiplying by 1 and
 * relabelling are the same operation; only one of them is greppable.
 *
 * So the unit is not a sibling `boolean` any more. `code` is private and the
 * constructor is private, which means "keep the digits, change the unit" is not
 * expressible from outside this module: the only way to a different unit is
 * {@link DenominatedAmount.convert}, which restates the digits AND the unit
 * together, or returns `null` and hands you no amount at all.
 *
 * Twin of `money.rs::DenominatedAmount`.
 */
export class DenominatedAmount {
  private constructor(
    /** Canonical dot-decimal, exactly as typed or as a conversion produced it. */
    readonly value: string,
    /** `null` ⇒ the selected token's own units; otherwise the fiat code. */
    private readonly code: string | null,
  ) {}

  /** A figure in the selected token's own units. */
  static token(value: string): DenominatedAmount {
    return new DenominatedAmount(value, null);
  }

  /** A figure in `code`. Both halves must be named — there is no promotion. */
  static fiat(value: string, code: string): DenominatedAmount {
    return new DenominatedAmount(value, code);
  }

  get isFiat(): boolean {
    return this.code !== null;
  }

  get fiatCode(): string | null {
    return this.code;
  }

  get denom(): Denom {
    return this.code === null ? TOKEN_DENOM : fiatDenom(this.code);
  }

  get isEmpty(): boolean {
    return this.value === '';
  }

  /** Retype the FIGURE, keeping the unit — this is the amount text field. */
  withValue(value: string): DenominatedAmount {
    return new DenominatedAmount(value, this.code);
  }

  /** The figure as `parseFloat` reads it; a blank field reads as 0. */
  get numeric(): number {
    return parseFloat(this.value || '0');
  }

  /**
   * Restate this figure in `target`.
   *
   * `null` means the conversion could not be made — and the one thing the
   * caller must not then do is keep `this.value` under `target`. That is the
   * implicit rate of 1 this class exists to make unwritable.
   *
   * A price quoted in a different currency than the figure is a refusal, not
   * an approximation: `display_changed` can swap the whole context in one
   * event, so "5000" typed in CNY can find itself next to a USD rate.
   */
  convert(
    target: Denom,
    price: TokenPrice | null,
    tokenDecimals: number,
    fiatDecimals: number,
  ): DenominatedAmount | null {
    const here = this.code;
    const there = target.kind === 'fiat' ? target.code : null;
    if (here === there) return this;
    // Zero and blank are the same figure in every unit, so relabelling them
    // invents nothing and needs no factor. This is the ONLY unit change that is
    // legitimate without a price — and it is what keeps an untouched screen
    // from being trapped in one mode.
    const val = this.numeric;
    if (!(val > 0)) return new DenominatedAmount(this.value, there);
    if (!price) return null;
    const fiatSide = here ?? there;
    if (fiatSide !== price.code) return null;
    if (there !== null) {
      return new DenominatedAmount(
        (val * price.perToken).toFixed(Math.max(0, Math.trunc(fiatDecimals))),
        there,
      );
    }
    // The toggle's own (sloppy) strip regex, ported verbatim — deliberately not
    // {@link stripTrailingZeros}; the two have always differed for 0-decimal
    // tokens and that difference is preserved, not fixed here.
    return new DenominatedAmount(
      (val / price.perToken).toFixed(Math.max(0, Math.trunc(tokenDecimals))).replace(/\.?0+$/, ''),
      null,
    );
  }

  /**
   * The figure in token units — the ONE number a signature may be built from,
   * and therefore the only number the confirm screen may show.
   *
   * A token-denominated figure passes through byte-exact, so an unpriceable
   * display currency costs a token-denominated send nothing. A fiat-denominated
   * figure that cannot be converted resolves to `'0'`, which every downstream
   * gate already reads as "no amount" — it never resolves to its own fiat
   * digits.
   */
  toTokenUnits(price: TokenPrice | null, decimals: number = 18): string {
    if (this.code === null) return this.value;
    if (!price || price.code !== this.code) return '0';
    return fiatToTokenAmount(this.numeric, price.perToken, decimals);
  }
}

/*
 * `resolveTokenAmount(amount, inFiat, priceUsd, decimals, rate)` used to live
 * here, and every one of the send controller's nine call sites went through it.
 *
 * It took a `boolean` where a currency belongs, so it had no code to give
 * either half and labelled BOTH with `const ANY = ''`. That made
 * {@link DenominatedAmount}'s currency comparison `'' === ''` — true always —
 * so the guard against converting a figure at another currency's rate was
 * switched off for every caller in the app. The refusals it did keep (no rate,
 * no price) were real; the one that needed a name was not. A guard that the
 * only helper anybody calls turns off is not a guard, so the helper is gone.
 *
 * The replacement is `useSendController`'s `tokenUnitsFor(token)`, which builds
 * the price from `dc.code` — the currency the rate is actually quoted in — and
 * asks the typed figure, which knows the currency it was typed in. Same two
 * refusals, plus the third, and no placeholder anywhere. Twin of `send.rs`'s
 * `model_token_amount`.
 */
