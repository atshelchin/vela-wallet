/**
 * Constructs the `fee_policy` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/fee_policy.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the module at import time, so the wasm is initialised before
 * the core is constructed here.
 *
 * `fee-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { FeePolicyCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createFeeExecutor, feeOperationFailure } from './fee-executor';
import type { FeeEvent } from './generated/FeeEvent';
import type { FeeShellResult } from './generated/FeeShellResult';
import type { FeeView } from './generated/FeeView';
import type { FeeEffect, FeeSessionOptions } from './fee-types';

export type FeeSession = EffectLoop<FeeEvent>;

export function createFeeSession(options: FeeSessionOptions): FeeSession {
  return createJsonWasmShell<FeeView, FeeEvent, FeeEffect, FeeShellResult>(new FeePolicyCore(), {
    onView: options.onView,
    execute: createFeeExecutor(options),
    toFailure: feeOperationFailure,
    onError: options.onError,
  });
}
