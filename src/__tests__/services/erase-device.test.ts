// "Erase this device" — the erase primitive itself, over a stubbed key-value
// store.
//
// This is the one destructive action in the product, so the assertions are
// about SCOPE, not about "storage is empty afterwards". Three things must hold
// and they pull in different directions:
//
//   - everything under `vela.` goes, including keys no module here has ever
//     heard of — the whole point of scanning the namespace instead of walking a
//     delete-list, and the exact drift that retired `clearAll()`;
//   - `vela.pendingUploads` stays, because a record there is a public key the
//     index service never confirmed and `retryPendingUploads()` is its only
//     remaining route home once the account list is gone too;
//   - keys outside the namespace are not this feature's to judge.
//
// Plus the honesty rule: an erase that did not finish must REJECT. A caller
// that signs the user out and navigates to onboarding on a resolved promise
// would otherwise be reporting a clean device that still holds its history.

const mockStorage = new Map<string, string>();
const multiRemoveMock = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(),
    multiRemove: (keys: string[]) => multiRemoveMock(keys),
  },
}));

/**
 * Working implementations, re-installed per test. `jest.clearAllMocks()` clears
 * recorded calls but NOT implementations, so a test that makes a write silently
 * fail would leak that backend into every test after it — and the ones after it
 * are the ones asserting a SUCCESSFUL erase.
 */
const workingBackend = () => {
  multiRemoveMock.mockImplementation(async (keys: string[]) => {
    for (const key of keys) mockStorage.delete(key);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    mockStorage.delete(key);
  });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => [...mockStorage.keys()]);
};

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ERASE_KEEP_KEYS,
  EraseIncompleteError,
  eraseDeviceData,
  isErasableKey,
} from '@/services/erase-device';
import {
  getEthereumDataURL,
  getLocalePrefs,
  getRpcProviderKeys,
  loadServiceEndpoints,
  loadLocalePrefs,
  loadRpcProviders,
  saveLocalePrefs,
  saveRpcProviders,
  saveServiceEndpoints,
} from '@/services/storage';
import { DEFAULT_LOCALE_PREFS, DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';

/**
 * A device with something under every writer in the app — including keys this
 * module has no knowledge of, which is the case a delete-list gets wrong.
 */
function seedDevice(): void {
  mockStorage.clear();
  const rows: Record<string, string> = {
    // storage.ts's own eleven
    'vela.accounts': '[{"id":"cred-1"}]',
    'vela.activeAccountIndex': '1',
    'vela.pendingUploads': '[{"id":"cred-2"}]',
    'vela.customTokens': '[]',
    'vela.networkConfig': '[]',
    'vela.serviceEndpoints': '{"ethereumDataURL":"https://example.invalid"}',
    'vela.transactionHistory': '[{"id":"tx1"}]',
    'vela.priceSource': 'dex',
    'vela.customNetworks': '[]',
    'vela.localePrefs': '{"numberFormat":"indian"}',
    'vela.rpcProviders': '{"alchemy":"secret-key"}',
    // Owned by other modules — none of these were ever in `clearAll()`.
    'vela.contacts': '[{"address":"0xabc"}]',
    'vela.contactGroups': '[]',
    'vela.contacts.dismissed': '{}',
    'vela.browserHistory': '[]',
    'vela.perm.https://app.uniswap.org': '{"accounts":["0xabc"]}',
    'vela.perm.https://opensea.io': '{"accounts":["0xabc"]}',
    'vela.balanceCache': '{}',
    'vela.balanceHidden': '1',
    'vela.displayCurrency': 'EUR',
    'vela.avatarStyle': 'initials',
    'vela.colorScheme': 'dark',
    'vela.textScale': '2',
    'vela.language': 'ja',
    'vela.rpc.banned': '{}',
    'vela.fiatRates.v1': '{}',
    'vela.receiveWarned.0xabc': '1',
    'vela.lastScan.100.0xabc': '19000000',
    'vela.tokenMeta.1.0xdead': '{}',
    'vela.ext.account.json': '{}',
    // A key invented after this test was written — the namespace scan must
    // still take it, with no edit here and none in erase-device.ts.
    'vela.somethingNobodyHasWrittenYet': '1',
    // Not ours.
    dev_unlocked: '1',
    'other.app.token': 'keep-me',
  };
  for (const [k, v] of Object.entries(rows)) mockStorage.set(k, v);
}

beforeEach(() => {
  seedDevice();
  jest.clearAllMocks();
  workingBackend();
});

describe('erase-device — scope', () => {
  test('removes every `vela.` key except the keep-list, and touches nothing else', async () => {
    const before = mockStorage.size;

    const removed = await eraseDeviceData();

    const left = [...mockStorage.keys()].sort();
    expect(left).toEqual(['dev_unlocked', 'other.app.token', 'vela.pendingUploads']);
    expect(removed).toHaveLength(before - left.length);
    // Named individually, because each one is a category `clearAll()` missed.
    for (const gone of [
      'vela.accounts',
      'vela.transactionHistory',
      'vela.contacts',
      'vela.contactGroups',
      'vela.browserHistory',
      'vela.perm.https://app.uniswap.org',
      'vela.perm.https://opensea.io',
      'vela.rpcProviders',
      'vela.serviceEndpoints',
      'vela.localePrefs',
      'vela.language',
      'vela.colorScheme',
      'vela.somethingNobodyHasWrittenYet',
    ]) {
      expect(mockStorage.has(gone)).toBe(false);
    }
  });

  test('the pending-upload outbox survives — it is the only keep', async () => {
    await eraseDeviceData();

    expect(ERASE_KEEP_KEYS).toEqual(['vela.pendingUploads']);
    expect(mockStorage.get('vela.pendingUploads')).toBe('[{"id":"cred-2"}]');
  });

  test('a key added tomorrow is erasable without editing the module', () => {
    expect(isErasableKey('vela.some.future.key')).toBe(true);
    expect(isErasableKey('vela.pendingUploads')).toBe(false);
    expect(isErasableKey('dev_unlocked')).toBe(false);
    // Prefix, not substring: another app's key that merely contains "vela."
    // is not in our namespace.
    expect(isErasableKey('other.vela.thing')).toBe(false);
  });

  test('erasing an already-erased device is a no-op that still succeeds', async () => {
    await eraseDeviceData();
    const removed = await eraseDeviceData();

    expect(removed).toEqual([]);
    expect([...mockStorage.keys()].sort()).toEqual([
      'dev_unlocked',
      'other.app.token',
      'vela.pendingUploads',
    ]);
  });
});

describe('erase-device — failure is reported, never assumed away', () => {
  test('a batch remove that throws falls back to one key at a time', async () => {
    multiRemoveMock.mockImplementationOnce(async () => {
      throw new Error('multiRemove unsupported');
    });

    await expect(eraseDeviceData()).resolves.not.toHaveLength(0);

    expect([...mockStorage.keys()].sort()).toEqual([
      'dev_unlocked',
      'other.app.token',
      'vela.pendingUploads',
    ]);
  });

  test('a key that survives the erase rejects instead of resolving', async () => {
    // Every removal silently fails — the shape of a storage backend that has
    // gone read-only. The verification pass, not the write calls, is what
    // notices.
    multiRemoveMock.mockImplementation(async () => {});
    const removeItem = AsyncStorage.removeItem as jest.Mock;
    removeItem.mockImplementation(async () => {});

    await expect(eraseDeviceData()).rejects.toBeInstanceOf(EraseIncompleteError);
    expect(mockStorage.get('vela.transactionHistory')).toBe('[{"id":"tx1"}]');
  });

  test('an enumeration failure rejects rather than erasing nothing quietly', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(eraseDeviceData()).rejects.toThrow('storage unavailable');
    expect(mockStorage.get('vela.accounts')).toBe('[{"id":"cred-1"}]');
  });
});

