/**
 * Drift gate — the chain-document parsing rules exist twice ON PURPOSE.
 *
 * `services/chain-registry.ts:75-194` (`parseChainData` and its three
 * extractors) is native's only implementation, because Hermes has no
 * WebAssembly; `parse_chain_data` in
 * `rust/crates/vela-core/src/app/network_admin.rs` is web's, and it is not
 * unreachable TypeScript either — `rpc-pool-endpoints.ts:115` still calls
 * `fetchChainInfo` on every platform to build a chain's endpoint list. Both run
 * on web, on the same documents. Neither can be deleted (FR-202), so what this
 * test buys is that neither can be edited alone.
 *
 * The rules are load-bearing in a way that is invisible when they diverge:
 *
 * - the **HTTPS filter** keeps `ws://`/`http://` out of the pool;
 * - the **`${…}` / `API_KEY` placeholder rejection** keeps a literal
 *   `https://…/${INFURA_KEY}` from being saved as a network's RPC (it would 401
 *   every request forever), while `extractRpcUrl` deliberately still falls back
 *   to a placeholder URL when nothing clean exists — `rpcUrls` never does;
 * - the **explorer pick** (first entry) decides whether transactions get a link;
 * - **`testnet`** and every `??` default decide what the wizard's card states.
 *
 * Rather than compare source text, this drives BOTH implementations over the
 * same fixture documents: the TypeScript one through `fetchChainInfo`, the Rust
 * one through the wizard's resolve step, and asserts the parsed chains are
 * field-for-field equal.
 */

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// The core's cache-flush side effects open sockets; the parse is what is under
// test here, so the seam is mocked exactly as `network-admin-core.test.ts` does.
jest.mock('@/services/rpc-pool', () => ({
  refreshPool: jest.fn(async () => {}),
  invalidateAllPools: jest.fn(),
  probeRpcChainId: jest.fn(async () => null),
}));
jest.mock('@/services/bundler-service', () => ({ clearBundlerCache: jest.fn() }));

// Load-bearing (see `network-admin-core.test.ts`): jest lists no `.web.ts` in
// `moduleFileExtensions`, so the web entry must be imported by explicit path
// first or the wasm is never initialised.
import '@/services/vela-core';
import { fetchChainInfo, type ChainInfo } from '@/services/chain-registry';
import { createNetworkAdminSession } from '@/services/wallet-state-core/network-admin-session';
import type { NetChainInfo } from '@/services/wallet-state-core/generated/NetChainInfo';
import type { NetView } from '@/services/wallet-state-core/generated/NetView';

/** Let the effect loop's storage / fetch round-trips settle. */
const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

let document: Record<string, unknown> = {};

beforeEach(() => {
  mockStorage.clear();
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    const text = String(url).includes('/chains/eip155-')
      ? JSON.stringify(document)
      : // Every RPC probe the compatibility check fires afterwards. The verdict
        // is not what this test reads; the chain info the wizard resolved is.
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' });
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
      text: async () => text,
    } as unknown as Response;
  });
});

/** The chain as the Rust core parsed it, driving the wizard's resolve step. */
async function throughCore(chainId: number): Promise<NetChainInfo> {
  let view: NetView | null = null;
  const faults: unknown[] = [];
  const session = createNetworkAdminSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start({ type: 'started' });
  await settle();
  session.dispatch({ type: 'chain_selected', chain_id: chainId, keep_custom_rpc: false });
  await settle();
  const info = (view as unknown as NetView).wizard.chain_info;
  session.dispose();
  expect(faults).toEqual([]);
  if (!info) throw new Error('the core resolved no chain info');
  return info;
}

/** The same chain as the TypeScript parser produced it. */
async function throughTypeScript(chainId: number): Promise<ChainInfo> {
  const info = await fetchChainInfo(chainId);
  if (!info) throw new Error('fetchChainInfo returned null');
  return info;
}

/** The Rust view, restated in the TypeScript shape, so the diff is readable. */
function asChainInfo(core: NetChainInfo): ChainInfo {
  return {
    chainId: core.chain_id,
    name: core.name,
    shortName: core.short_name,
    nativeCurrency: {
      name: core.native_name,
      symbol: core.native_symbol,
      decimals: core.native_decimals,
    },
    rpcUrl: core.rpc_url,
    rpcUrls: core.rpc_urls,
    explorerUrl: core.explorer_url,
    logoURL: core.logo_url,
    isTestnet: core.is_testnet,
  };
}

