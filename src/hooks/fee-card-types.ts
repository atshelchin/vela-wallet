/**
 * The contract between a fee-showing surface and `GasFeeCard` — platform-neutral.
 *
 * Standalone (not exported from a `.web` module) for the reason the other
 * controller-type files state: `tsc` resolves a `.web.ts` file's imports to the
 * base `.ts` variant, so a shared declaration that lived beside the web
 * implementation would drag the wasm graph into the native bundle.
 *
 * Only web has a controller. `GasFeeCard.web.tsx` renders one; `GasFeeCard.tsx`
 * (native) ignores it and keeps the TypeScript fee math, because Hermes has no
 * WebAssembly.
 */

import type { TransactionFeeEstimate } from '@/services/safe-transaction';
import type { FeeView } from '@/services/wallet-state-core/generated/FeeView';

export interface FeeCardController {
  /**
   * The `fee_policy` machine's projection — busy, failed, stale, the selected
   * asset, the picker rows with their per-asset cost and the balance<fee gate,
   * and `confirm_fee_ready`. The card renders this and derives nothing from it
   * but pixels.
   */
  view: FeeView;
  /**
   * A quote has been asked for and has not settled.
   *
   * Wider than `view.busy` on purpose: it covers the account-context read that
   * precedes the dispatch, so the card never shows "estimate failed" in the
   * frame between the surface deciding to quote and the machine starting. This
   * is the shell fact `estimatingGas` was, and nothing more.
   */
  pending: boolean;
  /**
   * Any quote has been requested on this surface. Before the first one there is
   * no absent fee to report — an idle machine and a failed one both project
   * `fee: null`, and only the caller knows which it is.
   */
  asked: boolean;
  /** A chip tap. A local recompute on the settled quote, never a re-price. */
  selectAsset(contract: string | null): void;
  /**
   * The refresh affordance. Re-runs the last request when the shell never got
   * far enough to ask (an indeterminate deployment read), so the retry is not a
   * dead button; otherwise it is the core's `Requote`, which the machine
   * ignores while a run is in flight.
   */
  requote(): void;
}

/**
 * One row of `FeeTokenSelector`, with every judgement already made.
 *
 * `amount` and `insufficient` used to be derived inside the selector, which put
 * the balance<fee gate in two places on the same screen (the card's
 * affordability auto-default computed it too). They arrive decided now: on web
 * from `fee_policy`'s `FeeOptionView`, on native from the same
 * `calculateInBandFeeAmount` / `feeRowInsufficient` pair the card already ran.
 */
export interface FeeSelectorRow {
  symbol: string;
  /** `null` = the native coin. */
  contract: string | null;
  decimals: number;
  balance: bigint;
  logoUrls: string[];
  /** Cost of THIS transaction in this asset's base units; `null` = unpriceable. */
  amount: bigint | null;
  /** Shown for context, never selectable — paying in it would produce a doomed op. */
  insufficient: boolean;
}

/**
 * `GasFeeCard`'s props — ONE interface, two implementations.
 *
 * The split runs down the middle of this type. `GasFeeCard.web.tsx` reads
 * `controller` and ignores everything under "native"; `GasFeeCard.tsx` reads
 * the native half and ignores `controller`. Declaring it once is what lets the
 * two shared call sites (`ConfirmStep`, `SigningSheet`) render one element on
 * both platforms and hand it a platform-shaped prop bag.
 */
export interface GasFeeCardProps {
  /** Both: identity of what is being priced, and the fiat/logo context. */
  nativeSymbol: string;
  nativeUsdPrice: number;
  safeAddress: string;
  chainId: number;

  /** WEB: the `fee_policy` session for this surface. */
  controller?: FeeCardController;

  /** NATIVE: the parent-owned estimate and the callbacks the card writes back through. */
  feeEstimate?: TransactionFeeEstimate | null;
  estimating?: boolean;
  publicKeyHex?: string;
  tx?: { to: string; value?: string; data?: string };
  batchCalls?: { to: string; value?: string; data?: string }[];
  gasFeeToken?: string | null;
  onFeeTokenChange?: (token: string | null) => void;
  onFeeUpdate?: (fee: TransactionFeeEstimate) => void;
  onBusyChange?: (busy: boolean) => void;
}
