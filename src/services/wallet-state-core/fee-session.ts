/**
 * `fee_policy` core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * `estimateTransactionFee` in `services/safe-transaction.ts` — which is also
 * the reference side of the TS↔Rust parity corpus — and never import this
 * module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `balance-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { FeeEvent } from './generated/FeeEvent';
import type { FeeSessionOptions } from './fee-types';

export type FeeSession = EffectLoop<FeeEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createFeeSession(_options: FeeSessionOptions): FeeSession {
  throw new Error(UNAVAILABLE);
}
