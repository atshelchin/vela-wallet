// The `activity_feed` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules (the id dedupe, the batch fold, the tombstones, the
// celebration gate, the alias memo) are covered by the Rust suite. What only
// exists on THIS side is the executor, and four of its jobs are load-bearing in
// ways a hand-written double would hide:
//
//   - **`day_start_ms`.** It is the grouping key, the core cannot compute it
//     (the device timezone is the shell's), and getting it wrong silently
//     splits one day into two headers — or merges two into one.
//   - **The record codec** against the shape actually on disk (`toName`,
//     `userOpHash`, `logoUrls`, `type`, the legacy pre-formatted `usd`). A
//     record `serde` rejects faults the core into a feed that never loads, and a
//     dropped `userOpHash` un-folds every batch send into N look-alike rows.
//   - **"Own accounts first."** A counterparty that is one of the user's own
//     accounts must resolve to its local name WITHOUT touching the network —
//     that is the shell's half of the invariant, and it is invisible from Rust.
//   - **The failure mappings**: an unreadable store answers an EMPTY feed and a
//     failed scan answers 0, both ported verbatim from `activity.ts`.
//
// So all four are asserted against the real core, over the real executor.
const mockStorage = new Map<string, string>();
const mockReadFault = { on: false };
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => {
    if (mockReadFault.on) throw new Error('storage unavailable');
    return mockStorage.get(key) ?? null;
  }),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// Stub i18n — `activity.ts` pulls it in for its label strings, and it reaches
// expo-localization (ESM, untransformed here). Nothing this suite asserts is a
// localized string: the whole point of the contract change is that formatting
// moved OUT of the store and into the render.
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: 'en' },
}));

// The discovery pipeline. `dayStartMs` stays REAL — it is the thing under test.
const mockScan = jest.fn<Promise<number>, [string]>(async () => 0);
jest.mock('@/services/activity', () => ({
  ...jest.requireActual('@/services/activity'),
  syncReceivedTransfers: (address: string) => mockScan(address),
}));

// The network identity lookup, so "own accounts first" is observable.
const mockResolve = jest.fn<Promise<{ name: string } | null>, [string]>(async () => null);
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: (addr: string) => mockResolve(addr),
}));

// The one platform call this machine makes. Stubbed whole rather than spread
// over the real module: `platform.ts` imports react-native, which is untransformed
// here — and the executor asks it for exactly one thing.
const mockHaptic = jest.fn();
jest.mock('@/services/platform', () => ({
  hapticSuccess: () => mockHaptic(),
}));

// Load-bearing: jest lists no `.web.ts` in `moduleFileExtensions`, so a bare
// `@/services/vela-core` resolves the NATIVE index and the wasm is never
// initialized. Importing the web entry by explicit path first runs `initSync`.
import '@/services/vela-core/index.web';
import { createActivityFeedSession } from '@/services/wallet-state-core/feed-session.web';
import type { FeedItem } from '@/services/wallet-state-core/generated/FeedItem';
import type { FeedView } from '@/services/wallet-state-core/generated/FeedView';
import type { LocalTransaction } from '@/services/storage';

const TX_KEY = 'vela.transactionHistory';
const ME = '0xAAaAaAaAAAaaAAaaAAAaAaaaaAaAAaaAaAaAaAaA';
const PEER = '0xbBBbbBbbBBbBbbBbBbbBbbBBBBbbbBBBbBBbBBBB';
const FRIEND = '0xCcCCcccCCCcccCcCCCcccccCCCccCCCcCccCCCcC';

/** Local noon on a fixed day, and 23:30 the evening BEFORE — different local
 *  days in every timezone, which is what makes the grouping assertion portable. */
const NOON = Math.floor(new Date(2026, 3, 7, 12, 0, 0).getTime() / 1000);
const AFTERNOON = Math.floor(new Date(2026, 3, 7, 15, 30, 0).getTime() / 1000);
const LAST_NIGHT = Math.floor(new Date(2026, 3, 6, 23, 30, 0).getTime() / 1000);