describe('erase-device — the in-memory caches go too', () => {
  /**
   * `storage.ts` keeps three caches that are read SYNCHRONOUSLY during render.
   * Clearing only the disk would leave this process serving the erased values
   * — and one of them is a set of provider API keys, i.e. credentials.
   */
  test('endpoints, locale prefs and RPC provider keys return to defaults', async () => {
    await saveServiceEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS, ethereumDataURL: 'https://example.invalid' });
    await saveLocalePrefs({ ...DEFAULT_LOCALE_PREFS, numberFormat: 'indian' });
    await saveRpcProviders({ alchemy: 'secret-key' });
    await loadServiceEndpoints();
    await loadLocalePrefs();
    await loadRpcProviders();

    expect(getEthereumDataURL()).toBe('https://example.invalid');
    expect(getLocalePrefs().numberFormat).toBe('indian');
    expect(getRpcProviderKeys()).toEqual({ alchemy: 'secret-key' });

    await eraseDeviceData();

    expect(getEthereumDataURL()).toBe(DEFAULT_SERVICE_ENDPOINTS.ethereumDataURL);
    expect(getLocalePrefs()).toEqual(DEFAULT_LOCALE_PREFS);
    expect(getRpcProviderKeys()).toEqual({});
  });

  test('a failed erase leaves the caches alone — nothing may look erased that is not', async () => {
    await saveRpcProviders({ alchemy: 'secret-key' });
    await loadRpcProviders();
    multiRemoveMock.mockImplementation(async () => {});
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async () => {});

    await expect(eraseDeviceData()).rejects.toBeInstanceOf(EraseIncompleteError);

    expect(getRpcProviderKeys()).toEqual({ alchemy: 'secret-key' });
  });
});
