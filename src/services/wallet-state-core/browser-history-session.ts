/**
 * `browser_history` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * `src/services/browser-history.ts` (reached through `use-browser-history.ts`)
 * and never import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { BhistEvent } from './generated/BhistEvent';
import type { BrowserHistorySessionOptions } from './browser-history-types';

export type BrowserHistorySession = EffectLoop<BhistEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createBrowserHistorySession(
  _options: BrowserHistorySessionOptions,
): BrowserHistorySession {
  throw new Error(UNAVAILABLE);
}
