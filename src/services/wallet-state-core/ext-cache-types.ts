/**
 * Platform-neutral types for the `ext_cache` core (spec 017, group G4).
 *
 * Standalone, and NOT folded into `types.ts`, for the reason that file states
 * for itself: the native stub (`ext-cache-session.ts`) needs these
 * declarations, and importing them from a `.web` module would drag the
 * web-only service graph into the native bundle. Keeping one module per
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
