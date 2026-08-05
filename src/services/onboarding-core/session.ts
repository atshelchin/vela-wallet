/**
 * Onboarding core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly, so the portable
 * onboarding state machines cannot execute on iOS or Android. The mobile app
 * keeps its TypeScript implementation (`use-create-wallet.ts`,
 * `use-onboarding-login.ts`) and never imports this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `file-io.ts` / `file-io.web.ts`.
 *
 * The throw is the point: if a native code path ever reaches here, that is a
 * routing bug worth failing loudly on, not something to paper over.
 */

import type { CreateWalletSessionOptions, LoginSessionOptions } from './types';
import type { EffectLoop } from '@/services/crux/effect-loop';
import type { CreateWalletEvent } from './generated/CreateWalletEvent';
import type { LoginEvent } from './generated/LoginEvent';

export type CreateWalletSession = EffectLoop<CreateWalletEvent>;
export type LoginSession = EffectLoop<LoginEvent>;

const UNAVAILABLE =
  'onboarding-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createCreateWalletSession(_options: CreateWalletSessionOptions): CreateWalletSession {
  throw new Error(UNAVAILABLE);
}

export function createLoginSession(_options: LoginSessionOptions): LoginSession {
  throw new Error(UNAVAILABLE);
}
