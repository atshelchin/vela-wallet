/**
 * `balance_dashboard` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the balance half of `src/screens/wallet/useHomeController.ts` and never import
 * this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `session-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { BalanceEvent } from './generated/BalanceEvent';
import type { BalanceSessionOptions } from './balance-types';

export type BalanceSession = EffectLoop<BalanceEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createBalanceSession(_options: BalanceSessionOptions): BalanceSession {
  throw new Error(UNAVAILABLE);
}
