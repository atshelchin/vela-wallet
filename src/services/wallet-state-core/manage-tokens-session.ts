/**
 * Constructs the `manage_tokens` core and wires it to the web shell — WEB
 * entry (spec 017, `rust/crates/vela-core/src/app/manage_tokens.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the base64-embedded module at import time, so the wasm is
 * initialised before the core is constructed here.
 *
 * `manage-tokens-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { ManageTokensCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  createManageTokensExecutor,
  manageTokensOperationFailure,
} from './manage-tokens-executor';
import type { MtokEvent } from './generated/MtokEvent';
import type { MtokShellResult } from './generated/MtokShellResult';
import type { MtokView } from './generated/MtokView';
import type { ManageTokensEffect, ManageTokensSessionOptions } from './manage-tokens-types';

export type ManageTokensSession = EffectLoop<MtokEvent>;

export function createManageTokensSession(
  options: ManageTokensSessionOptions,
): ManageTokensSession {
  return createJsonWasmShell<MtokView, MtokEvent, ManageTokensEffect, MtokShellResult>(
    new ManageTokensCore(),
    {
      onView: options.onView,
      execute: createManageTokensExecutor(options),
      toFailure: manageTokensOperationFailure,
      onError: options.onError,
    },
  );
}
