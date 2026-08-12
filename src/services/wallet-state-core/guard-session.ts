/**
 * `approval_guard` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly. iOS and Android keep
 * the TypeScript controller (`src/hooks/use-approval-guard.ts`) and never
 * import this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports
 * to the base `.ts` variant. Same shape as `session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { GuardEvent } from './generated/GuardEvent';
import type { ApprovalGuardSessionOptions } from './guard-types';

export type ApprovalGuardSession = EffectLoop<GuardEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createApprovalGuardSession(
  _options: ApprovalGuardSessionOptions,
): ApprovalGuardSession {
  throw new Error(UNAVAILABLE);
}
