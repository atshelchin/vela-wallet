/**
 * Platform-neutral types for the `batch_import` core (spec 017, group G5).
 *
 * Separate from `batch-import-executor.ts` for the same reason
 * `types.ts` is separate from `executors.ts`: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 */

import type { BatchOperation } from './generated/BatchOperation';
import type { BatchView } from './generated/BatchView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type BatchEffect = { id: number; operation: BatchOperation };

export type BatchSessionOptions = SessionOptions<BatchView>;
