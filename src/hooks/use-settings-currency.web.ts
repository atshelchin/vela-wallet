/**
 * The Settings display-currency row — WEB, driven by the portable Rust state
 * machine (spec 016, `rust/crates/vela-core/src/app/display_currency.rs`).
 *
 * This file owns no rules. It reads the same resident session every
 * money-showing surface renders from, and reports the user's pick to it as
 * `UserChose` — which is where "persist first, price second, and never let a
 * late seed overwrite an explicit choice" is decided.
 *
 * Before this existed the screen called `loadCurrency()` and `setCurrency()`
 * straight from `services/currency.ts`, so on web the TypeScript first-launch
 * seed (`seedFromDeviceLocale`, currency.ts:128-152) ran beside the core's seed
 * — two implementations of the same first-launch rule, both writing
 * `vela.displayCurrency`, resolvable only by whichever rate landed last.
 *
 * The one thing that stays here is the OPTIMISTIC code: the core's view carries
 * the last *committed* {code, rate} pair, so it keeps reporting the old currency
 * until the new rate resolves. The row and the picker's checkmark moved the
 * instant the user tapped, and they still do.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  dispatchDisplayCurrency,
  displayCurrencyPair,
  ensureDisplayCurrency,
  subscribeDisplayCurrency,
  type DisplayCurrencyPair,
} from '@/services/wallet-state-core/display-currency-resident.web';

import type { SettingsCurrencyController } from './settings-currency-controller-types';

export function useSettingsCurrency(): SettingsCurrencyController {
  const [pair, setPair] = useState<DisplayCurrencyPair>(displayCurrencyPair);
  /** The tapped code, until the core commits it (or a different one). */
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDisplayCurrency(setPair);
    ensureDisplayCurrency();
    setPair(displayCurrencyPair());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (chosen !== null && pair.code === chosen) setChosen(null);
  }, [pair.code, chosen]);

  const pick = useCallback((next: string) => {
    setChosen(next);
    dispatchDisplayCurrency({ type: 'user_chose', code: next });
  }, []);

  return { code: chosen ?? pair.code, pick };
}
