/**
 * Constructs the `approval_guard` core and wires it to the web shell (spec 026
 * Phase 5; `rust/crates/vela-core/src/app/approval_guard.rs`).
 *
 * Ported from src/services/wallet-state-core/guard-session.ts @ f9bcb278.
 * One session per request (and one per batch leg). Callers `loadCore()` first.
 */
import { ApprovalGuardCore } from '$lib/core/client';
import type { EffectLoop } from '$lib/core/effect-loop';
import { createJsonWasmShell } from '$lib/core/json-shell';
import type { GuardEvent } from '$lib/core/generated/GuardEvent';
import type { GuardShellResult } from '$lib/core/generated/GuardShellResult';
import type { GuardView } from '$lib/core/generated/GuardView';
import { createGuardExecutor, guardOperationFailure } from './guard-executor';
import type { ApprovalGuardSessionOptions, GuardEffect } from './guard-types';

export type ApprovalGuardSession = EffectLoop<GuardEvent>;

export function createApprovalGuardSession(
	options: ApprovalGuardSessionOptions
): ApprovalGuardSession {
	return createJsonWasmShell<GuardView, GuardEvent, GuardEffect, GuardShellResult>(
		new ApprovalGuardCore(),
		{
			onView: options.onView,
			execute: createGuardExecutor(),
			toFailure: guardOperationFailure,
			onError: options.onError
		}
	);
}
