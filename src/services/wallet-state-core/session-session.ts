/**
 * `session` core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the reducer + two effects inside `src/models/wallet-state.ts` and never
 * import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `browser-history-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { SessionEvent } from './generated/SessionEvent';
import type { WalletSessionOptions } from './session-types';

export type WalletSession = EffectLoop<SessionEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createWalletSession(_options: WalletSessionOptions): WalletSession {
  throw new Error(UNAVAILABLE);
}
