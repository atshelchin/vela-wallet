/**
 * The contract between `SigningSheet` and its fee half — platform-neutral.
 *
 * Standalone for the reason the other `*-controller-types.ts` files state:
 * the retired native stub needed these declarations without
 * the web service graph behind them. The stub is gone; the split stays
 * because the vocabulary has importers of its own and keeps the wasm graph
 * out of anything that must not load it.
 */

import type { TransactionFeeEstimate } from '@/services/safe-transaction';
import type { GasFeeCardProps } from './fee-card-types';

/** What the sheet knows about the operation whose gas it is showing. */
export interface SigningFeeInput {
  /** The single call being signed (`eth_sendTransaction`), or null. */
  tx: { to: string; value?: string; data?: string } | null;
  /** An EIP-5792 batch's calls (`wallet_sendCalls`). Takes precedence over `tx`. */
  batchCalls: { to: string; value?: string; data?: string }[] | null;
  chainId: number;
  /** The signer. `undefined` = no account, and nothing to price. */
  account: string | undefined;
  publicKeyHex: string | undefined;
  /**
   * The credential read has settled. An undeployed Safe must not be quoted
   * before it: without the passkey there is no real initCode, and a draft that
   * cannot match the submitted operation must never be priced.
   */
  publicKeyLoaded: boolean;
  /** A historical replay is not about to be sent, so it is not quoted. */
  readOnly: boolean;
  /**
   * Identity of the request being priced. A new value restarts the quote; the
   * same value must not, or every unrelated re-render would re-price.
   */
  requestKey: string | null;
}

export interface SigningFeeController {
  /**
   * Spread into `<GasFeeCard>`; the sheet supplies the two display values it
   * owns (`nativeSymbol`, `nativeUsdPrice`). The two twins fill different
   * halves of this bag — native the estimate and callbacks, web the controller.
   */
  cardProps: Omit<GasFeeCardProps, 'nativeSymbol' | 'nativeUsdPrice'>;
  /** The quote the approve path signs, or null when there is none. */
  estimate: TransactionFeeEstimate | null;
  /**
   * The fee asset the quote is denominated in (`null` = native), routed through
   * to the in-band send path so gas is settled in the token that was shown. It
   * is read from the same place the quote is, so "displayed = signed" cannot be
   * broken by the two drifting apart.
   */
  feeToken: string | null;
  /**
   * Confirm must stay disabled. ONE boolean rather than the three flags the
   * sheet used to combine, because the two platforms combine them differently:
   * native reproduces its exact expression (estimating/failed gate a tx but not
   * a batch; a re-quote gates both), while web asks the core's own
   * `confirm_fee_ready` — the single gate `fee_policy` exists to publish.
   */
  blocksConfirm: boolean;
  /** Estimation settled with no quote — the sheet shows its blind-submit warning. */
  failed: boolean;
}
