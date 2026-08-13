// The `contacts` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules — the saved ⊕ history merge, tombstones, the group
// ledger, the existing-wins import — are covered by the Rust suite. What only
// exists on this side is the executor, and specifically its storage codec: the
// core speaks snake_case with explicit nulls, while `vela.contacts` /
// `vela.contacts.dismissed` / `vela.contactGroups` hold the camelCase shapes
// `services/contacts.ts` has always written, which native still reads and the
// e2e suites still seed. Getting that translation wrong would silently empty an
// existing install's address book on first web launch, so it is asserted
// round-trip against the real core rather than a double.
//
// The second thing asserted here is the event the TypeScript service never had:
// `AccountSwitched` must drop the previous account's history, or one account's
// recipients keep suggesting themselves under the next.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

const loadTransactions = jest.fn(async (): Promise<unknown[]> => []);
jest.mock('@/services/storage', () => ({
  loadTransactions: () => loadTransactions(),
}));

jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: jest.fn(async () => null),
}));

jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: jest.fn(async () => ({ jsonrpc: '2.0', id: 1, result: '0x' })),
}));

// Importing the facade first is load-bearing: `@/services/vela-core` runs
// `initSync` on the planted wasm bytes at import time, so the core is
// initialised before anything below constructs a session.
import '@/services/vela-core';
import { createContactsSession } from '@/services/wallet-state-core/contacts-session';
import type { ContactsView } from '@/services/wallet-state-core/generated/ContactsView';

const CONTACTS_KEY = 'vela.contacts';
const DISMISSED_KEY = 'vela.contacts.dismissed';
const GROUPS_KEY = 'vela.contactGroups';

const ME = '0x742d35cc6634c0532925a3b844bc454e4438f44e';
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

/** Let the effect loop's storage round-trips settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function open() {
  const views: ContactsView[] = [];
  const loop = createContactsSession({
    onView: (view) => views.push(view),
    onError: (error) => { throw error; },
  });
  loop.start({ type: 'account_switched', my_address: ME });
  return { loop, latest: () => views[views.length - 1]! };
}

const readKey = (key: string) => JSON.parse(mockStorage.get(key) ?? 'null');

beforeEach(() => {
  mockStorage.clear();
  loadTransactions.mockReset();
  loadTransactions.mockResolvedValue([]);
});

describe('storage codec', () => {
  it('reads the camelCase book `services/contacts.ts` wrote', async () => {
    mockStorage.set(CONTACTS_KEY, JSON.stringify([
      // Exactly the shape the send-to-group e2e seeds: no `favorite`, no
      // `resolvedName`, no `note`.
      { address: A, name: 'Alice', kind: 'unknown', txCount: 0, lastUsed: 1, firstSeen: 1, source: 'manual' },
      { address: B, name: 'Bob', kind: 'account', favorite: true, note: 'ops', resolvedName: 'bob.eth', resolvedSource: 'ENS', txCount: 3, lastUsed: 9, firstSeen: 2, source: 'manual' },
    ]));
    mockStorage.set(GROUPS_KEY, JSON.stringify([{ id: 'grp_1', name: 'Payroll', members: [A, B] }]));

    const { loop, latest } = open();
    await settle();

    const view = latest();
    expect(view.loaded).toBe(true);
    // Favourites first — the core's sort.
    expect(view.contacts.map((c) => c.address)).toEqual([B, A]);
    expect(view.contacts[0]).toMatchObject({
      name: 'Bob',
      resolved_name: 'bob.eth',
      resolved_source: 'ENS',
      note: 'ops',
      kind: 'account',
      favorite: true,
      tx_count: 3,
      last_used_ms: 9,
      first_seen_ms: 2,
      source: 'manual',
    });
    // An absent `favorite` is `false`, not a deserialization failure.
    expect(view.contacts[1]).toMatchObject({ name: 'Alice', favorite: false, resolved_name: null });
    expect(view.groups).toEqual([
      expect.objectContaining({ id: 'grp_1', name: 'Payroll', color: null }),
    ]);
    expect(view.groups[0]!.members.map((m) => m.address)).toEqual([A, B]);
    loop.dispose();
  });

  it('writes the book back in the camelCase shape native still reads', async () => {
    mockStorage.set(CONTACTS_KEY, JSON.stringify([
      { address: A, name: 'Alice', kind: 'unknown', txCount: 0, lastUsed: 1, firstSeen: 1, source: 'manual' },
    ]));

    const { loop } = open();
    await settle();
    loop.dispatch({ type: 'toggle_favorite', address: A, now_ms: 1_000 });
    await settle();

    expect(readKey(CONTACTS_KEY)).toEqual([
      { address: A, name: 'Alice', kind: 'unknown', favorite: true, txCount: 0, lastUsed: 1, firstSeen: 1, source: 'manual' },
    ]);
    loop.dispose();
  });

  it('keeps the tombstone store an address → ms object, not a list', async () => {
    mockStorage.set(CONTACTS_KEY, JSON.stringify([
      { address: A, name: 'Alice', kind: 'unknown', txCount: 0, lastUsed: 1, firstSeen: 1, source: 'manual' },
    ]));
    mockStorage.set(DISMISSED_KEY, JSON.stringify({ [B]: 500 }));

    const { loop } = open();
    await settle();
    loop.dispatch({ type: 'delete', address: A, now_ms: 7_000 });
    await settle();

    expect(readKey(CONTACTS_KEY)).toEqual([]);
    expect(readKey(DISMISSED_KEY)).toEqual({ [B]: 500, [A]: 7000 });
    loop.dispose();
  });

  it('answers an unparseable store as an empty book instead of never loading', async () => {
    mockStorage.set(CONTACTS_KEY, '{not json');
    mockStorage.set(GROUPS_KEY, 'null');

    const { loop, latest } = open();
    await settle();

    expect(latest().loaded).toBe(true);
    expect(latest().contacts).toEqual([]);
    loop.dispose();
  });

  it('feeds send history in, so a recipient becomes a suggestion', async () => {
    loadTransactions.mockResolvedValue([
      { id: '1', type: 'send', to: B, toName: 'bob.eth', timestamp: 42 },
      // A dApp contract call is never a contact.
      { id: '2', type: 'dapp_tx', to: A, timestamp: 43 },
    ]);

    const { loop, latest } = open();
    await settle();

    expect(latest().contacts.map((c) => c.address)).toEqual([B]);
    expect(latest().contacts[0]).toMatchObject({ resolved_name: 'bob.eth', tx_count: 1, source: 'auto' });
    loop.dispose();
  });
});

describe('account switch', () => {
  it('drops the previous account\'s history instead of carrying it over', async () => {
    loadTransactions.mockResolvedValue([{ id: '1', type: 'send', to: B, timestamp: 42 }]);

    const { loop, latest } = open();
    await settle();
    expect(latest().contacts.map((c) => c.address)).toEqual([B]);

    // The next account has never sent to anyone.
    loadTransactions.mockResolvedValue([]);
    loop.dispatch({ type: 'account_switched', my_address: A });
    await settle();

    expect(latest().contacts).toEqual([]);
    loop.dispose();
  });
});
