/**
 * Sign-out confirmation — NATIVE, today's `SettingsScreen` handlers verbatim.
 *
 * `handleOpenSignOut` awaits `hasPendingUploads()` before opening the dialog,
 * and dies before `setShowSignOut(true)` if that read throws — so a failed
 * check simply never opens the dialog. Ported unchanged; on web
 * (`use-session-signout.web.ts`) the same sequence is the Rust `session`
 * machine's `SignOut → CheckPendingUploads → confirm dialog` path.
 *
 * One deliberate change from the original handler: the confirm also calls
 * `clearSignedInWallet()`. The `LOGOUT` reducer only ever cleared memory, so a
 * relaunch restored the session the user had just ended — and the dialog's copy
 * now states, in fifteen languages, that this device stops being signed in.
 * Copy that a platform does not honour is the defect, not the fix, so both
 * platforms end the sign-in on disk. The reducer itself is untouched.
 */
import { useCallback, useState } from 'react';

import { useWallet } from '@/models/wallet-state';
import { clearSignedInWallet, hasPendingUploads } from '@/services/storage';

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
    // Best effort and un-awaited, like the core's `ClearSignedInWallet`: the
    // session is signed out in memory whatever the disk does, and the index
    // persist effect is gated on `hasWallet`, so the LOGOUT below cannot write
    // either key back after this.
    void clearSignedInWallet();
    dispatch({ type: 'LOGOUT' });
  }, [dispatch]);

  return { visible, pendingSync, signingOut, open, dismiss, confirm };
}
