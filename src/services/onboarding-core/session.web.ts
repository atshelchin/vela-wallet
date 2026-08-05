/**
 * Constructs an onboarding core and wires it to the web shell — WEB entry point.
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the base64-embedded module at import time, so the wasm is
 * initialised before any core is constructed here. (Metro resolves that facade
 * to `index.web.ts` in this bundle.)
 *
 * `session.ts` is the native counterpart and throws: Hermes has no
 * WebAssembly, so the mobile app keeps its TypeScript implementation.
 */

import '@/services/vela-core';
import { CreateWalletCore, LoginCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createOnboardingExecutor, operationFailure } from './executor.web';
import type { CreateWalletSessionOptions, LoginSessionOptions, OnboardingEffect } from './types';
import type { CreateView } from './generated/CreateView';
import type { CreateWalletEvent } from './generated/CreateWalletEvent';
import type { LoginEvent } from './generated/LoginEvent';
import type { LoginView } from './generated/LoginView';
import type { ShellResult } from './generated/ShellResult';

export type CreateWalletSession = EffectLoop<CreateWalletEvent>;
export type LoginSession = EffectLoop<LoginEvent>;

export function createCreateWalletSession(
  options: CreateWalletSessionOptions,
): CreateWalletSession {
  const execute = createOnboardingExecutor(options.deps);
  return createJsonWasmShell<CreateView, CreateWalletEvent, OnboardingEffect, ShellResult>(
    new CreateWalletCore(),
    {
      onView: options.onView,
      execute,
      toFailure: operationFailure,
      onError: options.onError,
    },
  );
}

export function createLoginSession(options: LoginSessionOptions): LoginSession {
  const execute = createOnboardingExecutor(options.deps);
  return createJsonWasmShell<LoginView, LoginEvent, OnboardingEffect, ShellResult>(
    new LoginCore(),
    {
      onView: options.onView,
      execute,
      toFailure: operationFailure,
      onError: options.onError,
    },
  );
}
