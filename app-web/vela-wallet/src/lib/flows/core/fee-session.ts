/**
 * Constructs the `fee_policy` core and wires it to the web shell (spec 026
 * Phase 4; `rust/crates/vela-core/src/app/fee_policy.rs`).
 *
 * Ported from src/services/wallet-state-core/fee-session.ts @ f9bcb278.
 * Callers `loadCore()` first; construction is synchronous once it is aboard.
 */
import { FeePolicyCore } from '$lib/core/client';
import type { EffectLoop } from '$lib/core/effect-loop';
import { createJsonWasmShell } from '$lib/core/json-shell';
import type { FeeEvent } from '$lib/core/generated/FeeEvent';
import type { FeeShellResult } from '$lib/core/generated/FeeShellResult';
import type { FeeView } from '$lib/core/generated/FeeView';
import { createFeeExecutor, feeOperationFailure } from './fee-executor';
import type { FeeEffect, FeeSessionOptions } from './fee-types';

export type FeeSession = EffectLoop<FeeEvent>;

export function createFeeSession(options: FeeSessionOptions): FeeSession {
	return createJsonWasmShell<FeeView, FeeEvent, FeeEffect, FeeShellResult>(new FeePolicyCore(), {
		onView: options.onView,
		execute: createFeeExecutor(options),
		toFailure: feeOperationFailure,
		onError: options.onError
	});
}
