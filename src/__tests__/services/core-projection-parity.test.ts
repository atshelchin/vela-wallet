/**
 * Executable drift gates for two rules the web app still evaluates in
 * TypeScript even though the Rust core owns its own copy.
 *
 * Neither copy can be deleted: Hermes has no WebAssembly, so the TypeScript is
 * iOS/Android's only implementation, and the core's copy is what the web app is
 * built on. What CAN be done is pin them to each other — and here the oracle is
 * not a regex over Rust source but the real wasm core, driven through the same
 * web shell the app uses.
 *
 *   1. **The holdings filter + sort.** `wallet-api.ts` drops zero balances and
 *      orders by USD before it ever answers; `balance_dashboard.rs` re-applies
 *      the same two rules on every settle. Drift here reorders the Assets tab on
 *      one platform, or shows dust the other hides.
 *   2. **The network chip filter.** `feed-chain-filter.ts` reproduces
 *      `activity_feed.rs`'s `ChainFilterChanged` projection because the web
 *      shell needs the unfiltered list at the same time (the network sheet
 *      counts every chain's events from it). "Reproduces" is asserted, not
 *      asserted-in-a-comment: the same core is asked both ways.
 *
 * A red test here means web and native would disagree about which rows a user
 * sees, or in what order.
 */
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// `activity.ts` pulls the i18n singleton in for its label strings, which reaches
// expo-localization (ESM, untransformed here).
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: 'en' },
}));

// The rpc_pool projection the balance executor snapshots at settle.
jest.mock('@/services/rpc-pool', () => ({
  getRateLimitedChains: () => new Set<number>(),
  getFailedRpcChains: () => new Set<number>(),
}));

// The transport. `sortAndFilterHoldings` is imported from the REAL module below
// — only `fetchTokens` is replaced, so the rule under test is the shipped one.
const fetchTokensMock = jest.fn();
jest.mock('@/services/wallet-api', () => ({
  ...jest.requireActual('@/services/wallet-api'),
  fetchTokens: (...args: unknown[]) => fetchTokensMock(...args),
}));

// The feed's discovery pipeline and its two shell reads.
jest.mock('@/services/activity', () => ({
  ...jest.requireActual('@/services/activity'),
  syncReceivedTransfers: async () => 0,
}));
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: async () => null,
}));
jest.mock('@/services/platform', () => ({ hapticSuccess: () => {} }));

// Load-bearing: jest lists no `.web.ts` in `moduleFileExtensions`, so a bare
// `@/services/vela-core` resolves the NATIVE index and the wasm is never
// initialized. Importing the web entry by explicit path first runs `initSync`.
import '@/services/vela-core';
import { filterFeedRowsByChain } from '@/screens/wallet/feed-chain-filter';
import { sortAndFilterHoldings } from '@/services/wallet-api';
import { toBalanceToken } from '@/services/wallet-state-core/balance-executor.web';
import { createBalanceSession } from '@/services/wallet-state-core/balance-session.web';
import { createActivityFeedSession } from '@/services/wallet-state-core/feed-session.web';
import type { BalanceView } from '@/services/wallet-state-core/generated/BalanceView';
import type { FeedView } from '@/services/wallet-state-core/generated/FeedView';
import type { APIToken } from '@/models/types';
import type { LocalTransaction } from '@/services/storage';
import type { FeedRow } from '@/screens/wallet/home-controller-types';

const ME = '0xAAaAaAaAAAaaAAaaAAAaAaaaaAaAAaaAaAaAaAaA';
const PEER = '0xbBBbbBbbBBbBbbBbBbbBbbBBBBbbbBBBbBBbBBBB';
const TX_KEY = 'vela.transactionHistory';

