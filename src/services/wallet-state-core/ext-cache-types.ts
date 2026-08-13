/**
 * Platform-neutral types for the `ext_cache` core (spec 017, group G4).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. Keeping one module per
 * machine also keeps the parallel integration waves from editing one file.
 */

import type { ExtCacheOperation } from './generated/ExtCacheOperation';
import type { ExtCacheView } from './generated/ExtCacheView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type ExtCacheEffect = { id: number; operation: ExtCacheOperation };

/**
 * The machine is headless — nothing renders its view (the Safari extension
 * reads the file, not React), so `onView` is a diagnostic hook.
 */
export type ExtCacheSessionOptions = SessionOptions<ExtCacheView>;
