/**
 * Sign-out confirmation — WEB, driven by the Rust `session` machine
 * (spec 017, `rust/crates/vela-core/src/app/session.rs`).
 *
 * This file owns no rules. `SignOut` runs the pending-upload check, the dialog
 * exists only once that check has ANSWERED (invariant ⑤: no unwarned logout
 * path is reachable), a check that throws leaves it closed, and
 * `SignOutConfirmed` is inert unless the dialog is open. Logout now also ends
 * the sign-in on disk (016 inventory open question 2, decided in 017): the core
 * emits `ClearSignedInWallet` + `ClearExtensionCache`, which drop the stored
 * account list and active index — and nothing else, because everything else
 * belongs to the account and comes back with the passkey.
 *
 * Native keeps its own `LOGOUT` reducer path unchanged (FR-202), so this
 * behaviour is web-only for now.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  dispatchWalletSession,
  ensureWalletSession,
  subscribeWalletSession,
  walletSessionView,
} from '@/services/wallet-state-core/session-resident';
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
