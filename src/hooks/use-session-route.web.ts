/**
 * The route guard's verdict — WEB, read straight off the Rust `session`
 * machine's view (spec 017, invariant ⑧: the core says what is ALLOWED, the
 * shell decides when and how to navigate).
 *
 * Same three verdicts as native, from the same resident session the wallet
 * context mirrors, so the guard and the wallet can never disagree about whether
 * storage has been read.
 */
import { useEffect, useState } from 'react';

import {
  ensureWalletSession,
  subscribeWalletSession,
  walletSessionView,
} from '@/services/wallet-state-core/session-resident.web';
import type { SessionView } from '@/services/wallet-state-core/generated/SessionView';

import type { SessionRouteName } from './session-controller-types';

export function useSessionRoute(): SessionRouteName {
  const [view, setView] = useState<SessionView>(walletSessionView);

  useEffect(() => {
    const unsubscribe = subscribeWalletSession(setView);
    ensureWalletSession();
    setView(walletSessionView());
    return unsubscribe;
  }, []);

  return view.allowed_route;
}
