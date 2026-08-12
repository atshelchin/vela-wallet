/**
 * Platform-neutral types for the `session` core (spec 017, group G9).
 *
 * Standalone for the reason `browser-history-types.ts` states: the native stub
 * (`session-session.ts`) needs these declarations, and importing them from a
 * `.web` module would drag the web-only service graph into the native bundle.
 * One module per machine also keeps parallel integration waves off each other's
 * files — this one deliberately does NOT live in `types.ts` (the 016 trio's).
 */

import type { SessionOperation } from './generated/SessionOperation';
import type { SessionView } from './generated/SessionView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type SessionEffect = { id: number; operation: SessionOperation };

export type WalletSessionOptions = SessionOptions<SessionView>;
