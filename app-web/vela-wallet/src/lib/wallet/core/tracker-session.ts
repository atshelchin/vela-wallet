/**
 * Constructs the `tx_tracker` core and wires it to the web shell (spec 026
 * Phase 4; `rust/crates/vela-core/src/app/tx_tracker.rs`).
 *
 * Ported from src/services/wallet-state-core/tx-tracker-session.ts @ f9bcb278.
 * ONE executor per session: its receipt-log and sender caches are the memory
 * that turns the core's payload-free `notify_confirmed` into the authentic
 * `receipt_logs_confirmed` token_trust demands, and they must die with the
 * core that populated them.
 */
import { TxTrackerCore } from '$lib/core/client';
import type { EffectLoop } from '$lib/core/effect-loop';
import { createJsonWasmShell } from '$lib/core/json-shell';
import type { TrackEvent } from '$lib/core/generated/TrackEvent';
import type { TrackShellResult } from '$lib/core/generated/TrackShellResult';
import type { TrackView } from '$lib/core/generated/TrackView';
import { createTxTrackerExecutor } from './tracker-executor';
import type { TrackEffect, TxTrackerSessionOptions } from './tracker-types';

export type TxTrackerSession = EffectLoop<TrackEvent>;

export function createTxTrackerSession(options: TxTrackerSessionOptions): TxTrackerSession {
	const executor = createTxTrackerExecutor(options.ports);
	return createJsonWasmShell<TrackView, TrackEvent, TrackEffect, TrackShellResult>(
		new TxTrackerCore(),
		{
			onView: options.onView,
			execute: executor.execute,
			toFailure: executor.toFailure,
			onError: options.onError
		}
	);
}
