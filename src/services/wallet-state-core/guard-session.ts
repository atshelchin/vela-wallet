/**
 * Constructs the `approval_guard` core and wires it to the web shell — WEB
 * entry (spec 017, `rust/crates/vela-core/src/app/approval_guard.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the base64-embedded module at import time, so the wasm is
 * initialised before the core is constructed here.
 *
 * `guard-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { ApprovalGuardCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createGuardExecutor, guardOperationFailure } from '@/services/wallet-state-core/guard-executor';
import type { GuardEvent } from './generated/GuardEvent';
import type { GuardShellResult } from './generated/GuardShellResult';
import type { GuardView } from './generated/GuardView';
import type { ApprovalGuardSessionOptions, GuardEffect } from './guard-types';

export type ApprovalGuardSession = EffectLoop<GuardEvent>;

export function createApprovalGuardSession(
  options: ApprovalGuardSessionOptions,
): ApprovalGuardSession {
  const execute = createGuardExecutor();
  return createJsonWasmShell<GuardView, GuardEvent, GuardEffect, GuardShellResult>(
    new ApprovalGuardCore(),
    {
      onView: options.onView,
      execute,
      toFailure: guardOperationFailure,
      onError: options.onError,
    },
  );
}
