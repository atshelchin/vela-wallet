/**
 * Constructs the `clear_signing` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/clear_signing.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the fetched module at import time, so the wasm is initialised
 * before the core is constructed here.
 *
 * One session per presented request (and one per batch leg): the machine
 * resolves ONE request at a time and supersedes anything in flight, which is
 * exactly what a sheet needs and exactly what a batch of legs must not share.
 * The descriptor / ERC-165 / decimals caches are per-session as a consequence —
 * where the TypeScript module held them as process singletons — so a batch
 * re-fetches a descriptor its sibling leg already had. That costs a request; it
 * cannot change a verdict, because every cached fact is a definitive one the
 * core would re-derive identically.
 *
 * `clear-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { ClearSigningCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  clearOperationFailure,
  executeClearOperation,
} from '@/services/wallet-state-core/clear-executor.web';
import type { ClearShellResult } from './generated/ClearShellResult';
import type { ClearSigningEvent } from './generated/ClearSigningEvent';
import type { ClearSigningView } from './generated/ClearSigningView';
import type { ClearEffect, ClearSigningSessionOptions } from './clear-types';

export type ClearSigningSession = EffectLoop<ClearSigningEvent>;

export function createClearSigningSession(
  options: ClearSigningSessionOptions,
): ClearSigningSession {
  return createJsonWasmShell<ClearSigningView, ClearSigningEvent, ClearEffect, ClearShellResult>(
    new ClearSigningCore(),
    {
      onView: options.onView,
      execute: (effect, signal) => executeClearOperation(effect, signal),
      toFailure: (effect, error) => clearOperationFailure(effect, error),
      onError: options.onError,
    },
  );
}
