// The recipient verdict — "is this address one you vouched for, what is it
// called, is it a wallet or a contract, and have you ever sent to it before" —
// exists TWICE, and this pins the two together.
//
//   • Rust — `contacts::project_recipient` (`app/contacts.rs:1108`) produces
//     `ContactRecipientView { saved, verified, display_name, is_contract,
//     first_interaction }` on every `inspect_recipient`.
//   • TypeScript — `getSavedContact` (`services/contacts.ts:253`) +
//     `resolveRecipientRisk` (`services/recipient-risk.ts:75`), which is what
//     iOS/Android run (Hermes has no WebAssembly) and what the web shell still
//     calls for the wallet-vs-contract half (`ContractBar.tsx:66`,
//     `useSendController.ts:569`).
//
// Neither copy can be deleted, so what has to be prevented is DRIFT. Each field
// is a trust signal a user reads before an irreversible transfer:
//
//   * `verified` — the green check. Saved AND starred, and nothing else; a
//     poisoned look-alike must never earn it.
//   * `is_contract` — an EIP-7702 delegated EOA is a PERSON'S wallet (Vela's own
//     accounts delegate). Badging it "Contract" trains users to ignore the badge;
//     missing a real contract invites an irreversible send into a token contract.
//   * `first_interaction` — the address-poisoning tell. It must count dApp
//     transactions and legacy untyped rows, and must NOT count incoming
//     transfers (a poisoner can send you dust to look familiar).
//
// This suite also settles a standing claim about the tombstone: that the core
// answers `saved`/`verified` off a DELETED contact because `project_recipient`
// never consults `model.tombstones`. See the two `deleted contact` scenarios —
// deletion removes the entry from `model.saved` (`contacts.rs:488`) and from the
// `vela.contacts` bytes, so there is nothing left for either side to find, and
// the tombstone only ever suppresses a history-derived *suggestion*.
/* eslint-disable import/first */

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

let historyRows: unknown[] = [];
jest.mock('@/services/storage', () => ({
  loadTransactions: jest.fn(async () => historyRows),
}));

let identityAnswer: { name: string; source: string } | null = null;
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: jest.fn(async () => identityAnswer),
}));

/** `eth_getCode`'s answer for the scenario in flight — a hex string, or an error. */
let codeAnswer: { result: string } | { error: { code: number; message: string } } = { result: '0x' };
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: jest.fn(async () => ({ jsonrpc: '2.0', id: 1, ...codeAnswer })),
}));

// jest lists no `.web.ts` in `moduleFileExtensions`, so the bare specifier the
// session module imports (metro resolves it to the web variant) lands on the
// native stub that throws. Point it at the real web session, as metro does.
jest.mock('@/services/wallet-state-core/contacts-session', () =>
  require('@/services/wallet-state-core/contacts-session'),
);

// The wasm only initialises through the explicit web entry.
import '@/services/vela-core';

import { createContactsSession } from '@/services/wallet-state-core/contacts-session';
import type { ContactsView } from '@/services/wallet-state-core/generated/ContactsView';

import { clearContactsCache, contactDisplayName, getSavedContact } from '@/services/contacts';
import { resolveRecipientIdentity } from '@/services/recipient-identity';
import { clearRecipientRiskCache, resolveRecipientRisk } from '@/services/recipient-risk';

const CONTACTS_KEY = 'vela.contacts';
const DISMISSED_KEY = 'vela.contacts.dismissed';
const CHAIN = 8453;

const ME = '0x00000000000000000000000000000000000000aa';
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';

/** `0xef0100 ++ impl` — the EIP-7702 delegation designator, exactly 23 bytes. */
const DELEGATED = `0xef0100${'33'.repeat(20)}`;
const BYTECODE = '0x6080604052348015600f57600080fd5b50';

type StoredContact = {
  address: string;
  name?: string;
  resolvedName?: string;
  kind: string;
  favorite?: boolean;
  txCount: number;
  lastUsed: number;
  firstSeen: number;
  source: 'manual' | 'auto';
};

const manual = (address: string, extra: Partial<StoredContact> = {}): StoredContact => ({
  address,
  kind: 'unknown',
  txCount: 0,
  lastUsed: 1,
  firstSeen: 1,
  source: 'manual',
  ...extra,
});

/** The comparable verdict — the judgements, never the words that render them. */
interface Verdict {
  saved: boolean;
  verified: boolean;
  displayName: string | null;
  isContract: boolean | null;
  firstInteraction: boolean;
}

interface Scenario {
  name: string;
  address: string;
  contacts?: StoredContact[];
  /** `vela.contacts.dismissed` — address → epoch ms it was deleted. */
  dismissed?: Record<string, number>;
  history?: unknown[];
  code?: { result: string } | { error: { code: number; message: string } };
  identity?: { name: string; source: string } | null;
}

