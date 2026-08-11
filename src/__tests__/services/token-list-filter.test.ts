/**
 * The Assets tab's chain chip + search box — `services/token-list-filter.ts`.
 *
 * This is display narrowing, and the ruling that it belongs to the shell is
 * recorded in that module. What this file buys is the coverage it never had
 * while it lived inline in `HoldingsList.tsx`: jest is `testEnvironment: 'node'`
 * and matches `*.test.ts` only, so nothing that stays in a `.tsx` is tested at
 * all.
 *
 * The behaviours worth pinning are the ones a user would report as a bug:
 *   - a search that finds nothing must still be distinguishable from an empty
 *     wallet (`isNarrowingHoldings`), or the Assets tab offers the
 *     receive-onboarding card to someone who is holding money;
 *   - the chain chip and the query compose, and neither mutates the streamed
 *     token list it is handed.
 */
import { chainName } from '@/models/network';
import type { APIToken } from '@/models/types';
import {
  filterTokensByChain,
  isNarrowingHoldings,
  narrowHoldings,
  searchTokens,
} from '@/services/token-list-filter';

function token(partial: Partial<APIToken> & { network: string; symbol: string }): APIToken {
  return {
    chainName: '', balance: '1', decimals: 18, logo: null, name: partial.symbol,
    tokenAddress: null, priceUsd: 1, spam: false, ...partial,
  };
}

const ETH_MAINNET = token({ network: 'eth-mainnet', symbol: 'ETH', name: 'Ether' });
const USDC_BASE = token({ network: 'base-mainnet', symbol: 'USDC', name: 'USD Coin', tokenAddress: '0xaa' });
const DEGEN_BASE = token({ network: 'base-mainnet', symbol: 'DEGEN', name: 'Degen', tokenAddress: '0xbb' });
const ALL = [ETH_MAINNET, USDC_BASE, DEGEN_BASE];

// Whatever the network table calls chain 8453 — read, never hard-coded, so this
// suite does not become a second statement of the display name.
const BASE_CHAIN_ID = 8453;
const MAINNET_CHAIN_ID = 1;

describe('chain chip', () => {
  it('keeps only the selected chain', () => {
    expect(filterTokensByChain(ALL, BASE_CHAIN_ID)).toEqual([USDC_BASE, DEGEN_BASE]);
    expect(filterTokensByChain(ALL, MAINNET_CHAIN_ID)).toEqual([ETH_MAINNET]);
  });

  it('null means every chain', () => {
    expect(filterTokensByChain(ALL, null)).toEqual(ALL);
  });

  it('a chain with nothing held yields an empty list, not everything', () => {
    expect(filterTokensByChain(ALL, 999_999)).toEqual([]);
  });

  it('never mutates or aliases the streamed list', () => {
    const input = [...ALL];
    const result = filterTokensByChain(input, null);
    expect(result).not.toBe(input);
    result.pop();
    expect(input).toHaveLength(3);
  });
});

describe('search', () => {
  it('matches the symbol, case-insensitively', () => {
    expect(searchTokens(ALL, 'usdc')).toEqual([USDC_BASE]);
    expect(searchTokens(ALL, 'UsDc')).toEqual([USDC_BASE]);
  });

  it('matches the token name as well as the symbol', () => {
    expect(searchTokens(ALL, 'usd coin')).toEqual([USDC_BASE]);
    expect(searchTokens(ALL, 'ether')).toEqual([ETH_MAINNET]);
  });

  it('matches the API network id', () => {
    expect(searchTokens(ALL, 'base-mainnet')).toEqual([USDC_BASE, DEGEN_BASE]);
  });

  it("matches the chain's DISPLAY name — the field the inline copy had to add", () => {
    const displayed = chainName(BASE_CHAIN_ID);
    expect(searchTokens(ALL, displayed)).toEqual([USDC_BASE, DEGEN_BASE]);
    // Substrings of it work too — that is what a user types mid-word.
    expect(searchTokens(ALL, displayed.slice(0, 2))).toEqual([USDC_BASE, DEGEN_BASE]);
  });

  it('an empty or whitespace query matches everything', () => {
    expect(searchTokens(ALL, '')).toEqual(ALL);
    expect(searchTokens(ALL, '   ')).toEqual(ALL);
  });

  it('surrounding whitespace is trimmed, not searched for', () => {
    expect(searchTokens(ALL, '  degen  ')).toEqual([DEGEN_BASE]);
  });

  it('no match is an empty list', () => {
    expect(searchTokens(ALL, 'zzzz')).toEqual([]);
  });
});

describe('composition', () => {
  it('chain first, then query', () => {
    expect(narrowHoldings(ALL, BASE_CHAIN_ID, 'usdc')).toEqual([USDC_BASE]);
    // The chip wins: a token that matches the query on ANOTHER chain is gone.
    expect(narrowHoldings(ALL, MAINNET_CHAIN_ID, 'usdc')).toEqual([]);
  });

  it('neither filter set returns the whole list', () => {
    expect(narrowHoldings(ALL, null, '')).toEqual(ALL);
  });
});

describe('isNarrowingHoldings — "no matches" vs "empty wallet"', () => {
  it('is true whenever either narrowing is active', () => {
    expect(isNarrowingHoldings(BASE_CHAIN_ID, '')).toBe(true);
    expect(isNarrowingHoldings(null, 'usdc')).toBe(true);
    expect(isNarrowingHoldings(BASE_CHAIN_ID, 'usdc')).toBe(true);
  });

  it('is false only when nothing is narrowing — the real empty state', () => {
    expect(isNarrowingHoldings(null, '')).toBe(false);
    // Whitespace is not a query, exactly as the search itself treats it.
    expect(isNarrowingHoldings(null, '   ')).toBe(false);
  });

  it('agrees with the search: whitespace narrows nothing and hides nothing', () => {
    expect(isNarrowingHoldings(null, '   ')).toBe(false);
    expect(narrowHoldings(ALL, null, '   ')).toEqual(ALL);
  });
});
