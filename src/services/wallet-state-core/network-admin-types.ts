/**
 * Platform-neutral types for the `network_admin` core (spec 017, group G6).
 *
 * Standalone for the reason `browser-history-types.ts` states: the native stub
 * (`network-admin-session.ts`) needs these declarations, and importing them from
 * a `.web` module would drag the web-only service graph into the native bundle.
 * One module per machine also keeps parallel integration waves off each other's
 * files.
 */

import type { NetOperation } from './generated/NetOperation';
import type { NetView } from './generated/NetView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type NetEffect = { id: number; operation: NetOperation };

export type NetworkAdminSessionOptions = SessionOptions<NetView>;