function tx(over: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: 'tx-1',
    userOpHash: '',
    txHash: '0xhash',
    from: ME,
    to: PEER,
    value: '1',
    symbol: 'USDT',
    decimals: 6,
    chainId: 137,
    timestamp: NOON,
    status: 'confirmed',
    type: 'send',
    ...over,
  };
}

function plant(...records: LocalTransaction[]) {
  mockStorage.set(TX_KEY, JSON.stringify(records));
}

function stored(): LocalTransaction[] {
  return JSON.parse(mockStorage.get(TX_KEY) ?? '[]');
}

const INITIAL: FeedView = { rows: [], transactions: [], new_item_id: null, toast: null };

/** Let the effect loop's storage round-trips settle. */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

let ownAccounts: { address: string; name: string }[] = [];
let seenRecords: LocalTransaction[] = [];

function open() {
  const faults: unknown[] = [];
  let view: FeedView = INITIAL;
  const session = createActivityFeedSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
    ownAccounts: () => ownAccounts,
    records: { storeLoaded: (rows) => { seenRecords = rows; } },
  });
  session.start({ type: 'focus_tick' });
  return { session, faults, latest: () => view };
}

/** Just the item rows, in render order. */
const items = (view: FeedView): FeedItem[] =>
  view.rows.flatMap((row) => (row.type === 'item' ? [row.item] : []));

beforeEach(() => {
  mockStorage.clear();
  mockReadFault.on = false;
  ownAccounts = [];
  seenRecords = [];
  mockScan.mockReset();
  mockScan.mockResolvedValue(0);
  mockResolve.mockReset();
  mockResolve.mockResolvedValue(null);
  mockHaptic.mockReset();
});

