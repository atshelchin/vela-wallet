/**
 * The Settings display-currency row — NATIVE controller.
 *
 * Today's three lines, moved verbatim out of `SettingsScreen.tsx:1133-1140`.
 * Hermes has no WebAssembly, so iOS/Android keep the TypeScript implementation
 * in `services/currency.ts` — including its first-launch region seed.
 *
 * The web variant is driven by the `display_currency` core, which is the point:
 * `loadCurrency()` runs `seedFromDeviceLocale()`, so calling it from this screen
 * on web put a SECOND first-launch seed (and a second writer of
 * `vela.displayCurrency`) next to the core's (spec 017).
 */
import { useEffect, useState } from 'react';

import { getCurrencyCode, getRate, loadCurrency, setCurrency } from '@/services/currency';

import type { SettingsCurrencyController } from './settings-currency-controller-types';

export function useSettingsCurrency(): SettingsCurrencyController {
  const [code, setCode] = useState(getCurrencyCode());
  useEffect(() => { loadCurrency().then(setCode); }, []);

  const pick = async (next: string) => {
    await setCurrency(next);
    setCode(next);
    // Warm the rate so Home paints converted values immediately on return
    // instead of a USD-magnitude flash.
    getRate(next).catch(() => {});
  };

  return { code, pick };
}
