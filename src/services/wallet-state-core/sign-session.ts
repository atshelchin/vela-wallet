/**
 * Constructs the `sign_request` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/sign_request.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the fetched module at import time, so the wasm is initialised
 * before the core is constructed here.
 *
 * `sign-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { SignRequestCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createSignExecutor } from '@/services/wallet-state-core/sign-executor';
import type { SignEvent } from './generated/SignEvent';
import type { SignShellResult } from './generated/SignShellResult';
import type { SignView } from './generated/SignView';
import type { SignEffect, SignRequestSessionOptions } from './sign-types';

export type SignRequestSession = EffectLoop<SignEvent>;

export function createSignRequestSession(
  options: SignRequestSessionOptions,
): SignRequestSession {
  const executor = createSignExecutor(options.ports);
  return createJsonWasmShell<SignView, SignEvent, SignEffect, SignShellResult>(
    new SignRequestCore(),
    {
      onView: options.onView,
      execute: (effect) => executor.execute(effect),
      toFailure: (effect, error) => executor.toFailure(effect, error),
      onError: options.onError,
    },
  );
}
