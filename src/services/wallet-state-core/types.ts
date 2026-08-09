/**
 * Platform-neutral types for the wallet-state cores (spec 016).
 *
 * Separate from `executors.web.ts` on purpose: the native stub (`session.ts`)
 * needs these declarations, and importing them from a `.web` module would drag
 * the web-only service graph into the native bundle — where the wasm cannot
 * load at all. Same split as `onboarding-core/types.ts`.
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
