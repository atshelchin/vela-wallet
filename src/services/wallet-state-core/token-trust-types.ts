/**
 * Platform-neutral types for the `token_trust` core (spec 017, group G7).
 *
 * Standalone for the reason `types.ts` states for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. One module per machine also keeps the parallel integration waves
 * from editing one file.
 */

import type { TrustOperation } from './generated/TrustOperation';
import type { TrustView } from './generated/TrustView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type TrustEffect = { id: number; operation: TrustOperation };

export type TokenTrustSessionOptions = SessionOptions<TrustView>;