const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

function plant(scenario: Scenario) {
  mockStorage.clear();
  mockStorage.set(CONTACTS_KEY, JSON.stringify(scenario.contacts ?? []));
  mockStorage.set(DISMISSED_KEY, JSON.stringify(scenario.dismissed ?? {}));
  historyRows = scenario.history ?? [];
  codeAnswer = scenario.code ?? { result: '0x' };
  identityAnswer = scenario.identity ?? null;
  clearContactsCache();
  clearRecipientRiskCache();
}

/** The Rust core, driven for real through the web session. */
async function coreVerdict(scenario: Scenario): Promise<Verdict> {
  let view: ContactsView | null = null;
  const session = createContactsSession({
    onView: (next) => { view = next; },
    onError: (error) => { throw error; },
  });
  try {
    session.start({ type: 'account_switched', my_address: ME });
    await settle();
    session.dispatch({ type: 'inspect_recipient', chain_id: CHAIN, address: scenario.address });
    await settle();
    const recipient = (view as ContactsView | null)?.recipient;
    if (!recipient) throw new Error('the core projected no recipient');
    return {
      saved: recipient.saved,
      verified: recipient.verified,
      displayName: recipient.display_name,
      isContract: recipient.is_contract,
      firstInteraction: recipient.first_interaction,
    };
  } finally {
    session.dispose();
  }
}

/**
 * The TypeScript twin, exactly as native assembles it: the saved-contact read,
 * the recipient-risk probe, and `RecipientTrust`'s display fallback (contact
 * name → cached identity name → the live lookup).
 */
async function nativeVerdict(scenario: Scenario): Promise<Verdict> {
  const contact = await getSavedContact(scenario.address);
  const risk = await resolveRecipientRisk(CHAIN, scenario.address);
  const stored = contact ? contactDisplayName(contact) : '';
  // `RecipientTrust.tsx:75-77` / `use-contacts-book.ts:135-140`: a saved-but-
  // unnamed contact, and an unsaved recipient, both fall through to the live
  // identity. The core resolves the same lookup itself and caches it.
  const live = stored ? null : (await resolveRecipientIdentity(scenario.address))?.name ?? null;
  return {
    saved: !!contact,
    verified: !!contact?.favorite,
    displayName: stored || live,
    isContract: risk.isContract,
    firstInteraction: risk.firstInteraction,
  };
}

const send = (to: string, timestamp = 1_000) => ({ type: 'send', to, timestamp });

const SCENARIOS: Scenario[] = [
  {
    name: 'never seen: not saved, an EOA, first interaction',
    address: BOB,
  },
  {
    name: 'saved and starred — the only state that earns the green check',
    address: ALICE,
    contacts: [manual(ALICE, { name: 'Alice', favorite: true })],
  },
  {
    name: 'saved but not starred — saved, not verified',
    address: ALICE,
    contacts: [manual(ALICE, { name: 'Alice' })],
  },
  {
    name: 'saved without a name — the live identity supplies the display name',
    address: ALICE,
    contacts: [manual(ALICE)],
    identity: { name: 'alice.eth', source: 'ens' },
  },
  {
    name: 'unsaved but named on-chain — identity only, still no trust',
    address: BOB,
    identity: { name: 'vitalik.eth', source: 'ens' },
  },
  {
    name: 'a cached resolved name outranks the live lookup',
    address: ALICE,
    contacts: [manual(ALICE, { resolvedName: 'alice.base.eth' })],
    identity: { name: 'something-else.eth', source: 'ens' },
  },
  {
    name: 'deleted contact: gone from the ledger, tombstone on disk',
    address: ALICE,
    contacts: [],
    dismissed: { [ALICE]: 5_000 },
  },
  {
    name: 'deleted contact that still has send history — a suggestion, never "saved"',
    address: ALICE,
    contacts: [],
    dismissed: { [ALICE]: 5_000 },
    history: [send(ALICE, 1_000)],
  },
  {
    name: 'EIP-7702 delegated EOA is a WALLET, not a contract',
    address: BOB,
    code: { result: DELEGATED },
  },
  {
    name: 'bytecode present — a contract',
    address: BOB,
    code: { result: BYTECODE },
  },
  {
    name: 'RPC error — unknown, never a false alarm',
    address: BOB,
    code: { error: { code: -32000, message: 'server error' } },
  },
  {
    name: 'a prior send is not a first interaction',
    address: BOB,
    history: [send(BOB)],
  },
  {
    name: 'a prior dApp transaction is not a first interaction either',
    address: BOB,
    history: [{ type: 'dapp_tx', to: BOB, timestamp: 1_000 }],
  },
  {
    name: 'a legacy untyped record still counts as a prior interaction',
    address: BOB,
    history: [{ to: BOB, timestamp: 1_000 }],
  },
  {
    name: 'an INCOMING transfer is not an interaction — dust poisoning must not look familiar',
    address: BOB,
    history: [{ type: 'receive', to: BOB, timestamp: 1_000 }],
  },
  {
    name: 'history is matched case-insensitively',
    address: BOB,
    history: [send(BOB.toUpperCase().replace('0X', '0x'))],
  },
  {
    name: 'a send to someone else leaves this address first-time',
    address: BOB,
    history: [send(ALICE)],
  },
  {
    name: 'malformed address: no lookups, no verdict, no first-time alarm',
    address: '0xnope',
    contacts: [manual('0xnope', { name: 'Typo', favorite: true })],
  },
  {
    name: 'a saved contact that is also a contract keeps both answers',
    address: ALICE,
    contacts: [manual(ALICE, { name: 'Vault', favorite: true })],
    code: { result: BYTECODE },
    history: [send(ALICE)],
  },
];