async function bothAgree(chainId: number): Promise<ChainInfo> {
  const [core, ts] = await Promise.all([throughCore(chainId), throughTypeScript(chainId)]);
  const parsed = asChainInfo(core);
  expect(parsed).toEqual(ts);
  return parsed;
}

describe('chain document parsing — Rust ⇄ TypeScript', () => {
  test('a full document parses identically', async () => {
    document = {
      chainId: 12345,
      name: 'Example Chain',
      shortName: 'exa',
      nativeCurrency: { name: 'Example', symbol: 'EXA', decimals: 8 },
      rpc: [
        'https://one.example/rpc',
        'https://two.example/rpc',
      ],
      explorers: [
        { name: 'first', url: 'https://scan-one.example' },
        { name: 'second', url: 'https://scan-two.example' },
      ],
      testnet: false,
    };
    const parsed = await bothAgree(12345);
    expect(parsed.rpcUrls).toEqual(['https://one.example/rpc', 'https://two.example/rpc']);
    expect(parsed.explorerUrl).toBe('https://scan-one.example');
    expect(parsed.isTestnet).toBe(false);
  });

  test('non-HTTPS endpoints and key placeholders are filtered identically', async () => {
    document = {
      chainId: 12346,
      name: 'Mixed Chain',
      shortName: 'mix',
      nativeCurrency: { name: 'Mixed', symbol: 'MIX', decimals: 18 },
      rpc: [
        'wss://ws.example/rpc',
        'http://insecure.example/rpc',
        'https://keyed.example/v3/${INFURA_KEY}',
        'https://keyed.example/v2/API_KEY',
        'https://clean.example/rpc',
        42,
      ],
      explorers: [{ url: 'https://scan.example' }],
      testnet: true,
    };
    const parsed = await bothAgree(12346);
    // The placeholders NEVER reach the candidate list…
    expect(parsed.rpcUrls).toEqual(['https://clean.example/rpc']);
    // …and the single "best" URL is the clean one, not merely the first HTTPS.
    expect(parsed.rpcUrl).toBe('https://clean.example/rpc');
    expect(parsed.isTestnet).toBe(true);
  });

  test('a document whose only HTTPS endpoints are placeholders agrees too', async () => {
    document = {
      chainId: 12347,
      name: 'Keyed Chain',
      shortName: 'key',
      nativeCurrency: { name: 'Keyed', symbol: 'KEY', decimals: 6 },
      rpc: ['wss://ws.example', 'https://keyed.example/${KEY}'],
      explorers: [],
      testnet: false,
    };
    const parsed = await bothAgree(12347);
    // `rpcUrls` stays empty (nothing clean), while `rpcUrl` deliberately falls
    // back to the placeholder — the divergence between the two extractors is
    // itself a rule, and it must be the same rule on both platforms.
    expect(parsed.rpcUrls).toEqual([]);
    expect(parsed.rpcUrl).toBe('https://keyed.example/${KEY}');
    expect(parsed.explorerUrl).toBe('');
  });

  test('every missing field takes the same default', async () => {
    document = { rpc: ['https://bare.example'] };
    const parsed = await bothAgree(12348);
    expect(parsed).toMatchObject({
      chainId: 12348,
      name: 'Chain 12348',
      shortName: '',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      isTestnet: false,
    });
  });

  test('a document with no `rpc` array at all agrees', async () => {
    document = {
      chainId: 12349,
      name: 'Empty Chain',
      shortName: 'emp',
      nativeCurrency: { name: 'Empty', symbol: 'EMP', decimals: 18 },
      explorers: [{ url: 'https://scan.example' }],
    };
    // The wizard refuses this one (`no_rpc_endpoint`) — but it refuses it AFTER
    // parsing, and the card it renders is this parse.
    const parsed = await bothAgree(12349);
    expect(parsed.rpcUrl).toBe('');
    expect(parsed.rpcUrls).toEqual([]);
  });
});
