/**
 * Constructs the `tx_tracker` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/tx_tracker.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here.
 */

import '@/services/vela-core';
import { TxTrackerCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createTxTrackerExecutor } from '@/services/wallet-state-core/tx-tracker-executor';
import type { TrackEvent } from './generated/TrackEvent';
import type { TrackShellResult } from './generated/TrackShellResult';
import type { TrackView } from './generated/TrackView';
import type { TrackEffect, TxTrackerSessionOptions } from './tx-tracker-types';

export type TxTrackerSession = EffectLoop<TrackEvent>;

export function createTxTrackerSession(options: TxTrackerSessionOptions): TxTrackerSession {
  // One executor per session: its receipt-log and sender caches are the memory
  // that turns the core's payload-free `NotifyConfirmed` into the authentic
  // `ReceiptLogsConfirmed` token_trust demands, and they must die with the
  // core that populated them.
  const executor = createTxTrackerExecutor(options.ports);
  return createJsonWasmShell<TrackView, TrackEvent, TrackEffect, TrackShellResult>(
    new TxTrackerCore(),
    {
      onView: options.onView,
      execute: executor.execute,
      toFailure: executor.toFailure,
      onError: options.onError,
    },
  );
}
