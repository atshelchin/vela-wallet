// The `ext_cache` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite (`app_ext_cache.rs`).
// What only exists on this side is the shell codec, and it is the security
// boundary: the App Group container is world-readable on a jailbroken device,
// so what the snapshot BECOMES ON DISK — the key spelling, the per-account
// field set, the attestation value format — is asserted here against the real
// core rather than a hand-written double.
//
// This surface is iOS-only in production (`AppGroup.isSupportedSync`), which is
// exactly why it has no e2e coverage: the App Group is stubbed true here so the
// file the extension would read is observable at all.
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

const mockFiles = new Map<string, string>();
const mockRemoved: string[] = [];
jest.mock('@/modules/app-group', () => ({
  isSupportedSync: () => true,
  writeFile: jest.fn(async (name: string, json: string) => { mockFiles.set(name, json); }),
  remove: jest.fn(async (name: string) => { mockRemoved.push(name); mockFiles.delete(name); }),
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier to
// `index.web.ts`, which is why the session module imports it bare). Importing
// the web entry by explicit path first runs `initSync` on the planted bytes.
import '@/services/vela-core';
import { createExtCacheSession } from '@/services/wallet-state-core/ext-cache-session.web';
import { onExtensionSign } from '@/services/extension-sign-bus';
import type { Account } from '@/services/wallet-state-core/generated/Account';
import type { ExtCacheEvent } from '@/services/wallet-state-core/generated/ExtCacheEvent';

const ACCOUNT_FILE = 'vela.ext.account.json';
const UL_VERIFIED_KEY = 'vela.ext.ulVerifiedAt';
const UL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** A wallet account as the app holds it — deliberately rich. */
function acct(name: string, address: string): Account {
  return {
    id: `cred-${name}`,
    name,
    address,
    public_key_hex: '04deadbeef',
    created_at_iso: '2026-01-01T00:00:00.000Z',
  };
}

const ANN = acct('Ann', '0xaaa');
const BOB = acct('Bob', '0xbbb');

function changed(overrides: Partial<Extract<ExtCacheEvent, { type: 'accounts_changed' }>> = {}) {
  return {
    type: 'accounts_changed',
    is_loading: false,
    has_wallet: true,
    accounts: [ANN, BOB],
    active: ANN,
    theme: 'dark',
    locale: 'zh',
    ...overrides,
  } as ExtCacheEvent;
}

/** Let the effect loop's read → write round-trip settle. */
async function settle() {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function open() {
  const faults: unknown[] = [];
  const session = createExtCacheSession({
    onView: () => {},
    onError: (error) => { faults.push(error); },
  });
  return { session, faults };
}

/** The snapshot as it would sit on disk. */
function onDisk(): Record<string, unknown> {
  const raw = mockFiles.get(ACCOUNT_FILE);
  if (raw === undefined) throw new Error('no snapshot was written');
  return JSON.parse(raw);
}

beforeEach(() => {
  mockStorage.clear();
  mockFiles.clear();
  mockRemoved.length = 0;
});

describe('ext_cache through the web shell', () => {
  it('writes the file the extension reads, with the shell-owned keys', async () => {
    const { session, faults } = open();
    session.dispatch(changed());
    await settle();
    session.dispose();

    expect(faults).toEqual([]);
    const snapshot = onDisk();
    expect(snapshot.address).toBe('0xaaa');
    expect(snapshot.name).toBe('Ann');
    // Stable default (invariant ⑤) — never the volatile dApp-bridge chainId.
    expect(snapshot.chainId).toBe(1);
    expect(snapshot.theme).toBe('dark');
    expect(snapshot.locale).toBe('zh');
    expect(typeof snapshot.updatedAt).toBe('number');
    // The catalog is the shell's contribution, merged after the core decided.
    const chains = snapshot.chains as Record<string, { rpcUrl: string }>;
    expect(Object.keys(chains).length).toBeGreaterThan(0);
    expect(typeof chains['1'].rpcUrl).toBe('string');
  });

  it('lands each account on disk as exactly { name, address }', async () => {
    const { session } = open();
    session.dispatch(changed());
    await settle();
    session.dispose();

    const accounts = onDisk().accounts as Record<string, unknown>[];
    expect(accounts).toEqual([
      { name: 'Ann', address: '0xaaa' },
      { name: 'Bob', address: '0xbbb' },
    ]);
    // Invariant ① end to end: the credential id and key material were handed to
    // the core and did not survive into the world-readable file.
    for (const account of accounts) {
      expect(Object.keys(account).sort()).toEqual(['address', 'name']);
    }
    expect(mockFiles.get(ACCOUNT_FILE)).not.toContain('deadbeef');
    expect(mockFiles.get(ACCOUNT_FILE)).not.toContain('cred-Ann');
  });

  it('neither writes nor clears during the boot restore window', async () => {
    const { session } = open();
    session.dispatch(changed({ is_loading: true, has_wallet: false, accounts: [], active: null }));
    await settle();
    session.dispose();

    // Invariant ②: clearing here would permanently delete a logged-in user's
    // cache when a restore is slow or fails.
    expect(mockFiles.size).toBe(0);
    expect(mockRemoved).toEqual([]);
  });

  it('removes the file once the wallet is genuinely gone', async () => {
    const { session } = open();
    session.dispatch(changed());
    await settle();
    expect(mockFiles.has(ACCOUNT_FILE)).toBe(true);

    session.dispatch(changed({ has_wallet: false, accounts: [], active: null }));
    await settle();
    session.dispose();

    expect(mockRemoved).toEqual([ACCOUNT_FILE]);
    expect(mockFiles.has(ACCOUNT_FILE)).toBe(false);
  });

  it('reads the persisted attestation and reports it as fresh inside the TTL', async () => {
    const ts = Date.now() - 60_000;
    mockStorage.set(UL_VERIFIED_KEY, String(ts));

    const { session } = open();
    session.dispatch(changed());
    await settle();
    session.dispose();

    const snapshot = onDisk();
    expect(snapshot.ulVerified).toBe(true);
    expect(snapshot.ulVerifiedAt).toBe(ts);
  });

  it('expires the attestation at the TTL but keeps the raw timestamp on disk', async () => {
    const ts = Date.now() - (UL_TTL_MS + 60_000);
    mockStorage.set(UL_VERIFIED_KEY, String(ts));

    const { session } = open();
    session.dispatch(changed());
    await settle();
    session.dispose();

    const snapshot = onDisk();
    // The extension falls back to the always-safe velawallet:// scheme...
    expect(snapshot.ulVerified).toBe(false);
    // ...but still compares the raw value against its own self-heal veto.
    expect(snapshot.ulVerifiedAt).toBe(ts);
  });

  it('reports never-attested when storage holds nothing', async () => {
    const { session } = open();
    session.dispatch(changed());
    await settle();
    session.dispose();

    const snapshot = onDisk();
    expect(snapshot.ulVerified).toBe(false);
    expect(snapshot.ulVerifiedAt).toBe(0);
  });

  it('persists the attestation a getvela.app /sign link proves, and drives the sign', async () => {
    const rids: string[] = [];
    const unsubscribe = onExtensionSign((rid) => rids.push(rid));
    const now = Date.now();

    const { session, faults } = open();
    session.dispatch(changed());
    await settle();
    session.dispatch({
      type: 'universal_link_opened',
      url: 'https://getvela.app/sign?rid=abc123',
      now_ms: now,
    });
    await settle();
    session.dispose();
    unsubscribe();

    expect(faults).toEqual([]);
    expect(rids).toEqual(['abc123']);
    // The value format `getUniversalLinkVerifiedAt` parses back, and the core's
    // own clock — not a second `Date.now()` read in the shell.
    expect(mockStorage.get(UL_VERIFIED_KEY)).toBe(String(now));
    // The follow-up write re-read the flag rather than trusting the persist.
    expect(onDisk().ulVerified).toBe(true);
    expect(onDisk().ulVerifiedAt).toBe(now);
  });

  it('attests for the ul-selftest probe without driving a sign', async () => {
    const rids: string[] = [];
    const unsubscribe = onExtensionSign((rid) => rids.push(rid));
    const now = Date.now();

    const { session } = open();
    session.dispatch(changed());
    await settle();
    session.dispatch({
      type: 'universal_link_opened',
      url: 'https://getvela.app/sign?rid=ul-selftest',
      now_ms: now,
    });
    await settle();
    session.dispose();
    unsubscribe();

    expect(rids).toEqual([]);
    expect(mockStorage.get(UL_VERIFIED_KEY)).toBe(String(now));
  });

  it('ignores a launch URL that only looks like the attested link', async () => {
    const rids: string[] = [];
    const unsubscribe = onExtensionSign((rid) => rids.push(rid));

    const { session } = open();
    session.dispatch(changed());
    await settle();
    for (const url of [
      'https://getvela.app.evil.com/sign?rid=abc',
      'https://evil.com/?u=https://getvela.app/sign',
      'velawallet://sign?rid=abc',
      'http://localhost:8081/',
    ]) {
      session.dispatch({ type: 'universal_link_opened', url, now_ms: Date.now() });
    }
    await settle();
    session.dispose();
    unsubscribe();

    expect(rids).toEqual([]);
    expect(mockStorage.has(UL_VERIFIED_KEY)).toBe(false);
  });

  it('normalizes the theme the file advertises by strict equality', async () => {
    for (const [preference, expected] of [
      ['light', 'light'],
      ['dark', 'dark'],
      ['auto', 'auto'],
      ['Dark', 'auto'],
      ['', 'auto'],
    ] as const) {
      mockFiles.clear();
      const { session } = open();
      session.dispatch(changed({ theme: preference }));
      await settle();
      session.dispose();
      expect(onDisk().theme).toBe(expected);
    }
  });
});
