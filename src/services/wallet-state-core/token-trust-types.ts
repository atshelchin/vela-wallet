/**
 * Platform-neutral types for the `token_trust` core (spec 017, group G7).
 *
 * Standalone for the reason `types.ts` states for itself: the native stub
 * (`token-trust-session.ts`) needs these declarations, and importing them from
 * a `.web` module would drag the web-only service graph into the native
 * bundle. One module per machine also keeps the parallel integration waves
 * from editing one file.
 */

import type { TrustOperation } from './generated/TrustOperation';
import type { TrustView } from './generated/TrustView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type TrustEffect = { id: number; operation: TrustOperation };

export type TokenTrustSessionOptions = SessionOptions<TrustView>;
