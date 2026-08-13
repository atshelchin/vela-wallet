// The native-coin price rules exist TWICE on purpose, and this pins the two
// together.
//
// Web runs the Rust `balance_dashboard` kernels (`best_group_price`,
// `best_native_dex_price`, `choose_native_price`) through
// `services/native-price.web.ts`; iOS/Android cannot (Hermes has no
// WebAssembly) and run `services/native-price.ts` instead. Neither copy can be
// deleted — so the thing to remove is not the duplication but the DRIFT.
//
// A red test here means one platform would price the user's WHOLE WALLET
// differently from the other: this is the number the home hero shows and the
// multiplier under every per-row fiat value. The failure this guards is not
// hypothetical — X Layer's WOKB/USDC pool quotes OKB at ~$5 while WOKB/USD₮0
// holds the liquid one at ~$81, and picking the wrong one is a 16x error on
// everything denominated through it.
//
// The Rust core is driven for real (through the web seam), not transcribed
// into a snapshot someone can regenerate without looking at the other side.

import { readFileSync } from 'fs';
import { resolve } from 'path';

import '@/services/vela-core';

import {
  DEFAULT_QUOTE_DECIMALS,
  bestNativeDexPrice as tsBestNativeDexPrice,
  chooseNativePrice as tsChooseNativePrice,
  type NativeQuoteGroup,
} from '@/services/native-price';
import {
  bestNativeDexPrice as coreBestNativeDexPrice,
  chooseNativePrice as coreChooseNativePrice,
} from '@/services/native-price';

const BALANCE_DASHBOARD_RS = readFileSync(
  resolve(__dirname, '../../..', 'rust/crates/vela-core/src/app/balance_dashboard.rs'),
  'utf8',
);

/** 1 native coin quoted into a stable with `decimals` decimals. */
const units = (whole: string, decimals: number) => {
  const [int, frac = ''] = whole.split('.');
  return `${int}${frac.padEnd(decimals, '0').slice(0, decimals)}`.replace(/^0+(?=\d)/, '');
};

const group = (amountsOut: string[], quoteDecimals: number | null): NativeQuoteGroup => ({
  amountsOut,
  quoteDecimals,
});

// ---------------------------------------------------------------------------
// best_native_dex_price / best_group_price
// ---------------------------------------------------------------------------

interface DexCase {
  name: string;
  groups: NativeQuoteGroup[];
  /** What both sides must answer. Stated so a two-sided edit still fails. */
  expected: number | null;
}

const DEX_CASES: DexCase[] = [
  { name: 'nothing quoted at all', groups: [], expected: null },
  { name: 'a group with no successful calls', groups: [group([], 6)], expected: null },
  {
    name: 'a pool that answered zero cannot price',
    groups: [group(['0'], 6)],
    expected: null,
  },
  {
    name: 'the X Layer WOKB case: the deepest pool wins across stables',
    groups: [group([units('5', 6)], 6), group([units('81', 6)], 6)],
    expected: 81,
  },
  {
    name: 'the deepest pool wins WITHIN one stable too',
    groups: [group([units('1', 6), units('3', 6), units('2', 6)], 6)],
    expected: 3,
  },
  {
    name: 'each stable is normalised by ITS OWN decimals, never a shared scale',
    // Raw, DAI's 18-decimal amount is 10^12x the USDC one; normalised it is
    // worth less. Comparing raw would answer 2e12 instead of 2.
    groups: [group([units('2', 18)], 18), group([units('1.5', 6)], 6)],
    expected: 2,
  },
  {
    name: 'a failed decimals() read falls back to the core default, not to raw units',
    groups: [group([units('2', DEFAULT_QUOTE_DECIMALS)], null)],
    expected: 2,
  },
  {
    name: 'a zero quote alongside a real one is skipped, not treated as the max',
    groups: [group(['0', units('7', 6)], 6), group(['0'], 6)],
    expected: 7,
  },
  {
    name: 'an amount past 2^53 rounds the same on both sides',
    groups: [group(['123456789012345678901'], 18)],
    expected: 123.45678901234568,
  },
  {
    name: 'an unparseable amount cannot price',
    groups: [group(['', '  ', 'abc'], 6)],
    expected: null,
  },
  {
    name: 'a group that cannot price does not veto one that can',
    groups: [group(['abc'], 6), group([units('12', 6)], 6)],
    expected: 12,
  },
];

