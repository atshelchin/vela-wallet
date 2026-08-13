/**
 * "Erase this device" — WEB.
 *
 * Same sequence as the native variant (erase, verify, then leave), with one
 * difference that is not cosmetic: the app is RESTARTED instead of navigated.
 *
 * On web the wallet state, the activity feed, balances, contacts, token trust,
 * the RPC pool and the dApp session are app-resident cores
 * (`*-resident.ts`), each holding its own copy of what was just deleted
 * for the life of the process. A `router.replace('/')` would land on
 * onboarding with every one of those still populated — an "erased" device that
 * can still print the transaction history. A document reload is the only thing
 * that drops all of them at once, and it costs nothing here: there is, by
 * definition, no unsaved state left to lose.
 *
 * `/` and not `/onboarding`: the index route is the session's own guard
 * (invariant ⑧ — the core rules, the shell performs), so the reloaded process
 * decides where to land from storage it has just re-read, exactly as a cold
 * start does.
 *
 * `erasing` is deliberately left true on success — the navigation is already
 * committed, and flipping the spinner off would flash a live-looking button
 * onto a page that is being torn down.
 *
 * Imports the shape module, never its own base file: on web Metro resolves
 * `./use-erase-device` back to this file and the import recurses.
 */
import { useCallback, useState } from 'react';

import { eraseDeviceData } from '@/services/erase-device';

import type { EraseDeviceController } from './erase-device-controller-types';

export function useEraseDevice(): EraseDeviceController {
  const [visible, setVisible] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = useCallback(() => {
    setFailed(false);
    setVisible(true);
  }, []);

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
        setErasing(false);
        setFailed(true);
        return;
      }
      // Static export, no base path: `/` is the index route.
      window.location.replace('/');
    })();
  }, []);

  return { visible, erasing, failed, open, dismiss, confirm };
}
