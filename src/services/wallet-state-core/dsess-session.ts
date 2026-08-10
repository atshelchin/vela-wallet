/**
 * `dapp_session` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the TypeScript connection lifecycle in `src/models/dapp-connection.tsx`
 * (FR-202: native is untouched by spec 017) and never import this module at
 * runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `sign-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { DsessEvent } from './generated/DsessEvent';
import type { DappSessionOptions } from './dsess-types';

export type DappSessionCoreSession = EffectLoop<DsessEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createDappSession(_options: DappSessionOptions): DappSessionCoreSession {
  throw new Error(UNAVAILABLE);
}
