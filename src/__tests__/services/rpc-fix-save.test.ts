// The RPC-recovery banner's save step, WEB — driven against the real
// `network_admin` core (Rust/wasm).
//
// This path exists for one situation: the user's endpoint for a chain is dead
// and they are pasting a replacement. It used to probe the URL in the component
// and refuse the save whenever the probe answered nothing — which is exactly the
// answer a browser gets from a perfectly good endpoint behind CORS, a slow node,
// or the same broken network that brought the user here. The refusal therefore
// landed hardest on the people the screen is for, and it wrote through
// `saveNetworkConfig` behind the core's back, so the core's own override ledger
// never learned the new URL.
//
// Both properties are asserted here against the real machine rather than a
// double, because both are about who decides and who writes.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// The cache flushes the core orders after a successful write. Mocked at the
// module seam because the real pool opens sockets; that they are ORDERED is the
// point — a saved endpoint that the pool keeps ignoring is not saved.
const refreshPool = jest.fn(async (_chainId: number) => {});
const invalidateAllPools = jest.fn();
jest.mock('@/services/rpc-pool', () => ({
  refreshPool: (chainId: number) => refreshPool(chainId),
  invalidateAllPools: () => invalidateAllPools(),
  probeRpcChainId: jest.fn(async () => null),
}));

const clearBundlerCache = jest.fn();
jest.mock('@/services/bundler-service', () => ({
  clearBundlerCache: (chainId: number) => clearBundlerCache(chainId),
}));

// Importing the facade first is load-bearing: `@/services/vela-core` runs
// `initSync` on the planted wasm bytes at import time, so the core is
// initialised before anything below constructs a session.
import '@/services/vela-core';
import { rpcFixVerdict, saveRpcFix } from '@/services/rpc-fix';
import type { NetNetworkRow } from '@/services/wallet-state-core/generated/NetNetworkRow';

const CONFIG_KEY = 'vela.networkConfig';

/** Gnosis — a built-in chain, so the core needs no custom-network record. */
const CHAIN = 100;

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | null;
let handler: Handler = () => null;

function installFetch() {
  (globalThis as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const answer = handler(String(url), init);
    if (!answer) throw new Error('network down');
    const status = answer.status ?? 200;
    const text = JSON.stringify(answer.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(text),
      text: async () => text,
    } as unknown as Response;
  });
}

function storedConfigs(): { chainId: number; rpcURL: string; explorerURL: string; bundlerURL: string }[] {
  const raw = mockStorage.get(CONFIG_KEY);
  return raw ? JSON.parse(raw) : [];
}

/** Let the effect loop's storage round-trips settle. */
const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

function row(over: Partial<NetNetworkRow> = {}): NetNetworkRow {
  return {
    id: 'gnosis',
    chain_id: CHAIN,
    display_name: 'Gnosis',
    native_symbol: 'xDAI',
    is_custom: false,
    rpc_url: 'https://rpc.gnosischain.com',
    explorer_url: 'https://gnosisscan.io',
    bundler_url: 'https://vela-relay.getvela.app/100',
    rpc_health: { type: 'checking' },
    explorer_health: { type: 'checking' },
    rpc_chain_mismatch: null,
    rpc_save_deferred: false,
    ...over,
  };
}

beforeEach(() => {
  refreshPool.mockClear();
  invalidateAllPools.mockClear();
  clearBundlerCache.mockClear();
  handler = () => null;
  installFetch();
});

describe('rpcFixVerdict — the three-way read of one row', () => {
  test('a deferred save is not a verdict', () => {
    expect(rpcFixVerdict(row({ rpc_save_deferred: true }))).toBeNull();
  });

  test('a confirmed mismatch reports BOTH ids, so the copy can state them as fact', () => {
    expect(
      rpcFixVerdict(row({ rpc_chain_mismatch: { expected_chain_id: CHAIN, reported_chain_id: 1 } })),
    ).toEqual({ kind: 'wrong-chain', expected: CHAIN, actual: 1 });
  });

  test('no mismatch and nothing deferred is a save', () => {
    expect(rpcFixVerdict(row())).toEqual({ kind: 'saved' });
  });

  test('a row with no card (or no row at all) never reads as a save', () => {
    expect(rpcFixVerdict(row({ rpc_health: null }))).toEqual({ kind: 'failed' });
    expect(rpcFixVerdict(undefined)).toEqual({ kind: 'failed' });
  });
});

describe('saveRpcFix (web) against the real core', () => {
  test('an endpoint that cannot be probed is SAVED — "cannot verify" is not "wrong"', async () => {
    // Every probe throws: the browser could not reach it. This is the whole
    // reason the screen is open, and the old shell-side gate refused it.
    handler = () => null;

    const outcome = await saveRpcFix(CHAIN, 'https://my-own-node.example/rpc');
    expect(outcome).toEqual({ kind: 'saved' });

    await settle();
    // ONE writer: the record lands in the core's ledger and is persisted to the
    // same key `services/storage.ts` uses, in the same camelCase shape.
    expect(storedConfigs()).toEqual([
      {
        chainId: CHAIN,
        rpcURL: 'https://my-own-node.example/rpc',
        explorerURL: 'https://gnosisscan.io',
        bundlerURL: 'https://vela-relay.getvela.app/100',
      },
    ]);
    // …and the caches were flushed, or the pool would keep serving the dead one.
    expect(refreshPool).toHaveBeenCalledWith(CHAIN);
    expect(clearBundlerCache).toHaveBeenCalledWith(CHAIN);
  });

  test('an endpoint that PROVES it serves another chain is refused, and nothing is written', async () => {
    const before = storedConfigs();
    // A live node answering `eth_chainId` with 1 (Ethereum), not 100.
    handler = () => ({ body: { jsonrpc: '2.0', id: 1, result: '0x1' } });

    const outcome = await saveRpcFix(CHAIN, 'https://actually-mainnet.example/rpc');
    expect(outcome).toEqual({ kind: 'wrong-chain', expected: CHAIN, actual: 1 });

    await settle();
    // The refusal is total: the previously saved endpoint still serves.
    expect(storedConfigs()).toEqual(before);
  });

  test('an endpoint that confirms the right chain is saved', async () => {
    handler = () => ({ body: { jsonrpc: '2.0', id: 1, result: `0x${CHAIN.toString(16)}` } });

    const outcome = await saveRpcFix(CHAIN, 'https://good.example/rpc');
    expect(outcome).toEqual({ kind: 'saved' });

    await settle();
    expect(storedConfigs().find((c) => c.chainId === CHAIN)?.rpcURL).toBe('https://good.example/rpc');
  });

  test('a chain the core knows nothing about fails instead of reporting a save', async () => {
    handler = () => null;
    expect(await saveRpcFix(424242, 'https://nowhere.example/rpc')).toEqual({ kind: 'failed' });
    await settle();
    expect(storedConfigs().some((c) => c.chainId === 424242)).toBe(false);
  });
});
