// One transaction, two surfaces, one name.
//
// `HomeScreen` renders a feed row's counterparty from the core's `alias`
// (`activity_feed.rs:568-573` = `alias_map[counterparty] ?? stored to_name`),
// and the detail sheet renders `detailAlias` for the SAME counterparty on the
// SAME transaction. Those two must never disagree — a row that reads
// "vitalik.eth" in the list and "Alice" in the sheet is one transaction
// claiming two counterparties.
//
// `useHomeController.web.ts` used to compute the sheet's name as
// `toName ?? resolved`, the exact reverse of the core's precedence. This drives
// the REAL core through the real web session, lets it resolve an identity for
// an address that ALSO carries a stored send-time name, and asserts the shell
// helper lands on the core's answer. Transcribing the core's rule into a
// fixture here would defeat the point: the expectation is read off the running
// machine.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// `activity.ts` pulls the i18n singleton in for its label strings, which reaches
// expo-localization (ESM, untransformed here). No assertion below is a
// localized string.
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: 'en' },
}));

jest.mock('@/services/activity', () => ({
  ...jest.requireActual('@/services/activity'),
  syncReceivedTransfers: async () => 0,
}));

const mockResolve = jest.fn<Promise<{ name: string } | null>, [string]>(async () => null);
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: (addr: string) => mockResolve(addr),
}));

jest.mock('@/services/platform', () => ({ hapticSuccess: () => {} }));

// Importing the facade first is load-bearing: `@/services/vela-core` runs
// `initSync` on the planted wasm bytes at import time, so the core is
// initialised before anything below constructs a session.
import '@/services/vela-core';
import { createActivityFeedSession } from '@/services/wallet-state-core/feed-session';
import type { FeedItem } from '@/services/wallet-state-core/generated/FeedItem';
import type { FeedView } from '@/services/wallet-state-core/generated/FeedView';
import type { LocalTransaction } from '@/services/storage';

import { detailCounterpartyAlias } from '@/screens/wallet/home-detail-alias';

const TX_KEY = 'vela.transactionHistory';
const ME = '0xAAaAaAaAAAaaAAaaAAAaAaaaaAaAAaaAaAaAaAaA';
const PEER = '0xbBBbbBbbBBbBbbBbBbbBbbBBBBbbbBBBbBBbBBBB';

const WHEN = Math.floor(new Date(2026, 3, 7, 12, 0, 0).getTime() / 1000);

/** The name captured in the send flow, on disk with the record. */
const STORED_NAME = 'Alice';
/** What the network says the same address is called. */
const RESOLVED_NAME = 'alice.eth';

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
    timestamp: WHEN,
    status: 'confirmed',
    type: 'send',
    ...over,
  };
}

const INITIAL: FeedView = { rows: [], transactions: [], new_item_id: null, toast: null };
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

let records: LocalTransaction[] = [];

function open() {
  const faults: unknown[] = [];
  let view: FeedView = INITIAL;
  const session = createActivityFeedSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
    ownAccounts: () => [],
    records: { storeLoaded: (rows) => { records = rows; } },
  });
  session.start({ type: 'focus_tick' });
  return { session, faults, latest: () => view };
}

const items = (view: FeedView): FeedItem[] =>
  view.rows.flatMap((row) => (row.type === 'item' ? [row.item] : []));

/** The shell's projection, verbatim from `useHomeController.ts`. */
const aliasById = (view: FeedView) => {
  const map = new Map<string, string>();
  for (const item of items(view)) if (item.alias) map.set(item.id, item.alias);
  return map;
};

beforeEach(() => {
  mockStorage.clear();
  records = [];
  mockResolve.mockReset();
  mockResolve.mockResolvedValue(null);
});

describe('detail-sheet counterparty name ⇄ activity_feed core', () => {
  test('the sheet shows what the list shows when the core resolved a name the record also stores', async () => {
    // A send that captured "Alice" at send time, and a receive from the SAME
    // address with no stored name. The receive is what makes the core ask
    // (`item.alias.is_some()` skips the send), and the answer then applies to
    // every row for that address — including the send.
    mockStorage.set(TX_KEY, JSON.stringify([
      tx({ id: 'sent-1', toName: STORED_NAME }),
      tx({ id: 'recv-1', type: 'receive', from: PEER, to: ME, timestamp: WHEN - 60 }),
    ]));
    mockResolve.mockImplementation(async (addr) =>
      addr.toLowerCase() === PEER.toLowerCase() ? { name: RESOLVED_NAME } : null,
    );

    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    const view = h.latest();
    const sent = items(view).find((i) => i.id === 'sent-1')!;
    const record = records.find((r) => r.id === 'sent-1')!;

    // The premise: the two sources genuinely disagree, so the precedence is
    // observable rather than accidentally satisfied.
    expect(record.toName).toBe(STORED_NAME);
    expect(sent.alias).toBe(RESOLVED_NAME);
    expect(sent.alias).not.toBe(record.toName);

    // The list renders `item.alias`; the sheet must land on the same string.
    expect(detailCounterpartyAlias(record.toName, aliasById(view).get('sent-1'))).toBe(sent.alias);

    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('with nothing resolved, the stored send-time name still names the sheet', async () => {
    // The core leaves `alias` as the stored name when it has no better answer
    // (and never even asks — invariant ⑦). The fallback must survive.
    mockStorage.set(TX_KEY, JSON.stringify([tx({ id: 'sent-1', toName: STORED_NAME })]));

    const h = open();
    h.session.dispatch({ type: 'account_switched', address: ME });
    await settle();

    const view = h.latest();
    const sent = items(view).find((i) => i.id === 'sent-1')!;
    expect(sent.alias).toBe(STORED_NAME);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(detailCounterpartyAlias(STORED_NAME, aliasById(view).get('sent-1'))).toBe(STORED_NAME);

    h.session.dispose();
  });

  test('a row the committed view does not carry still names its counterparty', () => {
    // The chain filter can hide the row whose sheet is open; `aliasById` then
    // has no entry for it. Answering `undefined` there would replace a name the
    // wallet already knows with a bare 0x address.
    expect(detailCounterpartyAlias(STORED_NAME, undefined)).toBe(STORED_NAME);
    expect(detailCounterpartyAlias(undefined, undefined)).toBeUndefined();
  });
});
