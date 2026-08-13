// The `usd` string a received transfer is PERSISTED with, checked against the
// core that reads it back.
//
// `incomingToRecord` (activity.ts) is the write side and lives only in the
// shell: its inputs are a live DEX/Chainlink price read and an on-chain
// metadata resolve, neither of which the core has a port for. The READ side is
// core-owned (`activity_feed.rs::tx_usd_value`) and web executes it on every
// render. A record is durable, so a wrong string written here does not heal on
// refresh — which makes "do the two sides agree?" the only question that
// matters about the split, and this file is its gate.
//
// Ported by hand, both sides would drift silently. So the write side is the
// REAL `syncReceivedTransfers` over a real store, and the read side is the REAL
// wasm core driven through the real web session. Nothing in between is a
// double.
//
// What the assertions pin:
//   - a priced token: written value == read value, exactly;
//   - a stablecoin with no price feed: ≈$1 on BOTH sides, never $0.00;
//   - an unpriced non-stablecoin: $0.00 on both, never a guess;
//   - the one place they intentionally differ — a sub-cent stablecoin, where
//     `formatUsd` rounds the string to `$0.00` and the core's fallback RECOVERS
//     the amount. The read side being the more generous of the two is the
//     safe direction, and it is asserted rather than left to be rediscovered.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: 'en' },
}));

// --- the write side's two inputs, both shell I/O ---------------------------
const mockFetchTokens = jest.fn();
jest.mock('@/services/wallet-api', () => ({
  fetchTokens: (...a: unknown[]) => mockFetchTokens(...a),
}));

const mockIncoming = jest.fn();
jest.mock('@/services/incoming-transfers', () => ({
  fetchIncomingTransfers: (...a: unknown[]) => mockIncoming(...a),
}));

const mockMetadata = jest.fn();
jest.mock('@/services/token-metadata', () => ({
  resolveTokenMetadata: (...a: unknown[]) => mockMetadata(...a),
}));

// The feed session runs its own discovery pass; this test drives the write side
// itself (through `requireActual`) so the two never race.
jest.mock('@/services/activity', () => ({
  ...jest.requireActual('@/services/activity'),
  syncReceivedTransfers: jest.fn(async () => 0),
}));

jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: async () => null,
}));
jest.mock('@/services/platform', () => ({ hapticSuccess: () => {} }));

// Load-bearing: jest lists no `.web.ts` in `moduleFileExtensions`, so a bare
// `@/services/vela-core` resolves the NATIVE index and the wasm is never
// initialized. Importing the web entry by explicit path first runs `initSync`.
import '@/services/vela-core';
import { createActivityFeedSession } from '@/services/wallet-state-core/feed-session';
import type { FeedItem } from '@/services/wallet-state-core/generated/FeedItem';
import type { FeedView } from '@/services/wallet-state-core/generated/FeedView';
import { chainName, networkId } from '@/models/network';
import type { LocalTransaction } from '@/services/storage';
import type { IncomingTransfer } from '@/services/transfer-monitor';

/** The real write side, with its own dependencies still mocked above. */
const syncReceivedTransfers: (address: string) => Promise<number> =
  jest.requireActual('@/services/activity').syncReceivedTransfers;

const TX_KEY = 'vela.transactionHistory';
const ME = '0xAAaAaAaAAAaaAAaaAAAaAaaaaAaAAaaAaAaAaAaA';
const PEER = '0xbBBbbBbbBBbBbbBbBbbBbbBBBBbbbBBBbBBbBBBB';
const CHAIN = 137;
const NOW = Math.floor(new Date(2026, 3, 7, 12, 0, 0).getTime() / 1000);

const CONTRACT = '0x' + 'cd'.repeat(20);

function transfer(over: Partial<IncomingTransfer> = {}): IncomingTransfer {
  return {
    id: 'in-1',
    chainId: CHAIN,
    token: CONTRACT.toLowerCase(),
    isNative: false,
    from: PEER,
    value: 0n,
    txHash: '0xhash',
    blockNumber: 1,
    logIndex: 0,
    timestamp: NOW,
    ...over,
  };
}

/** An `APIToken` as far as `buildTokenIndex` is concerned. `network` goes
 *  through the real id table so the index key matches what the shell builds. */
function held(symbol: string, decimals: number, priceUsd: number | null) {
  return {
    network: networkId(CHAIN), chainName: chainName(CHAIN), symbol, balance: '1', decimals,
    logo: null, name: symbol, tokenAddress: CONTRACT, priceUsd, spam: false,
  };
}

const INITIAL: FeedView = { rows: [], transactions: [], new_item_id: null, toast: null };
const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0)); };

function items(view: FeedView): FeedItem[] {
  return view.rows.flatMap((row) => (row.type === 'item' ? [row.item] : []));
}

