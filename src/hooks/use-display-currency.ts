/**
 * useDisplayCurrency — the chosen display currency + its USD→fiat rate, for any
 * screen that shows fiat values. Refreshes on focus so changing the currency on
 * one screen reflects everywhere. `fmt(usd)` converts a USD amount into the
 * selected currency, honouring the localized number format + decimal rules.
 *
 * Two uses, one number, and they do NOT get the same treatment when the rate is
 * unknown (see `services/fiat-rate-quote.ts`):
 *   - DISPLAY (`fmt`) may degrade. An unpriceable currency shows the honest USD
 *     figure rather than a blank card — and rather than a yuan sign in front of
 *     a number that was never converted.
 *   - CONVERSION (`rate`) may not. It is `null` until a rate is known, because
 *     the send screen divides a fiat-denominated amount by exactly this number,
 *     and a defaulted 1 there is a ~7x mispayment behind a green button — the
 *     single-send twin of the batch importer's refusal to quote a rate it
 *     cannot vouch for.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { currencyMeta, formatFiat, loadCurrency, resolveQuote, shownCurrency } from '@/services/currency';
import { convertibleRate, type FiatRateQuote } from '@/services/fiat-rate-quote';

export interface DisplayCurrency {
  code: string;
  symbol: string;
  /**
   * USD → display-currency multiplier, or `null` when no source could price
   * `code` right now. `null` is NOT 1: pass it to nothing that multiplies
   * money. Callers that only need to render use `fmt`.
   */
  rate: number | null;
  /**
   * The {code, symbol, rate} triple to RENDER a fiat figure with — exactly
   * what `fmt` applies, exposed for the few surfaces that need the parts
   * separately (a Balance component, a receipt, a detail sheet).
   *
   * It degrades to USD/1 as a UNIT when `code` cannot be priced, so a number
   * that was never converted never wears a ¥ in front of it. Taking the parts
   * from here rather than from `code`/`symbol`/`rate` is what makes a
   * mismatched pairing unrepresentable.
   */
  shown: { code: string; symbol: string; rate: number };
  /** Format a USD value into the selected currency, e.g. 1.0 → "¥155".
   *  Falls back to the USD figure when the currency cannot be priced. */
  fmt: (usd: number) => string;
}

// Last committed code+quote PAIR, shared across hook instances. A fresh mount
// (e.g. a tab pane) must never pair the stored code with the rate-1 default —
// ¥12 instead of ¥1,860 — so until some instance has committed a real pair,
// everyone renders the consistent USD/1.
let _committed: { code: string; quote: FiatRateQuote | null } | null = null;

export function useDisplayCurrency(): DisplayCurrency {
  const [pair, setPair] = useState(() => _committed ?? { code: 'USD', quote: { code: 'USD', rate: 1 } });

  useFocusEffect(useCallback(() => {
    let alive = true;
    // Commit code + rate together: flipping the code while the old rate is still
    // applied would render a wrong-magnitude value for a frame (huge for IDR/KRW).
    // `resolveQuote`, NOT `getRate`: `getRate` ends in `?? 1`, which is
    // indistinguishable from "the rate really is 1" and is what let an
    // unpriceable currency reach the send screen as a multiplier.
    loadCurrency().then(async (c) => {
      const quote = await resolveQuote(c);
      if (!alive) return;
      _committed = { code: c, quote };
      setPair(_committed);
    });
    return () => { alive = false; };
  }, []));

  const { code, quote } = pair;
  // The rate is unwrapped only through the guard, so a quote fetched for
  // another currency can never be used as this one's multiplier.
  const rate = convertibleRate(quote, code);
  const meta = currencyMeta(code);
  const shown = shownCurrency(code, rate);
  return {
    code,
    symbol: meta.symbol,
    rate,
    shown,
    fmt: (usd: number) => formatFiat(usd * shown.rate, shown.code, shown.symbol),
  };
}
