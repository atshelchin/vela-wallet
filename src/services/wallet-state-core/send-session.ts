/**
 * Constructs the `send` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/send.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the fetched module at import time, so the wasm is initialised
 * before the core is constructed here.
 */

import '@/services/vela-core';
import { SendCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createSendExecutor } from '@/services/wallet-state-core/send-executor';
import type { SendEvent } from './generated/SendEvent';
import type { SendShellResult } from './generated/SendShellResult';
import type { SendView } from './generated/SendView';
import type { SendEffect, SendSessionOptions } from './send-types';

export type SendSession = EffectLoop<SendEvent>;

export function createSendSession(options: SendSessionOptions): SendSession {
  const executor = createSendExecutor(options.ports);
  return createJsonWasmShell<SendView, SendEvent, SendEffect, SendShellResult>(
    new SendCore(),
    {
      onView: options.onView,
      execute: (effect, signal) => executor.execute(effect, signal),
      toFailure: (effect, error) => executor.toFailure(effect, error),
      onError: options.onError,
    },
  );
}
