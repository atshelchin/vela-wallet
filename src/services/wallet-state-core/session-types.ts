/**
 * Platform-neutral types for the `session` core (spec 017, group G9).
 *
 * Standalone for the reason `browser-history-types.ts` states: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 * One module per machine also keeps parallel integration waves off each other's
 * files — this one deliberately does NOT live in `types.ts` (the 016 trio's).
 */

import type { SessionOperation } from './generated/SessionOperation';
import type { SessionView } from './generated/SessionView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type SessionEffect = { id: number; operation: SessionOperation };

export type WalletSessionOptions = SessionOptions<SessionView>;
