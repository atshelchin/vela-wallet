/**
 * Sign-out confirmation — NATIVE, today's `SettingsScreen` handlers verbatim.
 *
 * `handleOpenSignOut` awaits `hasPendingUploads()` before opening the dialog,
 * and dies before `setShowSignOut(true)` if that read throws — so a failed
 * check simply never opens the dialog. Ported unchanged; on web
 * (`use-session-signout.web.ts`) the same sequence is the Rust `session`
 * machine's `SignOut → CheckPendingUploads → confirm dialog` path.
 */
import { useCallback, useState } from 'react';

import { useWallet } from '@/models/wallet-state';
import { hasPendingUploads } from '@/services/storage';

import type { SessionSignOutController } from './session-controller-types';

export function useSessionSignOut(): SessionSignOutController {
  const { dispatch } = useWallet();
  const [visible, setVisible] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const open = useCallback(() => {
    void (async () => {
      const pending = await hasPendingUploads();
      setPendingSync(pending);
      setVisible(true);
    })();
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  const confirm = useCallback(() => {
    setSigningOut(true);
    dispatch({ type: 'LOGOUT' });
  }, [dispatch]);

  return { visible, pendingSync, signingOut, open, dismiss, confirm };
}
