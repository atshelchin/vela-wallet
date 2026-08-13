/**
 * Recently-opened dApps — WEB, driven by the portable Rust state machine
 * (spec 017, `rust/crates/vela-core/src/app/browser_history.rs`).
 *
 * This file owns no rules. The dedupe by origin, the title/favicon fallback
 * chain, the cap, the newest-first sort and the write-vs-remove choice are all
 * decided (and tested) in Rust; the shell only injects the clock and renders
 * what the core projects.
 *
 * ONE module-level session is shared by every mount, the
 * `use-display-currency.web.ts` pattern. The machine is a mirror of the store
 * hydrated once at `Start` ("re-reading mid-session could only replay what this
 * core already wrote"), which is only true while a single core owns the key —
 * and this history is written from the browser route while it is read from the
 * Connections panel, so a per-mount session would let two mirrors of the same
 * key drift apart.
 */
import { useCallback, useEffect, useState } from 'react';

import { createBrowserHistorySession } from '@/services/wallet-state-core/browser-history-session';
import type { BhistEntry } from '@/services/wallet-state-core/generated/BhistEntry';
import type { BhistView } from '@/services/wallet-state-core/generated/BhistView';

import type {
  BrowserHistoryController,
  BrowserHistoryRow,
  BrowserVisit,
} from './browser-history-controller-types';

/** Wire shape → the row shape the sheet renders (and the store's field names). */
function toRow(entry: BhistEntry): BrowserHistoryRow {
  return {
    origin: entry.origin,
    url: entry.url,
    host: entry.host,
    title: entry.title,
    favicon: entry.favicon,
    lastVisited: entry.last_visited_ms,
  };
}

// The machine's own initial view is an empty list — mirrored here only until
// the session's first committed view arrives.
let current: BrowserHistoryRow[] = [];
const listeners = new Set<(rows: BrowserHistoryRow[]) => void>();
let session: ReturnType<typeof createBrowserHistorySession> | null = null;

function ensureSession() {
  if (!session) {
    session = createBrowserHistorySession({
      onView: (view: BhistView) => {
        current = view.entries.map(toRow);
        listeners.forEach((listener) => listener(current));
      },
      onError: (error) => console.error('[browser-history] core fault:', error),
    });
    // Hydrate the mirror from storage. `Start` is single-shot in the core, so
    // later mounts re-use the already-hydrated session.
    session.start({ type: 'start' });
  }
  return session;
}

export function useBrowserHistory(): BrowserHistoryController {
  const [entries, setEntries] = useState<BrowserHistoryRow[]>(() => current);

  useEffect(() => {
    listeners.add(setEntries);
    ensureSession();
    setEntries(current);
    return () => {
      listeners.delete(setEntries);
    };
  }, []);

  // The mirror is authoritative and pushes every change to all mounts, so a
  // refresh only re-syncs this component with it (and makes sure the session
  // exists, for a caller that refreshes before its subscribe effect runs).
  const refresh = useCallback(() => {
    ensureSession();
    setEntries(current);
  }, []);

  const recordVisit = useCallback((visit: BrowserVisit) => {
    ensureSession().dispatch({
      type: 'visit_recorded',
      url: visit.url,
      title: visit.title ?? null,
      favicon: visit.favicon ?? null,
      now_ms: Date.now(),
    });
  }, []);

  const remove = useCallback((origin: string) => {
    ensureSession().dispatch({ type: 'delete_origin', origin });
  }, []);

  const clearAll = useCallback(() => {
    ensureSession().dispatch({ type: 'clear_all' });
  }, []);

  return { entries, refresh, recordVisit, remove, clearAll };
}
