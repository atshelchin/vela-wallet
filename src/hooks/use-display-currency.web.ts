/**
 * useDisplayCurrency — WEB, driven by the portable Rust state machine
 * (spec 016, `rust/crates/vela-core/src/app/display_currency.rs`).
 *
 * This file owns no rules. One module-level session — now
 * `wallet-state-core/display-currency-resident.web.ts`, so the Settings
 * currency row can share it — is used by every mount, the same sharing today's
 * module-level `_committed` pair provided, so all money-showing surfaces render
 * the same atomically-committed {code, rate} pair and the first-launch seed runs
 * once, not once per screen. The public shape is identical to the native hook.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { currencyMeta, formatFiat, shownCurrency } from '@/services/currency';
import {
  displayCurrencyPair,
  ensureDisplayCurrency,
  subscribeDisplayCurrency,
  type DisplayCurrencyPair,
} from '@/services/wallet-state-core/display-currency-resident.web';

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

export function useDisplayCurrency(): DisplayCurrency {
  const [pair, setPair] = useState<DisplayCurrencyPair>(displayCurrencyPair);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = subscribeDisplayCurrency(setPair);
      // Focus refresh: the core coalesces these while a read is in flight.
      ensureDisplayCurrency();
      setPair(displayCurrencyPair());
      return unsubscribe;
    }, []),
  );

  // The core already commits code and rate together and never labels one
  // currency's rate with another's, so `pair.rate` needs no re-validation here
  // — it needs only to keep its `null`, which is the whole point of it.
  const { code, rate } = pair;
  const meta = currencyMeta(code);
  // Display degrades to the honest USD figure rather than putting a ¥ in front
  // of a number nothing converted. Shared with the native twin.
  const shown = shownCurrency(code, rate);
  return {
    code,
    symbol: meta.symbol,
    rate,
    shown,
    fmt: (usd: number) => formatFiat(usd * shown.rate, shown.code, shown.symbol),
  };
}
