// `getChainRpcUrl` on WEB — the second consumer of the `X-Rpc-Url` header.
//
// Its answer goes into `/v1/account` and `/v1/sponsor` (a real treasury
// transfer: the bundler reads the Safe's code, nonce and balance through this
// URL and decides whether to pay), and it seeds the Tevm fork. The web module
// used to derive it locally — first non-banned entry of the collected list —
// which is source-priority order and nothing else: no EMA latency, no failure
// cooldown, and no memory of an endpoint that answered `eth_chainId` with
// another chain's id. Native's twin has always used the full pool ranking.
//
// So this file asserts the property, not the plumbing: the URL handed out is the
// one the POOL would use, changing as the pool's own opinion changes.
/* eslint-disable import/first */
jest.mock('react-native', () => ({}));

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
  },
}));
// Keep pool init off the network — the chain index would add ~20 endpoints and
// make the candidate list non-deterministic.
jest.mock('@/services/chain-registry', () => ({ fetchChainInfo: jest.fn(async () => null) }));

// Stand in for metro's platform resolution, which jest does not do: `.web.ts` is
// not in `moduleFileExtensions`, so `rpc-pool.web.ts`'s bare session import would
// otherwise resolve to the native stub that throws. Redirects to the REAL web
// session — no double.
jest.mock('@/services/wallet-state-core/rpc-pool-session', () =>
  require('@/services/wallet-state-core/rpc-pool-session.web'),
);

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import '@/services/vela-core/index.web';

import { getChainRpcUrl, poolBundlerCall, poolRpcCall, refreshPool } from '@/services/rpc-pool.web';
import { collectRpcUrls, NEVER_BANNED } from '@/services/rpc-pool-endpoints';

// `rpc-pool.web.ts` holds ONE module-level session (it is the app's pool, not a
// screen's), so bans and wrong-chain memory carry across tests in this file. A
// chain per test is the isolation — sharing one would let a ban from an earlier
// test pass a later assertion for the wrong reason.
const BANNED_CHAIN = 8453;
const WRONG_CHAIN = 137;
const COLD_CHAIN = 42161;

function jsonResponse(body: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

const RESULT = { jsonrpc: '2.0', id: 1, result: '0x1' };

/** The candidate list in cold-start (collection) order. */
async function candidates(chainId: number): Promise<string[]> {
  return (await collectRpcUrls(chainId, NEVER_BANNED)).map((e) => e.url);
}

let randomSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  mockFetch.mockReset();
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('getChainRpcUrl is the pool’s ranking, not the collected order', () => {
  test('cold start names the top-priority endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse(RESULT));
    const [first] = await candidates(COLD_CHAIN);
    expect(await getChainRpcUrl(COLD_CHAIN)).toBe(first);
  });

  test('an endpoint the pool has banned is never handed out, even though it is still collected first', async () => {
    const urls = await candidates(BANNED_CHAIN);
    expect(urls.length).toBeGreaterThan(1);
    // Nothing is banned yet: the top endpoint is the answer.
    mockFetch.mockResolvedValue(jsonResponse(RESULT));
    expect(await getChainRpcUrl(BANNED_CHAIN)).toBe(urls[0]);

    // 401 is a permanent-auth error: the core bans the endpoint and fails over.
    mockFetch.mockImplementation(async (url: string) =>
      url === urls[0] ? jsonResponse({ error: 'nope' }, 401) : jsonResponse(RESULT),
    );
    await poolRpcCall('eth_blockNumber', [], BANNED_CHAIN);

    const picked = await getChainRpcUrl(BANNED_CHAIN);
    expect(picked).not.toBe(urls[0]);
    expect(urls).toContain(picked);
    // Collection order is unchanged — only the pool's opinion moved, which is
    // exactly what a shell-side derivation could not see.
    expect((await candidates(BANNED_CHAIN))[0]).toBe(urls[0]);
  });

  test('an endpoint that PROVED it serves another chain is excluded long after the race that learned it', async () => {
    const urls = await candidates(WRONG_CHAIN);
    expect(urls.length).toBeGreaterThan(1);
    // Before the race there is nothing against the top endpoint, so it wins —
    // which is what makes the exclusion below attributable to the wrong chain id
    // and to nothing else.
    mockFetch.mockResolvedValue(jsonResponse(RESULT));
    expect(await getChainRpcUrl(WRONG_CHAIN)).toBe(urls[0]);

    // The fastest-RPC race a bundler call runs: the top endpoint answers
    // `eth_chainId` with 1 (Ethereum), the rest with 137.
    const hex = `0x${WRONG_CHAIN.toString(16)}`;
    mockFetch.mockImplementation(async (url: string, init?: any) => {
      const method = JSON.parse(init.body).method;
      if (method === 'eth_chainId') {
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: url === urls[0] ? '0x1' : hex });
      }
      return jsonResponse(RESULT);
    });
    await poolBundlerCall('eth_sendUserOperation', [], WRONG_CHAIN);

    // The race is over and its state is gone; the exclusion is not. Nothing was
    // banned here — the endpoint is simply not this chain's.
    mockFetch.mockResolvedValue(jsonResponse(RESULT));
    const picked = await getChainRpcUrl(WRONG_CHAIN);
    expect(picked).not.toBe(urls[0]);
    expect(urls).toContain(picked);

    // A config change can put a different node behind the same URL, so the
    // memory is dropped with the rest of the chain's cached opinions.
    await refreshPool(WRONG_CHAIN);
    expect(await getChainRpcUrl(WRONG_CHAIN)).toBe(urls[0]);
  });
});