/** Let the effect loop's storage/RPC round-trips settle. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

beforeEach(() => {
  mockStorage.clear();
  fetchTokensMock.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Holdings: zero-balance filter + USD-descending sort
// ---------------------------------------------------------------------------

function token(over: Partial<APIToken> = {}): APIToken {
  return {
    network: 'polygon',
    chainName: 'Polygon',
    symbol: 'TOK',
    balance: '1',
    decimals: 18,
    logo: null,
    name: 'Token',
    // Concrete rather than absent: `undefined` and the wire's `null` are the
    // same fact but not the same value, and this gate is about the ROWS.
    tokenAddress: '0x0000000000000000000000000000000000000001',
    priceUsd: 1,
    // The wire type carries `spam` explicitly; an absent one is a decode fault.
    spam: false,
    ...over,
  } as APIToken;
}

describe('holdings filter + sort (wallet-api.ts ⇄ balance_dashboard.rs)', () => {
  test('the core keeps and orders exactly what the TypeScript rule does', async () => {
    // Deliberately unsorted, with two rows the filter must drop (a literal "0"
    // and a decimal that parses to zero) and one unpriced row that must stay.
    const raw = [
      token({ symbol: 'MID', balance: '5', priceUsd: 2 }),        // $10
      token({ symbol: 'ZERO', balance: '0', priceUsd: 100 }),     // dropped
      token({ symbol: 'TOP', balance: '3', priceUsd: 50 }),       // $150
      token({ symbol: 'DUST', balance: '0.000', priceUsd: 1 }),   // dropped
      token({ symbol: 'UNPRICED', balance: '9', priceUsd: null }),// $0, kept
      token({ symbol: 'LOW', balance: '1', priceUsd: 1 }),        // $1
    ];
    fetchTokensMock.mockResolvedValue(raw);

    let view: BalanceView | null = null;
    const faults: unknown[] = [];
    const session = createBalanceSession({
      onView: (next) => { view = next; },
      onError: (error) => { faults.push(error); },
      stream: { chainAssetsArrived: () => {} },
    });
    session.start({ type: 'app_focused' });
    session.dispatch({ type: 'account_changed', address: ME });
    await settle();

    expect(faults).toEqual([]);
    const fromCore = (view as BalanceView | null)?.tokens ?? [];
    const fromTs = sortAndFilterHoldings(raw).map(toBalanceToken);

    // Same rows, same order, same values — not merely the same set.
    expect(fromCore.map((t) => t.symbol)).toEqual(['TOP', 'MID', 'LOW', 'UNPRICED']);
    expect(fromCore).toEqual(fromTs);
    session.dispose();
  }, 15_000);
});

// ---------------------------------------------------------------------------
// 2. The Activity tab's network chip filter
// ---------------------------------------------------------------------------

function tx(over: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: 'tx',
    userOpHash: '',
    txHash: '0xhash',
    from: ME,
    to: PEER,
    value: '1',
    symbol: 'USDT',
    decimals: 6,
    chainId: 137,
    timestamp: Math.floor(new Date(2026, 3, 7, 12, 0, 0).getTime() / 1000),
    status: 'confirmed',
    type: 'send',
    ...over,
  };
}

/** The core's own rows, in the shape `filterFeedRowsByChain` consumes. */
function toShellRows(view: FeedView): FeedRow[] {
  return view.rows.map((row): FeedRow =>
    row.type === 'header'
      ? { kind: 'header', id: row.id, label: String(row.timestamp) }
      : {
        kind: 'item',
        // Only the two fields the filter reads have to be faithful.
        item: { id: row.item.id, chainId: row.item.chain_id } as FeedRow extends { kind: 'item'; item: infer I } ? I : never,
      },
  );
}

/** A stable identity for a projected row, for row-for-row comparison. */
const shape = (rows: FeedRow[]) =>
  rows.map((row) => (row.kind === 'header' ? `H:${row.id}` : `I:${row.item.id}@${row.item.chainId}`));

describe('network chip filter (feed-chain-filter.ts ⇄ activity_feed.rs)', () => {
  test('reproduces the core\'s own filtered projection, headers included', async () => {
    const DAY_A = Math.floor(new Date(2026, 3, 7, 12, 0, 0).getTime() / 1000);
    const DAY_B = Math.floor(new Date(2026, 3, 5, 9, 0, 0).getTime() / 1000);
    mockStorage.set(TX_KEY, JSON.stringify([
      // Day A: one Polygon row and one Base row → the header survives both filters.
      tx({ id: 'a-137', chainId: 137, timestamp: DAY_A }),
      tx({ id: 'a-8453', chainId: 8453, timestamp: DAY_A - 60 }),
      // Day B: Base only → its header must disappear when filtering to Polygon.
      tx({ id: 'b-8453', chainId: 8453, timestamp: DAY_B }),
    ]));

    let view: FeedView = { rows: [], transactions: [], new_item_id: null, toast: null };
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

    const unfiltered = toShellRows(view);
    expect(shape(unfiltered).filter((r) => r.startsWith('I:'))).toHaveLength(3);

    for (const chainId of [137, 8453, 999]) {
      session.dispatch({ type: 'chain_filter_changed', chain_id: chainId });
      await settle();
      expect(shape(toShellRows(view))).toEqual(shape(filterFeedRowsByChain(unfiltered, chainId)));
    }

    // …and `null` is the identity on both sides.
    session.dispatch({ type: 'chain_filter_changed', chain_id: null });
    await settle();
    expect(shape(toShellRows(view))).toEqual(shape(filterFeedRowsByChain(unfiltered, null)));
    expect(faults).toEqual([]);
    session.dispose();
  }, 15_000);
});
