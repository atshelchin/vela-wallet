/**
 * `ext_cache` core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * `src/services/app-group-account-sync.ts` (reached through
 * `use-ext-cache.ts`) and never import this module at runtime — which is also
 * why the ONE platform that actually has an App Group container is the one that
 * never runs the core.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { ExtCacheEvent } from './generated/ExtCacheEvent';
import type { ExtCacheSessionOptions } from './ext-cache-types';

export type ExtCacheSession = EffectLoop<ExtCacheEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createExtCacheSession(_options: ExtCacheSessionOptions): ExtCacheSession {
  throw new Error(UNAVAILABLE);
}
