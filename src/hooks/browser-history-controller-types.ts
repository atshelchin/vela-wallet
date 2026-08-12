/**
 * The shape the browser-history controller returns on every platform.
 *
 * A standalone module for the same reason `receive-controller-types.ts` is one:
 * a platform pair (`use-browser-history.ts` / `.web.ts`) must never import its
 * own base file — on web, Metro resolves that specifier back to the `.web.ts`
 * variant itself, and a self-referential re-export recurses at module init.
 * Both variants import from here instead.
 */

/** What the WebView observed once a page settled. */
export interface BrowserVisit {
  url: string;
  title?: string;
  favicon?: string;
}

/**
 * One visited dApp as the UI renders it — field-for-field the stored
 * `BrowserHistoryEntry`, so the sheet's markup is unchanged on both platforms.
 */
export interface BrowserHistoryRow {
  /** Origin (`scheme://host`) — the dedupe key, and the delete key. */
  origin: string;
  url: string;
  host: string;
  title: string;
  /** Favicon URL ('' if none resolved). */
  favicon: string;
  /** epoch ms of the last visit. */
  lastVisited: number;
}

export interface BrowserHistoryController {
  /** Newest-first list of visited dApps. */
  entries: BrowserHistoryRow[];
  /** Re-read the list (native); re-sync from the shared mirror (web). */
  refresh: () => void;
  /** Record (or refresh) a visit. Fire-and-forget; the clock is injected here. */
  recordVisit: (visit: BrowserVisit) => void;
  /** Remove a single origin's entry. */
  remove: (origin: string) => void;
  /** Clear the whole history. */
  clearAll: () => void;
}
