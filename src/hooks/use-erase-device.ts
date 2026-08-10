/**
 * "Erase this device" — NATIVE.
 *
 * The erase itself is `eraseDeviceData()`; this hook owns only the
 * confirmation's lifecycle and what happens after. The order is the point:
 *
 *   1. erase, and WAIT for it to verify;
 *   2. only then drop the in-memory session and navigate.
 *
 * Reversing those two would sign the user out of a device that still holds
 * their history — the failure mode this feature exists to prevent — so a
 * rejected erase leaves the dialog open with `failed` set and changes nothing
 * else.
 *
 * `LOGOUT` here is memory-only by construction: the two keys sign-out would
 * clear are already gone, and the reducer's persist effect is gated on
 * `hasWallet`, so nothing can write them back.
 *
 * Known residue, native only: the TypeScript services that keep their own
 * module-level caches (contacts, the balance cache, avatar style, colour
 * scheme, text scale, language, currency) still hold what they read before the
 * erase, until the app is next launched. The disk is already empty, so nothing
 * re-reads it and nothing new is written; the process simply keeps showing the
 * user their own preferences for the rest of its life. Web has no such window
 * — `use-erase-device.web.ts` restarts the process, which it must, because
 * there the resident cores hold the erased data itself rather than a
 * preference.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useWallet } from '@/models/wallet-state';
import { eraseDeviceData } from '@/services/erase-device';

import type { EraseDeviceController } from './erase-device-controller-types';

export function useEraseDevice(): EraseDeviceController {
  const { dispatch } = useWallet();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = useCallback(() => {
    setFailed(false);
    setVisible(true);
  }, []);

  // Inert mid-erase: there is no dismiss that abandons a partially erased
  // device to a screen that still believes it has a wallet.
  const dismiss = useCallback(() => {
    if (!erasing) setVisible(false);
  }, [erasing]);

  const confirm = useCallback(() => {
    setErasing(true);
    setFailed(false);
    void (async () => {
      try {
        await eraseDeviceData();
      } catch {
        // Nothing is signed out and nothing is navigated: the device still
        // holds data, and the dialog says exactly that.
        setErasing(false);
        setFailed(true);
        return;
      }
      dispatch({ type: 'LOGOUT' });
      setVisible(false);
      setErasing(false);
      router.replace('/');
    })();
  }, [dispatch, router]);

  return { visible, erasing, failed, open, dismiss, confirm };
}
