/**
 * `sign_request` core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the whole approve pipeline inside `src/models/dapp-connection.tsx` and never
 * import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `session-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { SignEvent } from './generated/SignEvent';
import type { SignRequestSessionOptions } from './sign-types';

export type SignRequestSession = EffectLoop<SignEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createSignRequestSession(
  _options: SignRequestSessionOptions,
): SignRequestSession {
  throw new Error(UNAVAILABLE);
}
