/**
 * A custom ERC-20's USD price must be scaled by the decimals of the stablecoin
 * it was ACTUALLY quoted against.
 *
 * `queryChainAssets` asks the DEX to quote 1 custom token against every
 * stablecoin the chain lists, and takes the first quote that comes back. The
 * amount a quote returns is denominated in that stablecoin's own base units —
 * 1 DAI is `1e18`, 1 USDC is `1e6`. The rule this file pins used to divide the
 * surviving quote by ONE token's `decimals()` (whatever `pickQuoteToken` had
 * chosen, in practice USDC's 6), so on any chain whose stablecoin list holds
 * both a 6-decimal and an 18-decimal entry — Polygon, Gnosis, Arbitrum, Base,
 * every chain with DAI next to USDC — a token with no USDC pool but a live DAI
 * pool was priced 10^12 times too high.
 *
 * That number is not cosmetic. It is `APIToken.priceUsd`: the home total, the
 * holdings sort order, and the `usd` string `activity.ts` WRITES INTO a
 * persisted receive record all read it.
 *
 * The assertions are deliberately about the ratio, not about a formatted
 * string: `$1.00` vs `$1,000,000,000,000.00` is the whole finding.
 */
jest.mock('react-native', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

// Polygon: a real network that is NOT in `NATIVE_CHAINLINK_FEEDS`, so the
// multicall carries no trailing feed read and the call indices below are the
// whole batch.
const CHAIN = 137;

const DAI = '0x' + 'da'.repeat(20);
const USDC = '0x' + 'cd'.repeat(20);
const TKN = '0x' + 'ee'.repeat(20);
const QUOTER = '0x' + 'aa'.repeat(20);

let stables: { symbol: string; type: string; contract: string }[] = [];

jest.mock('@/services/chain-tokens', () => ({
  fetchChainTokens: async () => ({
    chainId: 137,
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    stables,
    // No wrapped native: keeps the batch to the calls this test reasons about
    // and takes the token→wrappedNative fallback out of play, so a price can
    // only have come from the direct stablecoin path.
    wrappedNativeToken: null,
    dex: { dex: 'Uniswap', protocol: 'uniswap-v3', contracts: { quoterV2: QUOTER } },
  }),
  // USDC is the preferred quote token — the choice the old code made and then
  // silently applied to somebody else's quote.
  pickQuoteToken: (s: { symbol: string }[]) => s.find(x => x.symbol === 'USDC') ?? null,
}));
jest.mock('@/services/storage', () => ({
  loadCustomTokens: async () => [
    { chainId: 137, symbol: 'TKN', name: 'Token', contractAddress: TKN, decimals: 18 },
  ],
}));
jest.mock('@/services/price-service', () => ({
  fetchChainlinkPrices: async () => ({}),
  resolveChainlinkPrice: () => null,
}));
jest.mock('@/services/dev/fault-injection', () => ({ priceShouldNull: () => false }));
jest.mock('@/models/network', () => {
  const actual = jest.requireActual('@/models/network');
  return { ...actual, getAllNetworksSync: () => [{ chainId: 137 }] };
});

const mockPoolRpcCall = jest.fn();
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: (...a: any[]) => mockPoolRpcCall(...a),
  getFailedRpcChains: () => new Set<number>(),
}));

import { clearTokenCache, fetchTokens, firstGroupedQuotePrice } from '@/services/wallet-api';

const ADDR = '0x1111111111111111111111111111111111111111';

// --- aggregate3 return encoding -------------------------------------------
// Result[] where Result = (bool success, bytes returnData). Mirrors what
// `decAggregate3` reads back, so the indices below are the real ones the
// production code assigns.

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');

type Row = { success: boolean; value?: bigint };

function encodeResults(rows: Row[]): string {
  const elems = rows.map(r => {
    const data = r.value == null ? '' : word(r.value);
    return (
      word(r.success ? 1 : 0) + // success
      word(0x40) + //              offset to `bytes` — two head words precede it
      word(data.length / 2) + //   bytes length
      data //                      already a whole 32-byte word (or empty)
    );
  });
  let off = rows.length * 32;
  let offsets = '';
  for (const e of elems) {
    offsets += word(off);
    off += e.length / 2;
  }
  return '0x' + word(0x20) + word(rows.length) + offsets + elems.join('');
}

/** `success` with a zero-length payload — a reverted quote. */
const FAILED: Row = { success: false };
const ok = (v: bigint | number): Row => ({ success: true, value: BigInt(v) });

const ONE = 10n ** 18n;

/**
 * The batch `queryChainAssets` builds for this fixture, by index:
 *   0  native balance          5  TKN balanceOf
 *   1  DAI balanceOf           6..9   TKN→USDC quotes (4 fee tiers)
 *   2  DAI decimals            10..13 TKN→DAI  quotes (4 fee tiers)
 *   3  USDC balanceOf
 *   4  USDC decimals
 */