/** Run the real ingest, then read the record back through the real core. */
async function ingestThenRead(): Promise<{ record: LocalTransaction; item: FeedItem }> {
  const merged = await syncReceivedTransfers(ME);
  expect(merged).toBe(1);
  const records: LocalTransaction[] = JSON.parse(mockStorage.get(TX_KEY) ?? '[]');
  expect(records).toHaveLength(1);

  let view: FeedView = INITIAL;
  const faults: unknown[] = [];
  const session = createActivityFeedSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
    ownAccounts: () => [],
    records: { storeLoaded: () => {} },
  });
  session.start({ type: 'focus_tick' });
  session.dispatch({ type: 'account_switched', address: ME });
  await settle();
  expect(faults).toEqual([]);
  const row = items(view)[0];
  session.dispose();
  expect(row).toBeDefined();
  return { record: records[0], item: row };
}

/** The number the persisted string denotes, read the way the core reads it. */
const storedUsd = (record: LocalTransaction) =>
  parseFloat((record.usd ?? '').replace(/[^0-9.]/g, '') || '0');

beforeEach(() => {
  mockStorage.clear();
  jest.clearAllMocks();
  mockMetadata.mockResolvedValue(new Map());
});

describe('received-transfer valuation: what is written vs what the core reads', () => {
  test('a priced token — the written string and the core agree exactly', async () => {
    mockFetchTokens.mockResolvedValue([held('LINK', 18, 3.5)]);
    mockIncoming.mockResolvedValue([transfer({ value: 2n * 10n ** 18n })]);

    const { record, item } = await ingestThenRead();
    expect(record.usd).toBe('$7.00');
    expect(storedUsd(record)).toBeCloseTo(7, 9);
    expect(item.usd_value).toBeCloseTo(7, 9);
  });

  test('a stablecoin with no price feed is ≈$1 on BOTH sides, never $0.00', async () => {
    // The metadata resolve answers symbol/decimals but no price — the exact
    // case `STABLE_SYMBOLS` exists for, and the reason it is core-owned.
    mockFetchTokens.mockResolvedValue([]);
    mockMetadata.mockResolvedValue(new Map([[CONTRACT.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));
    mockIncoming.mockResolvedValue([transfer({ value: 12_000_000n })]);

    const { record, item } = await ingestThenRead();
    expect(record.symbol).toBe('USDC');
    expect(record.usd).toBe('$12.00');
    expect(item.usd_value).toBeCloseTo(12, 9);
  });

  test('the Tether glyph folds the same way on both sides', async () => {
    // "USD₮0" is what the contract actually reports on several chains. If the
    // fold existed on only one side, this record would be written at $9 and
    // read at $0.
    mockFetchTokens.mockResolvedValue([]);
    mockMetadata.mockResolvedValue(new Map([[CONTRACT.toLowerCase(), { symbol: 'USD₮0', decimals: 6 }]]));
    mockIncoming.mockResolvedValue([transfer({ value: 9_000_000n })]);

    const { record, item } = await ingestThenRead();
    expect(record.usd).toBe('$9.00');
    expect(item.usd_value).toBeCloseTo(9, 9);
  });

  test('an unpriced non-stablecoin is $0.00 on both sides — no guess is invented', async () => {
    mockFetchTokens.mockResolvedValue([]);
    mockMetadata.mockResolvedValue(new Map([[CONTRACT.toLowerCase(), { symbol: 'PEPE', decimals: 18 }]]));
    mockIncoming.mockResolvedValue([transfer({ value: 5n * 10n ** 18n })]);

    const { record, item } = await ingestThenRead();
    expect(record.usd).toBe('$0.00');
    expect(item.usd_value).toBe(0);
  });

  test('a sub-cent stablecoin: the string rounds to $0.00 and the core recovers the amount', async () => {
    // The ONE intended asymmetry. `formatUsd` has two fraction digits, so the
    // written string cannot carry 0.004 — and `tx_usd_value` treats a stored
    // zero as "unknown" and falls back to the token amount. The read side being
    // the more generous of the two is the direction that cannot mislead: the
    // row shows a real, if tiny, value instead of nothing.
    mockFetchTokens.mockResolvedValue([]);
    mockMetadata.mockResolvedValue(new Map([[CONTRACT.toLowerCase(), { symbol: 'DAI', decimals: 18 }]]));
    mockIncoming.mockResolvedValue([transfer({ value: 4n * 10n ** 15n })]);

    const { record, item } = await ingestThenRead();
    expect(record.value).toBe('0.004');
    expect(record.usd).toBe('$0.00');
    expect(storedUsd(record)).toBe(0);
    expect(item.usd_value).toBeCloseTo(0.004, 9);
  });

  test('a priced STABLE token uses the price, not the ≈$1 shortcut', async () => {
    // `wallet-api.ts` pins the curated stablecoin list to exactly 1.0, so this
    // is what that pin looks like once it has landed in a durable record — and
    // it must survive the round trip unchanged rather than being re-derived.
    mockFetchTokens.mockResolvedValue([held('USDC', 6, 1.0)]);
    mockIncoming.mockResolvedValue([transfer({ value: 5_000_000n })]);

    const { record, item } = await ingestThenRead();
    expect(record.usd).toBe('$5.00');
    expect(item.usd_value).toBeCloseTo(5, 9);
  });
});
