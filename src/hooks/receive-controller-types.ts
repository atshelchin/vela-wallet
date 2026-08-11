/**
 * The shapes the Receive/Pay controllers return on every platform.
 *
 * A standalone module for the same reason `onboarding-controller-types.ts` is
 * one: a platform pair (`use-x.ts` / `use-x.web.ts`) must never import its own
 * base file — on web, Metro resolves that specifier back to the `.web.ts`
 * variant itself, and a self-referential re-export recurses at module init.
 * Both variants import from here instead.
 */

// ---------------------------------------------------------------------------
// Deposit watch (use-receive-watch)
// ---------------------------------------------------------------------------

export interface DepositItemView {
  symbol: string;
  amount: string;
  network: string;
  usd: string | null;
}

export interface DepositEntryView {
  time: string;
  items: DepositItemView[];
}

export interface ReceiveWatch {
  detected: boolean;
  deposits: DepositEntryView[];
}

// ---------------------------------------------------------------------------
// Request builder + acknowledge gate (use-receive-request)
// ---------------------------------------------------------------------------

/** The picked asset's facts — all the builder needs to encode a request. */
export interface RequestAssetFacts {
  chainId: number;
  tokenAddress: string | null;
  symbol: string;
  decimals: number;
  networkName: string;
}

/**
 * Which tab the Receive screen is on. Not decoration: it decides what the QR
 * encodes and what the copy button puts on the clipboard, so the controller
 * owns it and the screen names the intent.
 */
export type ReceiveMode = 'address' | 'request';

/** Native ETH on Ethereum — shown before anything is picked. */
export const DEFAULT_ASSET_FACTS: RequestAssetFacts = {
  chainId: 1,
  tokenAddress: null,
  symbol: 'ETH',
  decimals: 18,
  networkName: 'Ethereum',
};

export interface ReceiveRequestController {
  /** The receiving address the requests are built for ('' before login). */
  recipient: string;
  /** null = loading (keep the QR covered), false = show the gate, true = reminder. */
  warned: boolean | null;
  acknowledge: () => void;

  asset: RequestAssetFacts;
  pickAsset: (facts: RequestAssetFacts) => void;
  /** Sanitized amount in canonical dot form (what the input renders). */
  amount: string;
  /** Feed dot-normalized input text (`parseLocaleNumber` output). */
  setAmountText: (text: string) => void;

  /** The `ethereum:` URI for the request QR ('' until an address exists). */
  qrValue: string;
  /** The shareable pay-link — what request mode copies. */
  payLink: string;
  hasAmount: boolean;

  mode: ReceiveMode;
  setMode: (mode: ReceiveMode) => void;
  /**
   * What the QR encodes RIGHT NOW: the built request URI in request mode
   * (falling back to the bare address until one exists), the address itself
   * otherwise. One field instead of the screen re-deciding per surface — the
   * on-screen QR and the shared card cannot show different destinations.
   */
  qrPayload: string;
  /**
   * What the copy button puts on the clipboard RIGHT NOW: the shareable
   * pay-link in request mode (a page that bridges to any wallet), the raw
   * address otherwise (FR-015). '' when there is nothing to copy.
   */
  copyPayload: string;
  /** The anti-poisoning acknowledge gate, as the copy button's permission. */
  canCopy: boolean;
  /** The same gate, as the save-image button's permission. */
  canSave: boolean;
}

// ---------------------------------------------------------------------------
// /pay landing page (use-pay-request)
// ---------------------------------------------------------------------------

export interface PayQueryParams {
  to?: string;
  chain?: string;
  token?: string;
  amount?: string;
  sym?: string;
  dec?: string;
  net?: string;
}

export interface PayRequestController {
  valid: boolean;
  to: string;
  chainId: number;
  /** ERC-20 contract address, '' for a native-coin payment. */
  token: string;
  /** Human decimal amount, '' for an open request. */
  amount: string;
  symbol: string;
  decimals: number;
  networkName: string;
  /** The `ethereum:` URI for the "scan with another wallet" QR. */
  eip681: string;
  /** Base units as a decimal string, '' when no amount. */
  amountBase: string;
}