function batch(opts: { usdcQuote?: bigint; daiQuote?: bigint }): Row[] {
  const rows: Row[] = [
    ok(0), //           0 native balance — zero, so it is filtered out
    ok(0), //           1 DAI balance
    ok(18), //          2 DAI decimals
    ok(0), //           3 USDC balance
    ok(6), //           4 USDC decimals
    ok(ONE), //         5 one whole TKN
  ];
  for (let i = 0; i < 4; i++) rows.push(opts.usdcQuote != null && i === 0 ? ok(opts.usdcQuote) : FAILED);
  for (let i = 0; i < 4; i++) rows.push(opts.daiQuote != null && i === 0 ? ok(opts.daiQuote) : FAILED);
  return rows;
}

async function priceOfTKN(rows: Row[]): Promise<number | null> {
  const encoded = encodeResults(rows);
  mockPoolRpcCall.mockImplementation(async (method: string) =>
    method === 'eth_call' ? { result: encoded } : { result: null },
  );
  const tokens = await fetchTokens(ADDR, { forceRefresh: true });
  const tkn = tokens.find(t => t.symbol === 'TKN');
  expect(tkn).toBeDefined();
  return tkn!.priceUsd;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearTokenCache();
  // DAI first, USDC second: the order the chain data hands them over, which is
  // NOT the order `pickQuoteToken` prefers. That gap is where the bug lived.
  stables = [
    { symbol: 'DAI', type: 'native', contract: DAI },
    { symbol: 'USDC', type: 'native', contract: USDC },
  ];
});

describe('custom ERC-20 price — each quote scaled by its own quote token', () => {
  test('an 18-decimal DAI quote is NOT divided by USDC\'s 6 decimals', async () => {
    // 1 TKN → 1 DAI. Only DAI has a pool.
    const price = await priceOfTKN(batch({ daiQuote: ONE }));
    expect(price).not.toBeNull();
    expect(price!).toBeCloseTo(1, 9);
    // The shape of the old defect, stated as its own assertion so a regression
    // reads as what it is rather than as "1 !== 1e12".
    expect(price!).toBeLessThan(1e6);
  });

  test('a 6-decimal USDC quote still scales by 6', async () => {
    // 1 TKN → 2.5 USDC.
    const price = await priceOfTKN(batch({ usdcQuote: 2_500_000n }));
    expect(price!).toBeCloseTo(2.5, 9);
  });

  test('the preferred quote token wins when both pools answer', async () => {
    // USDC says $2, DAI says $9. USDC is `pickQuoteToken`'s choice and it is
    // first in line — and it is read at 6 decimals, DAI would be read at 18.
    const price = await priceOfTKN(batch({ usdcQuote: 2_000_000n, daiQuote: 9n * ONE }));
    expect(price!).toBeCloseTo(2, 9);
  });

  test('no pool answers → no price, and the holding still renders', async () => {
    // The recovery path: an unpriced token is not a dropped token. It keeps its
    // balance and simply contributes nothing to the fiat total.
    const encoded = encodeResults(batch({}));
    mockPoolRpcCall.mockImplementation(async (method: string) =>
      method === 'eth_call' ? { result: encoded } : { result: null },
    );
    const tokens = await fetchTokens(ADDR, { forceRefresh: true });
    const tkn = tokens.find(t => t.symbol === 'TKN');
    expect(tkn).toBeDefined();
    expect(tkn!.balance).toBe('1');
    expect(tkn!.priceUsd).toBeNull();
  });
});

describe('firstGroupedQuotePrice', () => {
  test('each group carries its own scale; a failed decimals() read falls back within its own group', () => {
    expect(
      firstGroupedQuotePrice([
        { amountsOut: [], quoteDecimals: 6 },
        { amountsOut: ['1000000000000000000'], quoteDecimals: 18 },
      ]),
    ).toBeCloseTo(1, 9);

    // `null` decimals is DEFAULT_QUOTE_DECIMALS (6) — never the previous
    // group's 18, which is exactly the borrowing this function exists to stop.
    expect(
      firstGroupedQuotePrice([
        { amountsOut: [], quoteDecimals: 18 },
        { amountsOut: ['2000000'], quoteDecimals: null },
      ]),
    ).toBeCloseTo(2, 9);
  });

  test('a zero-output quote does not price the token', () => {
    expect(
      firstGroupedQuotePrice([
        { amountsOut: ['0'], quoteDecimals: 6 },
        { amountsOut: ['3000000'], quoteDecimals: 6 },
      ]),
    ).toBeCloseTo(3, 9);
    expect(firstGroupedQuotePrice([{ amountsOut: ['0'], quoteDecimals: 6 }])).toBeNull();
    expect(firstGroupedQuotePrice([])).toBeNull();
  });
});
