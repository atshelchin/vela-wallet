/**
 * Platform-neutral types for the `browser_history` core (spec 017, group G1).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. Keeping one module per
 * machine also keeps the parallel integration waves from editing one file.
 */

import type { BhistOperation } from './generated/BhistOperation';
import type { BhistView } from './generated/BhistView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type BhistEffect = { id: number; operation: BhistOperation };

export type BrowserHistorySessionOptions = SessionOptions<BhistView>;
