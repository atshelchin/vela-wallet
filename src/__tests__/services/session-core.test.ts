// The `session` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite; what only exists on
// this side is the executor's storage codec and its two fail-closed mappings.
// Both are load-bearing in ways a hand-written double would hide:
//
//   - The wire shape (`public_key_hex` / `created_at_iso`) against the shape
//     actually on disk (`publicKeyHex` / `createdAt`, written by
//     `services/storage.ts` and still written by native). Getting it wrong
//     silently strands an existing install's accounts — or, worse, drops the
//     credential id every signature is looked up by.
//   - `ActiveIndexLoaded` is a `usize`. `loadActiveAccountIndex()` maps missing
//     and garbage to 0 but would hand a NEGATIVE stored value straight through,
//     and serde would reject it as a core fault — a wallet that never finishes
//     loading. The executor has to fail it closed at the wire.
//
// So both are asserted against the real core, over the real executor.
const mockStorage = new Map<string, string>();
const mockWriteFault = { on: false };
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => {
    if (mockWriteFault.on) throw new Error('storage unavailable');
    mockStorage.set(key, val);
  }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier to
// `index.web.ts`, which is why the session module imports it bare). Importing
// the web entry by explicit path first runs `initSync` on the planted bytes.
import { computeAddress } from '@/services/vela-core';
import { createWalletSession } from '@/services/wallet-state-core/session-session';
import * as resident from '@/services/wallet-state-core/session-resident';
import type { SessionView } from '@/services/wallet-state-core/generated/SessionView';
import { FIXTURE_ACCOUNTS } from '@/services/dev/passkey-fixture';

const ACCOUNTS_KEY = 'vela.accounts';
const INDEX_KEY = 'vela.activeAccountIndex';
const UPLOADS_KEY = 'vela.pendingUploads';

/** Exactly what `services/storage.ts` persists today. */
type Stored = {
  id: string;
  name: string;
  address: string;
  publicKeyHex: string;
  createdAt: string;
};

/** A stored record whose address already agrees with its public key. */
function stored(seed: number, name: string): Stored {
  const fixture = FIXTURE_ACCOUNTS[seed];
  return {
    id: fixture.id,
    name,
    address: computeAddress(fixture.publicKeyHex),
    publicKeyHex: fixture.publicKeyHex,
    createdAt: `2026-01-0${seed + 1}T00:00:00.000Z`,
  };
}

function plant(accounts: Stored[], index?: string) {
  mockStorage.set(ACCOUNTS_KEY, JSON.stringify(accounts));
  if (index !== undefined) mockStorage.set(INDEX_KEY, index);
}

function readStored(): Stored[] {
  return JSON.parse(mockStorage.get(ACCOUNTS_KEY) ?? '[]');
}

