/**
 * The shape the manual add-token controller returns on every platform.
 *
 * A standalone module from the days this controller was a platform pair:
 * the pair could not import its own base file (Metro resolved it back to
 * the `.web.ts` half and recursed at module init), so both halves imported
 * from here. The pair is gone; the module stays as the one place the
 * contract the screens compile against is declared.
 */

import type { CustomToken } from '@/models/types';

/** One "found on this chain" result card. */
export interface FoundTokenView {
  chainId: number;
  networkName: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Whether this card already reads "Added" (session-scoped, per current input). */
  added: boolean;
}

export interface ManageTokensController {
  /** The contract-address field's value — as typed, never trimmed. */
  address: string;
  /** Feed every keystroke, and the address extracted from a scanned QR. */
  setAddress: (value: string) => void;
  /** Drives the search button's enabled state. */
  addressValid: boolean;
  /** A probe is running across every known network. */
  detecting: boolean;
  /** "Search Token" — probes every network in the registry. */
  detect: () => void;
  /** One card per network where the token resolved, in registry order. */
  found: FoundTokenView[];
  /** A save write is in flight (every card's button shows its loading state). */
  saving: boolean;
  /** "Add to Wallet" on the card for this chain. */
  save: (chainId: number) => void;
  /** The already-added list below the form. */
  customTokens: CustomToken[];
  /** The trash button on an added row. */
  remove: (id: string) => void;
}
