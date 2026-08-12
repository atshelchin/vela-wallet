/**
 * Recently-opened dApps — NATIVE controller.
 *
 * A thin wrapper over `services/browser-history.ts`, which stays the mobile
 * implementation: Hermes has no WebAssembly, so the Rust machine cannot run
 * here (FR-202). Every call and every refresh point is the one the callers made
 * inline before this hook existed, so iOS/Android behaviour is byte-identical.
 *
 * `use-browser-history.web.ts` is the web twin, driven by the
 * `browser_history` core.
 */
import { useCallback, useState } from 'react';

import {
  clearBrowserHistory,
  deleteBrowserHistory,
  getBrowserHistory,
  recordBrowserVisit,
} from '@/services/browser-history';

import type {
  BrowserHistoryController,
  BrowserHistoryRow,
  BrowserVisit,
} from './browser-history-controller-types';

export function useBrowserHistory(): BrowserHistoryController {
  const [entries, setEntries] = useState<BrowserHistoryRow[]>([]);

  const refresh = useCallback(() => {
    void getBrowserHistory().then(setEntries);
  }, []);

  const recordVisit = useCallback((visit: BrowserVisit) => {
    void recordBrowserVisit(visit, Date.now());
  }, []);

  const remove = useCallback(
    (origin: string) => {
      void deleteBrowserHistory(origin).then(refresh);
    },
    [refresh],
  );

  const clearAll = useCallback(() => {
    void clearBrowserHistory().then(refresh);
  }, [refresh]);

  return { entries, refresh, recordVisit, remove, clearAll };
}
