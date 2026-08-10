/**
 * Platform-neutral types for the `approval_guard` core (spec 017,
 * `rust/crates/vela-core/src/app/approval_guard.rs`).
 *
 * Standalone for the reason `types.ts` states for itself: the native stub
 * (`guard-session.ts`) needs these declarations, and importing them from a
 * `.web` module would drag the web-only service graph into the native bundle.
 */

import type { GuardOperation } from './generated/GuardOperation';
import type { GuardView } from './generated/GuardView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type GuardEffect = { id: number; operation: GuardOperation };

export type ApprovalGuardSessionOptions = SessionOptions<GuardView>;
