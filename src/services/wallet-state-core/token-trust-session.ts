/**
 * `token_trust` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the three TypeScript reports this machine unifies — `transfer-monitor.ts`,
 * `token-autoadd.ts` and `tx-simulation.ts`'s asymmetric trust judgment — and
 * never import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `browser-history-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { TrustEvent } from './generated/TrustEvent';
import type { TokenTrustSessionOptions } from './token-trust-types';

export type TokenTrustSession = EffectLoop<TrustEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createTokenTrustSession(
  _options: TokenTrustSessionOptions,
): TokenTrustSession {
  throw new Error(UNAVAILABLE);
}