describe('best_native_dex_price (native-price.ts ⇄ balance_dashboard.rs, real core)', () => {
  it.each(DEX_CASES)('$name', ({ groups, expected }) => {
    const fromCore = coreBestNativeDexPrice(groups);
    const fromTs = tsBestNativeDexPrice(groups);
    expect(fromCore).toBe(expected);
    expect(fromTs).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// choose_native_price
// ---------------------------------------------------------------------------

interface LadderCase {
  name: string;
  dex: number | null;
  clLocal: number | null;
  clEth: number | null;
  expected: { price: number | null; source: string };
}

const LADDER_CASES: LadderCase[] = [
  {
    name: 'nothing priced',
    dex: null, clLocal: null, clEth: null,
    expected: { price: null, source: 'none' },
  },
  {
    name: 'DEX alone',
    dex: 81, clLocal: null, clEth: null,
    expected: { price: 81, source: 'DEX' },
  },
  {
    name: 'the local feed beats the Ethereum-mainnet one',
    dex: null, clLocal: 80, clEth: 79,
    expected: { price: 80, source: 'Chainlink(local)' },
  },
  {
    name: 'the Ethereum-mainnet feed is the last rung',
    dex: null, clLocal: null, clEth: 79,
    expected: { price: 79, source: 'Chainlink(ETH)' },
  },
  {
    name: 'a DEX price inside the band is kept',
    dex: 101, clLocal: 100, clEth: null,
    expected: { price: 101, source: 'DEX' },
  },
  {
    name: 'a thin pool quoting 16x low is discarded for the oracle',
    dex: 5, clLocal: 80, clEth: null,
    expected: { price: 80, source: 'Chainlink(sanity)' },
  },
  {
    name: 'a thin pool quoting high is discarded too',
    dex: 200, clLocal: 80, clEth: null,
    expected: { price: 80, source: 'Chainlink(sanity)' },
  },
  {
    name: 'the low bound is exclusive',
    dex: 50, clLocal: 100, clEth: null,
    expected: { price: 100, source: 'Chainlink(sanity)' },
  },
  {
    name: 'the high bound is exclusive',
    dex: 200, clLocal: 100, clEth: null,
    expected: { price: 100, source: 'Chainlink(sanity)' },
  },
  {
    name: 'the band is checked against the ETH feed when there is no local one',
    dex: 5, clLocal: null, clEth: 80,
    expected: { price: 80, source: 'Chainlink(sanity)' },
  },
  {
    // The one that used to differ: TypeScript read `onChainClPrice ?? ethClPrice`
    // and got 0, so the band test was 81/0 = Infinity and it published $0 as the
    // price of the chain's native coin. The core has always filtered the local
    // read first. Unreachable from `wallet-api.ts` (which gates the decode), and
    // catastrophic the moment anything else calls it.
    name: 'a local feed that decoded to zero falls through instead of dividing by it',
    dex: 81, clLocal: 0, clEth: 80,
    expected: { price: 81, source: 'DEX' },
  },
  {
    name: 'a negative local feed falls through as well',
    dex: null, clLocal: -5, clEth: 80,
    expected: { price: 80, source: 'Chainlink(ETH)' },
  },
  {
    name: 'a zero local feed with nothing behind it prices nothing',
    dex: null, clLocal: 0, clEth: null,
    expected: { price: null, source: 'none' },
  },
  {
    // Verbatim with the core: the Ethereum-mainnet fallback is deliberately
    // ungated, so a zero there IS published. Pinned so neither side "fixes" it
    // alone.
    name: 'the Ethereum-mainnet fallback stays ungated on both sides',
    dex: null, clLocal: null, clEth: 0,
    expected: { price: 0, source: 'Chainlink(ETH)' },
  },
];

describe('choose_native_price (native-price.ts ⇄ balance_dashboard.rs, real core)', () => {
  it.each(LADDER_CASES)('$name', ({ dex, clLocal, clEth, expected }) => {
    expect(coreChooseNativePrice(dex, clLocal, clEth)).toEqual(expected);
    expect(tsChooseNativePrice(dex, clLocal, clEth)).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Gate self-checks — a parity suite that stops exercising the interesting
// branches goes green for the wrong reason.
// ---------------------------------------------------------------------------

describe('the gate itself', () => {
  it('reaches every rung of the ladder the core enumerates, plus "none"', () => {
    const variants = /pub enum NativePriceSource \{([\s\S]*?)\n\}/.exec(BALANCE_DASHBOARD_RS);
    expect(variants).not.toBeNull();
    const rungs = [...variants![1].matchAll(/^\s*([A-Z]\w*),/gm)].map((m) => m[1]);
    expect(rungs).toEqual(['Dex', 'ChainlinkSanity', 'ChainlinkLocal', 'ChainlinkEth']);

    const reached = new Set(
      LADDER_CASES.map(({ dex, clLocal, clEth }) => coreChooseNativePrice(dex, clLocal, clEth).source),
    );
    expect([...reached].sort()).toEqual(
      ['Chainlink(ETH)', 'Chainlink(local)', 'Chainlink(sanity)', 'DEX', 'none'].sort(),
    );
  });

  it('defaults the quote decimals to the value the Rust source declares', () => {
    const declared = /pub const DEFAULT_QUOTE_DECIMALS:\s*u32\s*=\s*(\d+)/.exec(BALANCE_DASHBOARD_RS);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(DEFAULT_QUOTE_DECIMALS);
  });

  it('has a case where a cross-stable max and a within-stable max disagree', () => {
    // Without this the suite could pass with either fold collapsed into the
    // other — both are the core's, and both must be reached.
    const perGroupMaxMatters = DEX_CASES.some((c) =>
      c.groups.some((g) => g.amountsOut.filter((a) => Number(a) > 0).length > 1),
    );
    const crossGroupMaxMatters = DEX_CASES.some(
      (c) => c.groups.filter((g) => g.amountsOut.some((a) => Number(a) > 0)).length > 1,
    );
    expect(perGroupMaxMatters).toBe(true);
    expect(crossGroupMaxMatters).toBe(true);
  });
});
