/**
 * Sign-out confirmation — WEB, driven by the Rust `session` machine
 * (spec 017, `rust/crates/vela-core/src/app/session.rs`).
 *
 * This file owns no rules. `SignOut` runs the pending-upload check, the dialog
 * exists only once that check has ANSWERED (invariant ⑤: no unwarned logout
 * path is reachable), a check that throws leaves it closed, and
 * `SignOutConfirmed` is inert unless the dialog is open. Logout itself is zero
 * operations — memory only, exactly as today, because `storage.clearAll()` has
 * no call site (016 inventory open question 2 owns whether that changes).
 */
import { useCallback, useEffect, useState } from 'react';

import {
  dispatchWalletSession,
  ensureWalletSession,
  subscribeWalletSession,
  walletSessionView,
} from '@/services/wallet-state-core/session-resident.web';
import type { SessionView } from '@/services/wallet-state-core/generated/SessionView';

import type { SessionSignOutController } from './session-controller-types';

export function useSessionSignOut(): SessionSignOutController {
  const [view, setView] = useState<SessionView>(walletSessionView);
  const [signingOut, setSigningOut] = useState(false);
  // The warning outlives the dialog's 300ms web exit animation: the sheet keeps
  // rendering after `visible` flips, and today's `pendingSync` state was never
  // reset, so relabelling the button mid-dismiss would be a new flicker.
  const [lastWarning, setLastWarning] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeWalletSession(setView);
    ensureWalletSession();
    setView(walletSessionView());
    return unsubscribe;
  }, []);

  const warning = view.sign_out?.pending_upload_warning ?? null;
  useEffect(() => {
    if (warning !== null) setLastWarning(warning);
  }, [warning]);

  const open = useCallback(() => dispatchWalletSession({ type: 'sign_out' }), []);
  const dismiss = useCallback(() => dispatchWalletSession({ type: 'sign_out_dismissed' }), []);
  const confirm = useCallback(() => {
    setSigningOut(true);
    dispatchWalletSession({ type: 'sign_out_confirmed' });
  }, []);

  return {
    visible: view.sign_out !== null,
    pendingSync: warning ?? lastWarning,
    signingOut,
    open,
    dismiss,
    confirm,
  };
}
