/**
 * `tx_tracker` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the three TypeScript pollers this machine unifies — `waitForReceipt`
 * (`safe-transaction.ts`), `tx-reconciler.ts` and the dApp startup recovery
 * scan in `dapp-connection.tsx` — and never import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `token-trust-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { TrackEvent } from './generated/TrackEvent';
import type { TxTrackerSessionOptions } from './tx-tracker-types';

export type TxTrackerSession = EffectLoop<TrackEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createTxTrackerSession(_options: TxTrackerSessionOptions): TxTrackerSession {
  throw new Error(UNAVAILABLE);
}
