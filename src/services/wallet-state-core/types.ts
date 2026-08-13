/**
 * Platform-neutral types for the wallet-state cores (spec 016).
 *
 * Separate from `executors.ts` on purpose: the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it. Same split as `onboarding-core/types.ts`.
 */

import type { CurrencyOperation } from './generated/CurrencyOperation';
import type { CurrencyView } from './generated/CurrencyView';
import type { PaymentRequestOperation } from './generated/PaymentRequestOperation';
import type { PaymentRequestView } from './generated/PaymentRequestView';
import type { ReceiveWatchOperation } from './generated/ReceiveWatchOperation';
import type { ReceiveWatchView } from './generated/ReceiveWatchView';

/** One request from a core, carrying the id it will be answered by. */
export type CurrencyEffect = { id: number; operation: CurrencyOperation };
export type ReceiveWatchEffect = { id: number; operation: ReceiveWatchOperation };
export type PaymentRequestEffect = { id: number; operation: PaymentRequestOperation };

export type SessionOptions<View> = {
  /** Called with every view the core produces, including the first. */
  onView: (view: View) => void;
  /** A core-level fault (malformed event, bad JSON) — never a user-facing error. */
  onError?: (error: unknown) => void;
};

export type CurrencySessionOptions = SessionOptions<CurrencyView>;

export type ReceiveWatchSessionOptions = SessionOptions<ReceiveWatchView> & {
  /** The account whose balances the watcher polls. One session per account. */
  address: string;
};

export type PaymentRequestSessionOptions = SessionOptions<PaymentRequestView>;

/** The raw, untrusted `/pay` query — input to the synchronous validator. */
export interface RawPayQuery {
  to?: string;
  chain?: string;
  token?: string;
  amount?: string;
  sym?: string;
  dec?: string;
  net?: string;
}