describe('recipient verdict: the Rust core vs the TypeScript twin', () => {
  test.each(SCENARIOS)('$name', async (scenario) => {
    // Native first, on pristine bytes: the core writes a resolved name back onto
    // a saved-but-unnamed contact, and that write must not be what the twin reads.
    plant(scenario);
    const native = await nativeVerdict(scenario);
    plant(scenario);
    const core = await coreVerdict(scenario);
    expect(native).toEqual(core);
  });

  test('the green check never widens: verified ⊆ saved, on both sides', async () => {
    for (const scenario of SCENARIOS) {
      plant(scenario);
      const native = await nativeVerdict(scenario);
      plant(scenario);
      const core = await coreVerdict(scenario);
      for (const [side, v] of [['native', native], ['core', core]] as const) {
        if (v.verified) expect([scenario.name, side, v.saved]).toEqual([scenario.name, side, true]);
      }
    }
  });
});

describe('the tombstone question, settled', () => {
  // The claim under test: `project_recipient` reads `model.saved` and never
  // looks at `model.tombstones`, therefore a deleted contact still reads as
  // saved/verified in the core while the shell says unsaved.
  const scenario: Scenario = {
    name: 'deleted',
    address: ALICE,
    contacts: [manual(ALICE, { name: 'Alice', favorite: true })],
    history: [send(ALICE, 1_000)],
  };

  test('deleting through the core drops the entry from the ledger AND the stored bytes', async () => {
    plant(scenario);
    let view: ContactsView | null = null;
    const session = createContactsSession({
      onView: (next) => { view = next; },
      onError: (error) => { throw error; },
    });
    session.start({ type: 'account_switched', my_address: ME });
    await settle();

    session.dispatch({ type: 'inspect_recipient', chain_id: CHAIN, address: ALICE });
    await settle();
    expect((view as ContactsView | null)?.recipient).toMatchObject({ saved: true, verified: true });

    session.dispatch({ type: 'delete', address: ALICE, now_ms: 9_000 });
    await settle();

    // The projection follows the ledger, not a tombstone lookup: the contact is
    // simply not there any more.
    expect((view as ContactsView | null)?.recipient).toMatchObject({
      saved: false,
      verified: false,
    });
    // …and the same is true of the bytes the TypeScript twin reads, which is why
    // the two agree without either of them consulting `vela.contacts.dismissed`.
    expect(JSON.parse(mockStorage.get(CONTACTS_KEY)!)).toEqual([]);
    expect(JSON.parse(mockStorage.get(DISMISSED_KEY)!)).toEqual({ [ALICE]: 9_000 });
    clearContactsCache();
    expect(await getSavedContact(ALICE)).toBeNull();

    // The tombstone's actual job: keep the address out of the merged book even
    // though a send to it is still in history.
    expect((view as ContactsView | null)?.contacts.map((c) => c.address)).toEqual([]);
    session.dispose();
  });

  test('a send AFTER the deletion resurfaces the suggestion — but never as "saved"', async () => {
    plant({ ...scenario, contacts: [], dismissed: { [ALICE]: 5_000 }, history: [send(ALICE, 6_000)] });
    let view: ContactsView | null = null;
    const session = createContactsSession({
      onView: (next) => { view = next; },
      onError: (error) => { throw error; },
    });
    session.start({ type: 'account_switched', my_address: ME });
    await settle();
    session.dispatch({ type: 'inspect_recipient', chain_id: CHAIN, address: ALICE });
    await settle();

    expect((view as ContactsView | null)?.contacts.map((c) => [c.address, c.source])).toEqual([
      [ALICE, 'auto'],
    ]);
    expect((view as ContactsView | null)?.recipient).toMatchObject({ saved: false, verified: false });
    clearContactsCache();
    expect(await getSavedContact(ALICE)).toBeNull();
    session.dispose();
  });
});
