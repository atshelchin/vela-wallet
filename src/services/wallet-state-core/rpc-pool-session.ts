/**
 * Constructs the `rpc_pool` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/rpc_pool.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here.
 */

import '@/services/vela-core';
import { RpcPoolCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createRpcPoolExecutor } from './rpc-pool-executor';
import type { RpcEvent } from './generated/RpcEvent';
import type { RpcShellResult } from './generated/RpcShellResult';
import type { RpcPoolView } from './generated/RpcPoolView';
import type { RpcPoolEffect, RpcPoolSessionOptions } from './rpc-pool-types';

export type RpcPoolSession = EffectLoop<RpcEvent>;

export function createRpcPoolSession(options: RpcPoolSessionOptions): RpcPoolSession {
  const executor = createRpcPoolExecutor(options.registry);
  return createJsonWasmShell<RpcPoolView, RpcEvent, RpcPoolEffect, RpcShellResult>(
    new RpcPoolCore(),
    {
      onView: options.onView,
      execute: (effect) => executor.execute(effect),
      toFailure: (effect, error) => executor.toFailure(effect, error),
      onError: options.onError,
    },
  );
}
