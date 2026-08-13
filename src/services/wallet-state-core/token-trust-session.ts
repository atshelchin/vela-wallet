/**
 * Constructs the `token_trust` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/token_trust.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here.
 */

import '@/services/vela-core';
import { TokenTrustCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  executeTokenTrustOperation,
  tokenTrustOperationFailure,
} from './token-trust-executor';
import type { TrustEvent } from './generated/TrustEvent';
import type { TrustShellResult } from './generated/TrustShellResult';
import type { TrustView } from './generated/TrustView';
import type { TrustEffect, TokenTrustSessionOptions } from './token-trust-types';

export type TokenTrustSession = EffectLoop<TrustEvent>;

export function createTokenTrustSession(
  options: TokenTrustSessionOptions,
): TokenTrustSession {
  return createJsonWasmShell<TrustView, TrustEvent, TrustEffect, TrustShellResult>(
    new TokenTrustCore(),
    {
      onView: options.onView,
      execute: executeTokenTrustOperation,
      toFailure: tokenTrustOperationFailure,
      onError: options.onError,
    },
  );
}
