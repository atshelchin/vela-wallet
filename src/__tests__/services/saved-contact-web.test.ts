// "Is this address saved, and what is it called?" — the WEB read, asserted
// against the real `contacts` core.
//
// Four surfaces ask that question about a single address (the recipient name,
// the recipient trust badge, the signing panel's address identity, the signing
// summary line). They used to ask `getSavedContact` — the TypeScript store read
// in `services/contacts.ts:253` — while the core held the same ledger on web:
// two implementations of one decision, with the dangerous failure mode being a
// STALE NEGATIVE (a contact saved through the core rendering as "unknown", i.e.
// the anti-poisoning check silently off).
//
// `services/saved-contact.ts` routes them at the core instead. What is
// asserted here is that seam: the answer comes from the core's ledger, honours
// its "manual means saved" rule, and honours its deletion tombstone.

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

// The redirect that used to live here pointed the native module at the real
// web session. There is one module now, so mocking it to itself is what a
// stack overflow looks like — the import below already gets the real thing.

// Same reason as every other core test: the wasm only initialises through the
// explicit web entry, which jest will not pick by extension.
import '@/services/vela-core';
import { saveContactThroughCore } from '@/hooks/use-contacts-book';
import { savedContactFor } from '@/services/saved-contact';

const CONTACTS_KEY = 'vela.contacts';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

beforeAll(() => {
  // Planted before the resident session is built by the first read below.
  mockStorage.set(CONTACTS_KEY, JSON.stringify([
    { address: A, name: 'Alice', kind: 'unknown', favorite: true, txCount: 0, lastUsed: 1, firstSeen: 1, source: 'manual' },
  ]));
});

describe('savedContactFor (web)', () => {
  it('answers from the core ledger, waiting for it to load', async () => {
    // No settle first: the very first caller races the store read, which is the
    // normal case (a recipient row mounts before anything else touched the book)
    // and the one where answering "not saved" off an empty ledger would drop the
    // green check.
    const contact = await savedContactFor(A);
    expect(contact).toMatchObject({ address: A, name: 'Alice', favorite: true, source: 'manual' });
  });

  it('reports an unsaved address as null', async () => {
    expect(await savedContactFor(B)).toBeNull();
  });

  it('rejects a malformed address without consulting the ledger', async () => {
    expect(await savedContactFor('0xnope')).toBeNull();
  });

  it('sees a contact saved through the core, without a store re-read', async () => {
    saveContactThroughCore({ address: B, name: 'Bob' });
    await settle();
    expect(await savedContactFor(B)).toMatchObject({ address: B, name: 'Bob' });
  });
});