describe('activity_feed core (web shell)', () => {
  test('reads a store written by the TypeScript app, losing no field the fold needs', async () => {
    plant(tx({
      id: 'sent-1',
      userOpHash: '0xuop',
      toName: 'Alice',
      value: '45.5',
      logoUrls: ['https://logo/usdt.png'],
      usd: '$45.50',
    }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    const [item] = items(h.latest());
    expect(item).toMatchObject({
      id: 'sent-1',
      direction: 'out',
      counterparty: PEER,
      alias: 'Alice',
      value: '45.5',
      symbol: 'USDT',
      decimals: 6,
      chain_id: 137,
      timestamp: NOON,
      tx_hash: '0xhash',
    });
    // The legacy pre-formatted string, parsed ONCE, the way `txUsdValue` does.
    expect(item.usd_value).toBeCloseTo(45.5);
    // The raw row is kept whole for the detail sheet — `FeedTxRecord` drops
    // fields it still needs.
    expect(seenRecords[0].logoUrls).toEqual(['https://logo/usdt.png']);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a received stablecoin with no stored USD still shows a real fiat value', async () => {
    // The `txUsdValue` stablecoin fallback: a receive written before pricing
    // existed must not read "$0.00".
    plant(tx({ id: 'in-1', type: 'receive', from: PEER, to: ME, value: '12', usd: undefined }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    const [item] = items(h.latest());
    expect(item.direction).toBe('in');
    expect(item.counterparty).toBe(PEER);
    expect(item.usd_value).toBeCloseTo(12);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('rows are grouped under LOCAL-midnight headers, not UTC ones', async () => {
    plant(
      tx({ id: 'a', timestamp: AFTERNOON }),
      tx({ id: 'b', timestamp: NOON }),
      tx({ id: 'c', timestamp: LAST_NIGHT }),
    );
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    // Two same-local-day rows share one header; the 23:30 row the evening
    // before gets its own — which is what `dayStartMs` buys, and what a UTC
    // midnight key would get wrong for most of the world.
    const kinds = h.latest().rows.map((row) => (row.type === 'header' ? `H:${row.day_start_ms}` : `I:${row.item.id}`));
    expect(kinds).toEqual([
      `H:${new Date(2026, 3, 7).getTime()}`,
      'I:a',
      'I:b',
      `H:${new Date(2026, 3, 6).getTime()}`,
      'I:c',
    ]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a batch send survives the wire as ONE row with its breakdown', async () => {
    plant(
      tx({ id: '0xuop-0', userOpHash: '0xuop', to: PEER, value: '10', usd: '$10.00' }),
      tx({ id: '0xuop-1', userOpHash: '0xuop', to: FRIEND, value: '20', usd: '$20.00' }),
      tx({ id: '0xuop-2', userOpHash: '0xuop', to: ME, value: '5', usd: '$5.00' }),
    );
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    const rows = items(h.latest());
    expect(rows).toHaveLength(1);
    const batch = rows[0].batch!;
    // One token, three recipients ⇒ split; the row keys off the shared UserOp.
    expect(rows[0].id).toBe('0xuop');
    expect(batch.kind).toBe('split');
    expect(batch.count).toBe(3);
    expect(batch.total_usd).toBeCloseTo(35);
    expect(batch.ids).toEqual(['0xuop-0', '0xuop-1', '0xuop-2']);
    // split has no single recipient — the shell shows "N recipients" instead.
    expect(rows[0].counterparty).toBeNull();
    expect(rows[0].value).toBe('35');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a legacy untyped record reads as a send; an unknown type is dropped, not guessed', async () => {
    plant(
      // No `type` at all — the `t.type ?? 'send'` path.
      tx({ id: 'legacy', type: undefined }),
      // A value neither the store nor the core has a word for.
      { ...tx({ id: 'alien' }), type: 'teleport' } as unknown as LocalTransaction,
    );
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    expect(items(h.latest()).map((i) => i.id)).toEqual(['legacy']);
    // It must not have faulted the core on the way through, either.
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a counterparty that is one of the user\'s own accounts never touches the network', async () => {
    ownAccounts = [{ address: ME, name: 'Main' }, { address: PEER.toUpperCase(), name: 'Savings' }];
    plant(tx({ id: 'sent-1', to: PEER }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    expect(mockResolve).not.toHaveBeenCalled();
    expect(items(h.latest())[0].alias).toBe('Savings');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a resolved name overlays the row, and an address is never asked twice', async () => {
    mockResolve.mockResolvedValue({ name: 'vitalik.eth' });
    plant(tx({ id: 'sent-1', to: PEER }), tx({ id: 'sent-2', to: PEER, timestamp: AFTERNOON }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockResolve).toHaveBeenCalledWith(PEER.toLowerCase());
    expect(items(h.latest()).map((i) => i.alias)).toEqual(['vitalik.eth', 'vitalik.eth']);

    // A second tick must not re-ask (the memo is session-lived).
    h.session.dispatch({ type: 'focus_tick' });
    await settle();
    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an unreadable store lands an EMPTY feed rather than a stuck one', async () => {
    plant(tx({ id: 'sent-1' }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();
    expect(items(h.latest())).toHaveLength(1);

    mockReadFault.on = true;
    h.session.dispatch({ type: 'focus_tick' });
    await settle();
    // Ported verbatim: `loadTransactions().catch(() => [])` — the store is the
    // source of truth even about emptiness.
    expect(items(h.latest())).toHaveLength(0);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a failed scan is a scan that found nothing — the feed never flickers', async () => {
    plant(tx({ id: 'sent-1' }));
    mockScan.mockRejectedValue(new Error('rpc down'));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();
    expect(items(h.latest())).toHaveLength(1);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a receipt that lands AFTER the first pass celebrates, structured, with a haptic', async () => {
    plant(tx({ id: 'sent-1' }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();
    // First pass spent, nothing celebrated (the backlog gate).
    expect(h.latest().toast).toBeNull();
    expect(mockHaptic).not.toHaveBeenCalled();

    // Now money arrives: the scan persists it and reports one new receipt.
    // Deliberately slower than the storage read it was issued alongside — a
    // multi-chain RPC sweep always is, and the core's celebration flag is
    // consumed by whichever `StoreLoaded` lands next.
    mockScan.mockImplementation(async () => {
      await new Promise<void>((r) => setTimeout(r, 5));
      plant(tx({ id: 'sent-1' }), tx({ id: 'in-1', type: 'receive', from: PEER, to: ME, value: '3.5', symbol: 'USDC', timestamp: AFTERNOON }));
      return 1;
    });
    h.session.dispatch({ type: 'focus_tick' });
    await new Promise<void>((r) => setTimeout(r, 20));
    await settle();

    // The toast carries value + symbol, so nothing has to strip a symbol back
    // off a formatted string.
    expect(h.latest().toast).toMatchObject({ item_id: 'in-1', value: '3.5', symbol: 'USDC' });
    expect(h.latest().new_item_id).toBe('in-1');
    expect(mockHaptic).toHaveBeenCalledTimes(1);

    // Privacy withholds the number-bearing surface, and only that: the glowing
    // row (and the haptic that already fired) stay.
    h.session.dispatch({ type: 'privacy_changed', hidden: true });
    await settle();
    expect(h.latest().toast).toBeNull();
    expect(h.latest().new_item_id).toBe('in-1');

    // The 2.8s countdown is the executor's sleep, echoed by generation.
    h.session.dispatch({ type: 'privacy_changed', hidden: false });
    await settle();
    expect(h.latest().toast).not.toBeNull();
    await new Promise<void>((r) => setTimeout(r, 3000));
    expect(h.latest().toast).toBeNull();
    expect(h.latest().new_item_id).toBe('in-1'); // the glow outlives the toast
    expect(h.faults).toEqual([]);
    h.session.dispose();
  }, 15_000);

  test('two overlapping ticks are ONE receipt sweep, and only the leader reports it', async () => {
    plant(tx({ id: 'sent-1' }));
    let started = 0;
    mockScan.mockImplementation(async () => {
      started += 1;
      await new Promise<void>((r) => setTimeout(r, 20));
      return 2;
    });

    const h = open();
    // The account hand-off and a focus tick in the same commit — the exact
    // overlap the mount path produces.
    h.session.dispatch({ type: 'account_switched', address: ME });
    h.session.dispatch({ type: 'focus_tick' });
    await new Promise<void>((r) => setTimeout(r, 60));
    await settle();

    // A multi-chain eth_getLogs sweep is not run twice for one account…
    expect(started).toBe(1);
    // …and the follower answers 0, so the core cannot believe two batches landed.
    expect(items(h.latest()).map((i) => i.id)).toEqual(['sent-1']);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  }, 15_000);

  test('a delete removes the row at once and really deletes the record', async () => {
    plant(tx({ id: 'sent-1' }), tx({ id: 'sent-2', timestamp: AFTERNOON }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();
    expect(items(h.latest())).toHaveLength(2);

    h.session.dispatch({ type: 'delete_requested', id: 'sent-2' });
    // Optimistic: gone before the storage write settles.
    expect(items(h.latest()).map((i) => i.id)).toEqual(['sent-1']);
    await settle();
    expect(stored().map((r) => r.id)).toEqual(['sent-1']);

    // And a reload cannot resurrect it.
    h.session.dispatch({ type: 'focus_tick' });
    await settle();
    expect(items(h.latest()).map((i) => i.id)).toEqual(['sent-1']);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a previous account\'s answer can never paint the new account', async () => {
    plant(tx({ id: 'sent-1' }));
    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    // No settle: the read is still in flight when the account changes.
    h.session.dispatch({ type: 'account_switched', address: FRIEND });
    await settle();
    // ME's rows must not appear under FRIEND, and the in-flight read for ME is
    // dropped by the attempt tag rather than committed.
    expect(items(h.latest())).toHaveLength(0);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});
