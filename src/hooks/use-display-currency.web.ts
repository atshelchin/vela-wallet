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

import { currencyMeta, formatFiat } from '@/services/currency';
import {
  displayCurrencyPair,
  ensureDisplayCurrency,
  subscribeDisplayCurrency,
  type DisplayCurrencyPair,
} from '@/services/wallet-state-core/display-currency-resident.web';

export interface DisplayCurrency {
  code: string;
  symbol: string;
  /** USD → display-currency multiplier. */
  rate: number;
  /** Format a USD value into the selected currency, e.g. 1.0 → "¥155". */
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

  const { code, rate } = pair;
  const meta = currencyMeta(code);
  return {
    code,
    symbol: meta.symbol,
    rate,
    fmt: (usd: number) => formatFiat(usd * rate, code, meta.symbol),
  };
}
