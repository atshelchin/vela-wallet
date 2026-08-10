/**
 * The shape the "Add network" tab of {@link AddTokenPanel} renders from, on
 * every platform.
 *
 * A standalone module for the same reason `network-admin-controller-types.ts`
 * is one: a platform pair (`use-add-network-tab.ts` / `.web.ts`) must never
 * import its own base file — on web Metro resolves that specifier back to the
 * `.web.ts` variant itself, and a self-referential re-export recurses at module
 * init. Both variants import from here instead.
 *
 * The controller carries no worded copy: the panel keeps the exact `t()` keys it
 * has always rendered, so switching platforms cannot move a single byte of
 * on-screen text. Everything below is a decision (already-added, not-found,
 * incompatible, the raw thrown message) that the panel then words.
 */
import type { CompatibilityResult } from '@/models/types';

/** Why the tab is showing a failure. Worded by the panel, never here. */
export type AddNetworkTabError =
  /** The chain is a built-in or an already-saved custom network. */
  | { kind: 'already_added' }
  /** The chain registry has no document for this id. */
  | { kind: 'chain_not_found' }
  /**
   * The compatibility verdict came back negative. `detail` is the checker's own
   * sentence when it produced one (missing contracts / no P256 / RPC failure).
   */
  | { kind: 'not_compatible'; detail?: string }
  /** An exception escaped the flow — its message, verbatim. */
  | { kind: 'message'; text: string };

/** The resolved chain, as the result card renders it. */
export interface AddNetworkTabChainInfo {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Empty when the registry lists no explorer — the row is then hidden. */
  explorerURL: string;
  /** The editable RPC field's current value. */
  rpcURL: string;
}

export interface AddNetworkTabSuggestion {
  chainId: number;
  name: string;
}

export interface AddNetworkTabController {
  query: string;
  suggestions: AddNetworkTabSuggestion[];
  searching: boolean;
  /** Resolving the chain document or running the compatibility check. */
  loading: boolean;
  saving: boolean;
  error: AddNetworkTabError | null;
  chainInfo: AddNetworkTabChainInfo | null;
  compat: CompatibilityResult | null;
  /** The network was saved — the panel swaps the button for the added row. */
  added: boolean;
  search(text: string): void;
  select(chainId: number): void;
  setRpcURL(value: string): void;
  add(): void;
}
