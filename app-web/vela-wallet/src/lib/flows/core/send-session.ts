/**
 * Constructs the `send` core and wires it to the web shell (spec 026 Phase 4;
 * `rust/crates/vela-core/src/app/send.rs`).
 *
 * Ported from src/services/wallet-state-core/send-session.ts @ f9bcb278.
 * Callers `loadCore()` first; construction is synchronous once it is aboard.
 */
import { SendCore } from '$lib/core/client';
import type { EffectLoop } from '$lib/core/effect-loop';
import { createJsonWasmShell } from '$lib/core/json-shell';
import type { SendEvent } from '$lib/core/generated/SendEvent';
import type { SendShellResult } from '$lib/core/generated/SendShellResult';
import type { SendView } from '$lib/core/generated/SendView';
import { createSendExecutor } from './send-executor';
import type { SendEffect, SendSessionOptions } from './send-types';

export type SendSession = EffectLoop<SendEvent>;

export function createSendSession(options: SendSessionOptions): SendSession {
	const executor = createSendExecutor(options.ports);
	return createJsonWasmShell<SendView, SendEvent, SendEffect, SendShellResult>(new SendCore(), {
		onView: options.onView,
		execute: executor.execute,
		toFailure: executor.toFailure,
		onError: options.onError
	});
}
