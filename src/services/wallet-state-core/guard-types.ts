/**
 * Platform-neutral types for the `approval_guard` core (spec 017,
 * `rust/crates/vela-core/src/app/approval_guard.rs`).
 *
 * Standalone for the reason `types.ts` states for itself: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 */

import type { GuardOperation } from './generated/GuardOperation';
import type { GuardView } from './generated/GuardView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type GuardEffect = { id: number; operation: GuardOperation };

export type ApprovalGuardSessionOptions = SessionOptions<GuardView>;
