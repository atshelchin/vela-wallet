/**
 * The resident `token_trust` session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * Hermes has no WebAssembly. iOS and Android keep `transfer-monitor.ts`,
 * `token-autoadd.ts` and `tx-simulation.ts`'s asymmetric judgment and never
 * import this module at runtime; it exists so the platform pair resolves
 * (`tsc` resolves a `.web.ts`'s imports to the base `.ts`).
 */

import type { CustomToken } from '@/models/types';
import type { TrustIncomingView } from './generated/TrustIncomingView';
import type { TrustAssetDelta } from './generated/TrustAssetDelta';
import type { TrustReceiptLog } from './generated/TrustReceiptLog';
import type { TrustSimJudgment } from './generated/TrustSimJudgment';

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function notifyHeldTokens(
  _address: string,
  _chainId: number,
  _tokens: string[],
): void {
  throw new Error(UNAVAILABLE);
}

export function notifyCustomTokensLoaded(_tokens: CustomToken[]): void {
  throw new Error(UNAVAILABLE);
}

export function notifyReceiptLogsConfirmed(
  _from: string,
  _chainId: number,
  _logs: TrustReceiptLog[],
): void {
  throw new Error(UNAVAILABLE);
}

export function primeRegistry(_chainIds: number[]): Promise<void> {
  throw new Error(UNAVAILABLE);
}

export function pollIncoming(
  _address: string,
  _chainIds: number[],
): Promise<TrustIncomingView[]> {
  throw new Error(UNAVAILABLE);
}

export function judgeSimDeltas(
  _address: string,
  _chainId: number,
  _deltas: TrustAssetDelta[],
): Promise<TrustSimJudgment[]> {
  throw new Error(UNAVAILABLE);
}
