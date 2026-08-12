/**
 * `manage_tokens` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the TypeScript controller (`use-manage-tokens.ts`) and never import this
 * module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { MtokEvent } from './generated/MtokEvent';
import type { ManageTokensSessionOptions } from './manage-tokens-types';

export type ManageTokensSession = EffectLoop<MtokEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createManageTokensSession(
  _options: ManageTokensSessionOptions,
): ManageTokensSession {
  throw new Error(UNAVAILABLE);
}
