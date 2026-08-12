/**
 * `rpc_pool` core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the TypeScript pool in `src/services/rpc-pool.ts` and never import this
 * module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `browser-history-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { RpcEvent } from './generated/RpcEvent';
import type { RpcPoolSessionOptions } from './rpc-pool-types';

export type RpcPoolSession = EffectLoop<RpcEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createRpcPoolSession(_options: RpcPoolSessionOptions): RpcPoolSession {
  throw new Error(UNAVAILABLE);
}
