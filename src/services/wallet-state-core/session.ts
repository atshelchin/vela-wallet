/**
 * Wallet-state core sessions — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly, so the wallet-state
 * machines cannot execute on iOS or Android. The mobile app keeps its
 * TypeScript implementations (`use-display-currency.ts`,
 * `use-receive-watch.ts`, `use-receive-request.ts`, `use-pay-request.ts`) and
 * never imports this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports
 * to the base `.ts` variant. Same shape as `onboarding-core/session.ts`.
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { CurrencyEvent } from './generated/CurrencyEvent';
import type { PaymentRequestEvent } from './generated/PaymentRequestEvent';
import type { ReceiveWatchEvent } from './generated/ReceiveWatchEvent';
import type {
  CurrencySessionOptions,
  PaymentRequestSessionOptions,
  ReceiveWatchSessionOptions,
} from './types';

export type CurrencySession = EffectLoop<CurrencyEvent>;
export type ReceiveWatchSession = EffectLoop<ReceiveWatchEvent>;
export type PaymentRequestSession = EffectLoop<PaymentRequestEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createDisplayCurrencySession(_options: CurrencySessionOptions): CurrencySession {
  throw new Error(UNAVAILABLE);
}

export function createReceiveWatchSession(
  _options: ReceiveWatchSessionOptions,
): ReceiveWatchSession {
  throw new Error(UNAVAILABLE);
}

export function createPaymentRequestSession(
  _options: PaymentRequestSessionOptions,
): PaymentRequestSession {
  throw new Error(UNAVAILABLE);
}
