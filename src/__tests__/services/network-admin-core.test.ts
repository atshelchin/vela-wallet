// The `network_admin` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite. What only exists on
// this side is the executor: the storage codec (snake_case wire vs the camelCase
// records `services/storage.ts` writes and native still writes), the unified
// `eth_chainId` probe that replaced four near-identical implementations, the
// `/api/health` body decode the identity verdict is computed from, and the
// promise bridge the EIP-681 scan path resolves through. Getting the codec wrong
// would silently drop a user's custom networks and RPC overrides, so it is
// asserted against the real core rather than a hand-written double.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// The cache-flush side effects the core orders. Mocked at the module seam because
// the real pool opens sockets; what matters here is that the orders are placed.
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

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier to
// `index.web.ts`, which is why the session module imports it bare). Importing
// the web entry by explicit path first runs `initSync` on the planted bytes.
import '@/services/vela-core/index.web';
import { addCustomNetworkByChainId } from '@/services/add-network.web';
import { createNetworkAdminSession } from '@/services/wallet-state-core/network-admin-session.web';
import type { NetView } from '@/services/wallet-state-core/generated/NetView';

const CUSTOM_KEY = 'vela.customNetworks';
const CONFIG_KEY = 'vela.networkConfig';
const PROVIDERS_KEY = 'vela.rpcProviders';

/** Let the effect loop's storage / fetch round-trips settle. */
const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

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

/** Every JSON-RPC probe reports the same chain id, in hex, as a real node would. */
function rpcReporting(chainId: number): Handler {
  return () => ({ body: { jsonrpc: '2.0', id: 1, result: `0x${chainId.toString(16)}` } });
}

function open() {
  const faults: unknown[] = [];
  let view: NetView | null = null;
  const session = createNetworkAdminSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start({ type: 'started' });
  return { session, faults, latest: () => view as NetView };
}

beforeEach(() => {
  mockStorage.clear();
  refreshPool.mockClear();
  invalidateAllPools.mockClear();
  clearBundlerCache.mockClear();
  handler = () => null;
  installFetch();
});

