/**
 * Platform-neutral types for the `browser_history` core (spec 017, group G1).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the native stub (`browser-history-session.ts`) needs these
 * declarations, and importing them from a `.web` module would drag the
 * web-only service graph into the native bundle. Keeping one module per
 * machine also keeps the parallel integration waves from editing one file.
 */

import type { BhistOperation } from './generated/BhistOperation';
import type { BhistView } from './generated/BhistView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type BhistEffect = { id: number; operation: BhistOperation };

export type BrowserHistorySessionOptions = SessionOptions<BhistView>;
