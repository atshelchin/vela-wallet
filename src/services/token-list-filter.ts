/**
 * The Assets tab's list narrowing: the Home network chip, then the collapsed
 * search box.
 *
 * ---------------------------------------------------------------------------
 * OWNERSHIP: the SHELL's — for BOTH halves, and the same way the Activity
 * tab's network chip is handled. Recorded here so the two stop looking like
 * they were treated differently.
 * ---------------------------------------------------------------------------
 *
 * The core (`balance_dashboard.rs`) owns the holdings LIST itself: which
 * tokens are held at all, the zero-balance cull, the USD-descending order, the
 * unpriced split, and every number on the row. It exposes no filter and no
 * query, and that is right — narrowing a list someone is looking at changes
 * nothing about what is true, moves no money, and cannot be gotten wrong in a
 * way that costs anything. `isFiltering` (below) exists only so the empty
 * state says "no matches" instead of offering the receive-onboarding card
 * under a funded hero.
 *
 * WHY THIS IS NOT INCONSISTENT WITH THE ACTIVITY FEED. `activity_feed.rs` does
 * own `Event::ChainFilterChanged`, which reads like the same rule living in a
 * core — but on web that filter ALSO runs in the shell
 * (`screens/wallet/feed-chain-filter.ts`, pinned to the core row-for-row by
 * `core-projection-parity.test.ts`), for two reasons that do not apply here:
 *   1. the feed's filter is COUPLED to a derivation the core owns — a date
 *      header must disappear when every item under it filters away — so it
 *      could not be separated from the row projection;
 *   2. the feed's chain filter has a native twin running the same machine, so
 *      there is something to drift against. Holdings has no core-side filter
 *      at all, so there is no second statement of this rule anywhere and
 *      nothing to pin.
 * Net: on web, BOTH list filters are applied by the shell. Same treatment,
 * different amounts of machinery behind it.
 *
 * WHY THE SEARCH HALF CAN NEVER MOVE: it matches against `chainName()`, which
 * is display text from the network table, and against a user-typed query. Text
 * does not go into wasm in this repo (14+ locales), and a predicate that
 * matched different fields on web than on native would be a worse outcome than
 * leaving it here.
 *
 * A SECOND, NARROWER COPY EXISTS: `components/ui/TokenSelector.tsx` filters
 * the Send token picker on symbol/name/network but NOT chain name, and adds a
 * category chip and a sweep mode. It is deliberately not merged in from here —
 * that file carries the same ruling in its own words (its narrowing is display;
 * the invariant its `chainFilter` looks like it enforces, "a batch is one
 * chain", is held by `send.rs`, not by the chip). The remaining difference is
 * which words a search box matches, which is exactly the per-surface
 * presentation choice this file argues belongs to the shell.
 */

import { chainName } from '@/models/network';
import { tokenChainId, type APIToken } from '@/models/types';

/** The Home network chip: an exact chain-id match, or everything when unset. */
export function filterTokensByChain(
  tokens: readonly APIToken[],
  selectedChainId: number | null,
): APIToken[] {
  return selectedChainId != null
    ? tokens.filter((tk) => tokenChainId(tk) === selectedChainId)
    : [...tokens];
}

/**
 * The search box: a case-insensitive substring over the four things a holding
 * is called — its symbol, its token name, the API network id, and the chain's
 * display name (so typing "base" finds what is on Base).
 *
 * An empty/whitespace query matches everything; the caller does not have to
 * special-case it.
 */
export function searchTokens(tokens: readonly APIToken[], query: string): APIToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tokens];
  return tokens.filter((tk) =>
    tk.symbol.toLowerCase().includes(q) ||
    tk.name.toLowerCase().includes(q) ||
    tk.network.toLowerCase().includes(q) ||
    chainName(tokenChainId(tk)).toLowerCase().includes(q));
}

/** Chain chip first, then the query — the order the Assets tab applies them. */
export function narrowHoldings(
  tokens: readonly APIToken[],
  selectedChainId: number | null,
  query: string,
): APIToken[] {
  return searchTokens(filterTokensByChain(tokens, selectedChainId), query);
}

/**
 * Is the list being narrowed at all? Drives the empty state's wording: a
 * filter with no matches is NOT an empty wallet, and must not show the
 * receive-onboarding card under a funded hero.
 */
export function isNarrowingHoldings(selectedChainId: number | null, query: string): boolean {
  return query.trim().length > 0 || selectedChainId != null;
}
