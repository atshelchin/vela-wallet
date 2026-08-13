/**
 * useBalancePrivacy — WEB. A mirror of `balance_dashboard`'s `hidden`, and
 * nothing else.
 *
 * `use-balance-privacy.ts` is the native counterpart: on Hermes there is no
 * wasm, so that module keeps the whole model — the persisted byte, the
 * first-write-wins hydrate race, the in-memory flag. On web all three belong to
 * the core (`balance_dashboard.rs`: `privacy_touched`, `Event::PrivacyToggled`,
 * `Event::PrivacyHydrated`), and `balance-resident.web.ts` performs the ONE
 * boot-time read that feeds it.
 *
 * Before this split the web app hydrated twice — once into the core, once into
 * the native store — and applied the "a toggle that races the read wins" rule on
 * both sides. Two writers of one decision is exactly the drift this seam exists
 * to remove; the surfaces that mask together (hero, holdings, balance detail,
 * account switcher, receipt toast) now read one answer.
 *
 * `getSnapshot` reads the resident's last committed view, which is the
 * `useSyncExternalStore` contract, not a render-time read of mutable module
 * state: it is only ever consulted through the store, and every mutation is
 * announced through `subscribe`.
 */
import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  balanceView,
  dispatchBalance,
  ensureBalanceDashboard,
  subscribeBalanceDashboard,
} from '@/services/wallet-state-core/balance-resident';
import { BALANCE_PRIVACY_KEY } from '@/services/wallet-state-core/balance-types';

/**
 * Persist the byte without going through the core.
 *
 * Kept only because the native module exports it and the platform pair must
 * agree on a shape; on web the core's `WritePrivacy` operation is the writer and
 * calls straight into AsyncStorage, so nothing in the app calls this. It writes
 * the same key, so a caller that appears later cannot invent a second one.
 */
export function setBalanceHidden(next: boolean): void {
  AsyncStorage.setItem(BALANCE_PRIVACY_KEY, next ? '1' : '0').catch(() => {});
}

export function useBalancePrivacy(): { hidden: boolean; toggle: () => void } {
  const hidden = useSyncExternalStore(
    (cb) => {
      // Mirrors the native store's `hydrate()` on first subscribe: the resident
      // is idempotent and performs the single boot-time read.
      ensureBalanceDashboard();
      return subscribeBalanceDashboard(cb);
    },
    () => balanceView().hidden,
    () => balanceView().hidden,
  );
  const toggle = useCallback(() => { dispatchBalance({ type: 'privacy_toggled' }); }, []);
  return { hidden, toggle };
}
