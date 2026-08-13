/**
 * Constructs the `dapp_session` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/dapp_session.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here.
 */

import '@/services/vela-core';
import { DappSessionCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createDsessExecutor } from '@/services/wallet-state-core/dsess-executor';
import type { DsessEvent } from './generated/DsessEvent';
import type { DsessShellResult } from './generated/DsessShellResult';
import type { DsessView } from './generated/DsessView';
import type { DsessEffect, DappSessionOptions } from './dsess-types';

export type DappSessionCoreSession = EffectLoop<DsessEvent>;

export function createDappSession(options: DappSessionOptions): DappSessionCoreSession {
  // One executor per session: the `session_ref` → transport table and the
  // timer-id → handle table ARE the shell half of this machine's identity, and
  // they must die with the core that minted the refs. A second core sharing
  // them would be a second writer on the same live sockets.
  const executor = createDsessExecutor(options.ports);
  return createJsonWasmShell<DsessView, DsessEvent, DsessEffect, DsessShellResult>(
    new DappSessionCore(),
    {
      onView: options.onView,
      execute: executor.execute,
      toFailure: executor.toFailure,
      onError: options.onError,
    },
  );
}