describe('network_admin core (web shell)', () => {
  test('hydrates from stores written by the TypeScript services', async () => {
    // Exactly what `saveCustomNetwork` / `saveNetworkConfig` persist today.
    mockStorage.set(CUSTOM_KEY, JSON.stringify([{
      id: 'custom-999', displayName: 'Nine', chainId: 999, iconLabel: 'NIN',
      iconColor: '#888888', iconBg: '#F0F0F0', logoURL: 'https://x/logo.png',
      isL2: false, rpcURL: 'https://nine.example/rpc', explorerURL: 'https://nine.example',
      bundlerURL: 'https://relay/999', nativeSymbol: 'NINE', addedAt: '2026-01-01T00:00:00.000Z',
    }]));
    mockStorage.set(CONFIG_KEY, JSON.stringify([{
      chainId: 1, rpcURL: 'https://my-node.example/?apikey=SECRET',
      explorerURL: 'https://etherscan.io', bundlerURL: 'https://relay/1',
    }]));

    const h = open();
    await settle();
    const view = h.latest();
    expect(view.loaded).toBe(true);

    // The override is what the row shows — not the built-in default. (This is
    // the bug the card's re-seed effect existed for: the two differ only by a
    // query string, so a lost override reads as "my key vanished".)
    const ethereum = view.networks.find((n) => n.chain_id === 1)!;
    expect(ethereum.rpc_url).toBe('https://my-node.example/?apikey=SECRET');

    // Custom networks come after the built-ins and carry the delete affordance.
    const custom = view.networks[view.networks.length - 1];
    expect(custom).toMatchObject({
      id: 'custom-999',
      chain_id: 999,
      display_name: 'Nine',
      native_symbol: 'NINE',
      is_custom: true,
      rpc_url: 'https://nine.example/rpc',
      bundler_url: 'https://relay/999',
    });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a corrupt store hydrates as empty instead of stranding every write', async () => {
    mockStorage.set(CUSTOM_KEY, '{ not json');
    const h = open();
    await settle();
    // Loaded, not stuck: the core drops mutations until the stores are read, so
    // "unreadable" must still conclude or the whole surface goes silently inert.
    expect(h.latest().loaded).toBe(true);
    expect(h.latest().networks.every((n) => !n.is_custom)).toBe(true);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an override save writes the stored (camelCase) shape and keeps the bundler', async () => {
    mockStorage.set(CONFIG_KEY, JSON.stringify([{
      chainId: 1, rpcURL: 'https://old.example', explorerURL: 'https://etherscan.io',
      bundlerURL: 'https://custom-relay.example/1',
    }]));
    handler = rpcReporting(1);

    const h = open();
    await settle();
    h.session.dispatch({ type: 'override_expanded', chain_id: 1 });
    h.session.dispatch({ type: 'override_field_edited', chain_id: 1, field: 'rpc', value: 'https://new.example' });
    h.session.dispatch({ type: 'override_blurred', chain_id: 1 });
    await settle();

    expect(JSON.parse(mockStorage.get(CONFIG_KEY)!)).toEqual([{
      chainId: 1,
      rpcURL: 'https://new.example',
      explorerURL: 'https://etherscan.io',
      // The bundler is not editable per network; clobbering it would silently
      // move a custom network off its relay.
      bundlerURL: 'https://custom-relay.example/1',
    }]);
    // Both caches flushed, or the replaced endpoint keeps serving for an hour.
    expect(refreshPool).toHaveBeenCalledWith(1);
    expect(clearBundlerCache).toHaveBeenCalledWith(1);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an RPC that answers as another chain is refused, and the pool is untouched', async () => {
    mockStorage.set(CONFIG_KEY, JSON.stringify([{
      chainId: 1, rpcURL: 'https://old.example', explorerURL: 'https://etherscan.io',
      bundlerURL: 'https://relay/1',
    }]));
    // A real, healthy node — for Polygon. Pointing Ethereum at it would show
    // Polygon balances under Ethereum, which is the whole reason for the gate.
    handler = rpcReporting(137);

    const h = open();
    await settle();
    h.session.dispatch({ type: 'override_expanded', chain_id: 1 });
    h.session.dispatch({ type: 'override_field_edited', chain_id: 1, field: 'rpc', value: 'https://polygon.example' });
    h.session.dispatch({ type: 'override_blurred', chain_id: 1 });
    await settle();

    // Nothing written: the previously saved endpoint still serves.
    expect(JSON.parse(mockStorage.get(CONFIG_KEY)!)[0].rpcURL).toBe('https://old.example');
    expect(refreshPool).not.toHaveBeenCalled();
    expect(clearBundlerCache).not.toHaveBeenCalled();
    // The card can state both numbers as fact, because the endpoint said one.
    const row = h.latest().networks.find((n) => n.chain_id === 1)!;
    expect(row.rpc_chain_mismatch).toEqual({ expected_chain_id: 1, reported_chain_id: 137 });
    expect(row.rpc_save_deferred).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an RPC that cannot be reached is "unable to verify", so the save goes through', async () => {
    // The discipline the compatibility checker already follows: an endpoint we
    // could not reach is never condemned. `handler` returning null throws in
    // the fetch mock — a timeout/refusal, the commonest case for a private node
    // that is briefly down while its URL is being pasted in.
    handler = () => null;
    const h = open();
    await settle();
    h.session.dispatch({ type: 'override_expanded', chain_id: 1 });
    h.session.dispatch({ type: 'override_field_edited', chain_id: 1, field: 'rpc', value: 'https://unreachable.example' });
    h.session.dispatch({ type: 'override_blurred', chain_id: 1 });
    await settle();

    expect(JSON.parse(mockStorage.get(CONFIG_KEY)!)[0].rpcURL).toBe('https://unreachable.example');
    expect(refreshPool).toHaveBeenCalledWith(1);
    expect(h.latest().networks.find((n) => n.chain_id === 1)!.rpc_chain_mismatch).toBeNull();
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('the unified probe reports a live RPC ok and a dead one offline', async () => {
    handler = (url) => (url.includes('good') ? { body: { jsonrpc: '2.0', id: 1, result: '0x1' } } : null);
    const h = open();
    await settle();

    h.session.dispatch({ type: 'override_expanded', chain_id: 1 });
    h.session.dispatch({ type: 'override_field_edited', chain_id: 1, field: 'rpc', value: 'https://good.example' });
    h.session.dispatch({ type: 'override_field_edited', chain_id: 1, field: 'explorer', value: 'https://good-explorer.example' });
    await settle();
    let row = h.latest().networks.find((n) => n.chain_id === 1)!;
    expect(row.rpc_health?.type).toBe('ok');
    expect(row.explorer_health?.type).toBe('ok');

    h.session.dispatch({ type: 'override_field_edited', chain_id: 1, field: 'rpc', value: 'https://dead.example' });
    await settle();
    row = h.latest().networks.find((n) => n.chain_id === 1)!;
    expect(row.rpc_health).toEqual({ type: 'error' });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('/api/health identity decides the endpoint badge', async () => {
    handler = (url) => {
      if (url.includes('ethereum-data')) return { body: { service: 'ethereum-data', status: 'ok' } };
      if (url.includes('p256-index')) return { body: { service: 'something-else', status: 'ok' } };
      if (url.includes('vela-relay')) return { status: 500 };
      return { body: [{ base: 'USD', quote: 'EUR', rate: 0.92 }] };
    };
    const h = open();
    await settle();
    h.session.dispatch({ type: 'endpoints_opened' });
    await settle();

    const health = Object.fromEntries(h.latest().endpoints.map((e) => [e.field, e.health]));
    expect(health.ethereum_data.type).toBe('ok');
    // A passkey index pointed at the wrong service is a login-safety failure,
    // not a latency one — it must never read "ok" just because it answered.
    expect(health.passkey_index.type).toBe('invalid_response');
    expect(health.bundler_service).toMatchObject({ type: 'unreachable', http_status: 500 });
    expect(health.fiat_rates).toMatchObject({ type: 'ok', rate_count: 1 });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('clearing a provider key removes the provider from storage', async () => {
    mockStorage.set(PROVIDERS_KEY, JSON.stringify({ alchemy: 'AAA', drpc: 'DDD' }));
    handler = () => ({ body: { jsonrpc: '2.0', id: 1, result: '0x1' } });

    const h = open();
    await settle();
    h.session.dispatch({ type: 'providers_opened' });
    await settle();
    expect(h.latest().providers.find((p) => p.provider === 'alchemy')?.key).toBe('AAA');

    h.session.dispatch({ type: 'provider_key_edited', provider: 'alchemy', value: '  ' });
    h.session.dispatch({ type: 'provider_key_blurred', provider: 'alchemy' });
    await settle();

    // A cleared key REMOVES the provider — leaving `alchemy: ''` behind would
    // keep building unauthenticated URLs into the pool's provider tier.
    expect(JSON.parse(mockStorage.get(PROVIDERS_KEY)!)).toEqual({ drpc: 'DDD' });
    expect(invalidateAllPools).toHaveBeenCalled();
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});

// The scan path is the second entry point into the same machine. It is the whole
// reason this core exists as ONE implementation: today the Settings wizard
// refuses a duplicate chain and `add-network.ts` does not.
describe('EIP-681 scan recovery (add-network.web)', () => {
  test('refuses a chain that is already added — the gate this path never had', async () => {
    mockStorage.set(CUSTOM_KEY, JSON.stringify([{
      id: 'custom-999', displayName: 'Nine', chainId: 999, iconLabel: 'NIN',
      iconColor: '#888888', iconBg: '#F0F0F0', logoURL: '', isL2: false,
      rpcURL: 'https://nine.example/rpc', explorerURL: 'https://nine.example',
      bundlerURL: 'https://relay/999', nativeSymbol: 'NINE', addedAt: '2026-01-01T00:00:00.000Z',
    }]));

    const result = await addCustomNetworkByChainId(999);
    // Present either way, so the caller's "retry now that it exists" is honest —
    // and, critically, no second record was written over the first.
    expect(result.ok).toBe(true);
    expect(JSON.parse(mockStorage.get(CUSTOM_KEY)!)).toHaveLength(1);
  });

  test('an unknown chain resolves to not-found rather than hanging', async () => {
    // The registry has nothing; every fetch fails.
    handler = () => null;
    const result = await addCustomNetworkByChainId(424242);
    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });
});
