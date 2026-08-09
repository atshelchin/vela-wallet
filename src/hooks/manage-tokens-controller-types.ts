/**
 * The shape the manual add-token controller returns on every platform.
 *
 * A standalone module for the same reason `receive-controller-types.ts` is one:
 * a platform pair (`use-manage-tokens.ts` / `use-manage-tokens.web.ts`) must
 * never import its own base file — on web, Metro resolves that specifier back
 * to the `.web.ts` variant itself, and a self-referential re-export recurses at
 * module init. Both variants import from here instead.
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
