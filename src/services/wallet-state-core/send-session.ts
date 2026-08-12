/**
 * `send` core session — NATIVE entry point, and deliberately unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the whole Send flow inside `src/screens/wallet/useSendController.ts` and never
 * import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `sign-session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { SendEvent } from './generated/SendEvent';
import type { SendSessionOptions } from './send-types';

export type SendSession = EffectLoop<SendEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createSendSession(_options: SendSessionOptions): SendSession {
  throw new Error(UNAVAILABLE);
}
