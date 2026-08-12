/**
 * `clear_signing` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * `src/services/clear-signing.ts` / `siwe.ts` / `decode-sign-message.ts`
 * (reached through `use-clear-signing.ts`) and never import this module at
 * runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `browser-history-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { ClearSigningEvent } from './generated/ClearSigningEvent';
import type { ClearSigningSessionOptions } from './clear-types';

export type ClearSigningSession = EffectLoop<ClearSigningEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createClearSigningSession(
  _options: ClearSigningSessionOptions,
): ClearSigningSession {
  throw new Error(UNAVAILABLE);
}
