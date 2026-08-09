/**
 * Constructs the `network_admin` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/network_admin.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the base64-embedded module at import time, so the wasm is
 * initialised before the core is constructed here.
 *
 * `network-admin-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { NetworkAdminCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  executeNetworkAdminOperation,
  networkAdminOperationFailure,
} from './network-admin-executor.web';
import type { NetEvent } from './generated/NetEvent';
import type { NetShellResult } from './generated/NetShellResult';
import type { NetView } from './generated/NetView';
import type { NetEffect, NetworkAdminSessionOptions } from './network-admin-types';

export type NetworkAdminSession = EffectLoop<NetEvent>;

export function createNetworkAdminSession(
  options: NetworkAdminSessionOptions,
): NetworkAdminSession {
  return createJsonWasmShell<NetView, NetEvent, NetEffect, NetShellResult>(
    new NetworkAdminCore(),
    {
      onView: options.onView,
      execute: executeNetworkAdminOperation,
      toFailure: networkAdminOperationFailure,
      onError: options.onError,
    },
  );
}