/** Let the effect loop's storage round-trips settle. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

function open() {
  const faults: unknown[] = [];
  let view: SessionView = {
    loading: true, has_wallet: false, address: '', active_index: 0,
    accounts: [], allowed_route: 'loading', sign_out: null,
  };
  const session = createWalletSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start({ type: 'boot' });
  return { session, faults, latest: () => view };
}

beforeEach(() => {
  mockStorage.clear();
  mockWriteFault.on = false;
});

describe('session core (web shell)', () => {
  test('boots from a store written by the TypeScript app, losing no field', async () => {
    const a = stored(0, 'One');
    const b = stored(1, 'Two');
    plant([a, b], '1');
    const h = open();
    // The first frame is the splash — no redirect judgment yet (invariant ⑧).
    expect(h.latest().loading).toBe(true);
    expect(h.latest().allowed_route).toBe('loading');

    await settle();
    const view = h.latest();
    expect(view.loading).toBe(false);
    expect(view.has_wallet).toBe(true);
    expect(view.allowed_route).toBe('wallet');
    expect(view.active_index).toBe(1);
    // Derived, never stored: the address IS the active account's (invariant ①).
    expect(view.address).toBe(b.address);
    // Every stored field survives the round trip — `id` is the passkey
    // credential id, and losing it would break signing, not just display.
    expect(view.accounts).toEqual([
      { index: 0, account: { id: a.id, name: 'One', address: a.address, public_key_hex: a.publicKeyHex, created_at_iso: a.createdAt } },
      { index: 1, account: { id: b.id, name: 'Two', address: b.address, public_key_hex: b.publicKeyHex, created_at_iso: b.createdAt } },
    ]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an account whose stored address is not its public key is corrected and written back', async () => {
    const good = stored(0, 'One');
    // Historically the credentialId landed in `address` — funding that string
    // reaches the wrong Safe, so it must be repaired BEFORE it is ever shown.
    const broken = { ...stored(1, 'Two'), address: FIXTURE_ACCOUNTS[1].id };
    const correct = computeAddress(broken.publicKeyHex);
    plant([good, broken], '1');

    const h = open();
    await settle();
    expect(h.latest().address).toBe(correct);
    // Written back in the STORED (camelCase) shape, with every other field intact.
    const onDisk = readStored().find((r) => r.id === broken.id)!;
    expect(onDisk).toEqual({ ...broken, address: correct });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a keyless legacy record is skipped, not rejected', async () => {
    // `loadAccounts()` is an unvalidated JSON parse: a record missing
    // `publicKeyHex`/`createdAt` must not fault the core (that would be a
    // forever spinner), and must keep its stored address.
    const legacy = { id: 'legacy', name: 'Old', address: '0x1234567890123456789012345678901234567890' };
    mockStorage.set(ACCOUNTS_KEY, JSON.stringify([legacy]));
    const h = open();
    await settle();
    expect(h.latest().loading).toBe(false);
    expect(h.latest().address).toBe(legacy.address);
    expect(h.latest().accounts[0].account.created_at_iso).toBe('');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a saved index past the end clamps to 0 and is repaired on disk', async () => {
    plant([stored(0, 'One')], '7');
    const h = open();
    await settle();
    expect(h.latest().active_index).toBe(0);
    expect(mockStorage.get(INDEX_KEY)).toBe('0');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test.each([['-3'], ['nonsense'], ['']])(
    'a stored index of %p reads as 0 instead of faulting the core',
    async (raw) => {
      plant([stored(0, 'One'), stored(1, 'Two')], raw);
      const h = open();
      await settle();
      expect(h.latest().loading).toBe(false);
      expect(h.latest().active_index).toBe(0);
      expect(h.faults).toEqual([]);
      h.session.dispose();
    },
  );

  test('an unreadable account store lands empty, never a forever spinner', async () => {
    mockStorage.set(ACCOUNTS_KEY, '{ not json');
    const h = open();
    await settle();
    expect(h.latest().loading).toBe(false);
    expect(h.latest().has_wallet).toBe(false);
    expect(h.latest().allowed_route).toBe('onboarding');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('switching persists the ROW index, and an out-of-range switch changes nothing', async () => {
    const a = stored(0, 'One');
    const b = stored(1, 'Two');
    plant([a, b], '0');
    const h = open();
    await settle();

    // The switcher dispatches `row.index`, not a display position (invariant ⑦).
    h.session.dispatch({ type: 'switch_account', index: h.latest().accounts[1].index });
    await settle();
    expect(h.latest().active_index).toBe(1);
    expect(h.latest().address).toBe(b.address);
    expect(mockStorage.get(INDEX_KEY)).toBe('1');

    h.session.dispatch({ type: 'switch_account', index: 9 });
    await settle();
    // A whole no-op: the address is never blanked and nothing is persisted.
    expect(h.latest().active_index).toBe(1);
    expect(h.latest().address).toBe(b.address);
    expect(mockStorage.get(INDEX_KEY)).toBe('1');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('the onboarding hand-off supersedes a restore that has not answered yet', async () => {
    plant([stored(0, 'One')], '0');
    const h = open();
    // No settle: the reads are still in flight when sign-in completes.
    const fresh = stored(1, 'Fresh');
    h.session.dispatch({
      type: 'account_established',
      mode: {
        type: 'set_wallet',
        accounts: [{ id: fresh.id, name: fresh.name, address: fresh.address, public_key_hex: fresh.publicKeyHex, created_at_iso: fresh.createdAt }],
        active_index: 0,
      },
    });
    await settle();
    // The stale stored list must not clobber the live one.
    expect(h.latest().accounts.map((row) => row.account.name)).toEqual(['Fresh']);
    expect(h.latest().address).toBe(fresh.address);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('sign-out warns about un-synced passkeys, and ends the sign-in on disk', async () => {
    const a = stored(0, 'One');
    plant([a], '0');
    const pending = { id: 'x', name: 'One', publicKeyHex: a.publicKeyHex, attestationObjectHex: '00', createdAt: a.createdAt };
    mockStorage.set(UPLOADS_KEY, JSON.stringify([pending]));
    const h = open();
    await settle();

    // No dialog until the pending-upload check has answered (invariant ⑤).
    expect(h.latest().sign_out).toBeNull();
    h.session.dispatch({ type: 'sign_out' });
    await settle();
    expect(h.latest().sign_out).toEqual({ pending_upload_warning: true });

    h.session.dispatch({ type: 'sign_out_confirmed' });
    await settle();
    expect(h.latest().has_wallet).toBe(false);
    expect(h.latest().address).toBe('');
    expect(h.latest().allowed_route).toBe('onboarding');
    // The two keys that ARE being signed in: gone, so a relaunch cannot restore
    // the session the user just ended (the whole point of the decision).
    expect(mockStorage.has(ACCOUNTS_KEY)).toBe(false);
    expect(mockStorage.has(INDEX_KEY)).toBe(false);
    // The outbox is NOT touched. A pending record is a public key the index
    // service never confirmed; deleting it means the retry never happens and
    // that credential can never be found at login again.
    expect(JSON.parse(mockStorage.get(UPLOADS_KEY)!)).toEqual([pending]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('sign-out keeps everything that belongs to the account, not the session', async () => {
    // The scope IS the decision: signing out is not "erase this device". These
    // keys survive because the same passkey derives the same address, so every
    // address-keyed record lines back up with no migration.
    const survivors: Record<string, string> = {
      'vela.transactionHistory': '[{"id":"t1"}]',
      'vela.customTokens': '[{"address":"0xabc"}]',
      'vela.customNetworks': '[{"id":"custom-999"}]',
      'vela.networkConfig': '[{"chainId":1}]',
      'vela.serviceEndpoints': '{"ethereumDataURL":"https://mine.example"}',
      'vela.rpcProviders': '{"alchemy":"key"}',
      'vela.priceSource': 'dex',
      'vela.localePrefs': '{"numberFormat":"de"}',
      // Owned by other modules entirely, and still worth pinning: a sign-out
      // that started deleting these would be a different feature — the one
      // `services/erase-device.ts` now implements.
      'vela.contacts': '[{"address":"0xdef"}]',
      'vela.browserHistory': '[{"url":"https://app.example"}]',
      'vela.perm.https://app.example': '{"accounts":["0x1"]}',
    };
    plant([stored(0, 'One')], '0');
    for (const [key, value] of Object.entries(survivors)) mockStorage.set(key, value);

    const h = open();
    await settle();
    h.session.dispatch({ type: 'sign_out' });
    await settle();
    h.session.dispatch({ type: 'sign_out_confirmed' });
    await settle();

    expect(mockStorage.has(ACCOUNTS_KEY)).toBe(false);
    for (const [key, value] of Object.entries(survivors)) {
      expect([key, mockStorage.get(key)]).toEqual([key, value]);
    }
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a corrupt pending-upload store opens the dialog unwarned, exactly as today', async () => {
    plant([stored(0, 'One')], '0');
    // `loadArray()` swallows its own parse/read errors and answers `[]`, so
    // `hasPendingUploads()` reports false rather than throwing — which is why
    // `PendingUploadsUnavailable` (the fail-closed variant the executor maps a
    // rejection to) is unreachable through this storage layer, today and
    // before. The dialog opens; it simply carries no warning.
    mockStorage.set(UPLOADS_KEY, '{ not json');
    const h = open();
    await settle();

    h.session.dispatch({ type: 'sign_out' });
    await settle();
    expect(h.latest().sign_out).toEqual({ pending_upload_warning: false });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('every write is best-effort: a failing disk never stalls the session', async () => {
    // The migration write-back AND the index persist both fail. The TS reducer
    // never rolled back a failed migration write, and `saveActiveAccountIndex`
    // was fire-and-forget — so the in-memory truth must stand either way, and
    // the core must not be left waiting on an answer it will never get.
    const broken = { ...stored(1, 'Two'), address: FIXTURE_ACCOUNTS[1].id };
    const correct = computeAddress(broken.publicKeyHex);
    plant([broken], '0');
    mockWriteFault.on = true;

    const h = open();
    await settle();
    expect(h.latest().loading).toBe(false);
    expect(h.latest().address).toBe(correct);
    // Nothing landed on disk; the store still holds the un-migrated record.
    expect(readStored()[0].address).toBe(broken.address);

    // Still live: a switch after the failed writes is honoured.
    h.session.dispatch({ type: 'switch_account', index: 0 });
    await settle();
    expect(h.latest().active_index).toBe(0);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});

// The resident singleton — declared last on purpose: it boots ONCE per process
// and is never disposed (that is the point), so it must not be woken before the
// suites above have had the storage to themselves.
describe('session resident (web)', () => {
  test('boots once, and keeps the account array stable across a switch', async () => {
    const a = stored(0, 'One');
    const b = stored(1, 'Two');
    plant([a, b], '0');

    const seen: unknown[] = [];
    const unsubscribe = resident.subscribeWalletSession((view) => seen.push(view));
    resident.ensureWalletSession();
    await settle();

    const first = resident.walletSessionAccounts();
    // The shape the wallet context holds, with every stored field intact.
    expect(first).toEqual([
      { id: a.id, name: 'One', address: a.address, publicKeyHex: a.publicKeyHex, createdAt: a.createdAt },
      { id: b.id, name: 'Two', address: b.address, publicKeyHex: b.publicKeyHex, createdAt: b.createdAt },
    ]);

    const settled = seen.length;
    resident.dispatchWalletSession({ type: 'switch_account', index: 1 });
    await settle();
    expect(resident.walletSessionView().active_index).toBe(1);
    // The SAME array: `SWITCH_ACCOUNT` kept `state.accounts` identity under the
    // reducer, and dozens of `[state.accounts]` effect deps still assume it.
    expect(resident.walletSessionAccounts()).toBe(first);

    // A view that did not change must not wake the app: switching to the
    // already-active index re-renders in the core and stops here.
    const afterSwitch = seen.length;
    resident.dispatchWalletSession({ type: 'switch_account', index: 1 });
    await settle();
    expect(seen.length).toBe(afterSwitch);
    expect(afterSwitch).toBeGreaterThan(settled);

    // A second boot is inert — the restore ran once for the process.
    resident.ensureWalletSession();
    await settle();
    expect(resident.walletSessionView().active_index).toBe(1);
    unsubscribe();
  });
});
