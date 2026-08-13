/**
 * Platform-neutral types for the `network_admin` core (spec 017, group G6).
 *
 * Standalone for the reason `browser-history-types.ts` states: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 * One module per machine also keeps parallel integration waves off each other's
 * files.
 */

import type { NetOperation } from './generated/NetOperation';
import type { NetView } from './generated/NetView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type NetEffect = { id: number; operation: NetOperation };

export type NetworkAdminSessionOptions = SessionOptions<NetView>;
