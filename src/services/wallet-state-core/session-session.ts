/**
 * Constructs the `session` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/session.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the fetched module at import time, so the wasm is initialised
 * before the core is constructed here.
 */

import '@/services/vela-core';
import { SessionCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { executeSessionOperation, sessionOperationFailure } from './session-executor';
import type { SessionEvent } from './generated/SessionEvent';
import type { SessionShellResult } from './generated/SessionShellResult';
import type { SessionView } from './generated/SessionView';
import type { SessionEffect, WalletSessionOptions } from './session-types';

export type WalletSession = EffectLoop<SessionEvent>;

export function createWalletSession(options: WalletSessionOptions): WalletSession {
  return createJsonWasmShell<SessionView, SessionEvent, SessionEffect, SessionShellResult>(
    new SessionCore(),
    {
      onView: options.onView,
      execute: executeSessionOperation,
      toFailure: sessionOperationFailure,
      onError: options.onError,
    },
  );
}
