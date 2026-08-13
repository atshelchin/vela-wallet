// The `X-Rpc-Url` a UserOp is submitted with, after the pool has changed its
// mind about the endpoint that won the race.
//
// `pickFastestRpcUrl` caches the race winner for `FASTEST_RPC_TTL_MS` — one
// hour. The short-circuit that hands the cached winner straight to the bundler
// re-checked the wrong-chain memory and nothing else, so for that whole hour it
// kept naming an endpoint the pool had BANNED (a 401, an auth wall, a rate
// limit) — while `getChainRpcUrl`, asked about the same chain in the same
// second, correctly refused to name it. One pool, two opinions, and the one
// that reached the bundler was the wrong one: the bundler reads the Safe's
// code, nonce and balance through this URL to decide a treasury transfer, and a
// banned endpoint is precisely one that has proved it cannot answer.
//
// The core now phrases every exit — empty set, single candidate, cached
// fastest, race seed — against ONE predicate (`bundler_eligible_urls`), which
// both legs read. This file asserts the observable half of that: the header on
// the wire, and `getChainRpcUrl`, agreeing.
//
// Mutation proof: put the old wrong-chain-only `condemned` check back in
// `begin_bundler_call` and rebuild the wasm — `the banned winner is not in the
// header` goes red with the banned URL. (Editing the Rust alone proves nothing
// here: jest loads the prebuilt `public/vela_core_bg.*.wasm`.)
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

// The redirect that used to live here pointed the native module at the real
// web session. There is one module now, so mocking it to itself is what a
// stack overflow looks like — the import below already gets the real thing.

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import '@/services/vela-core';

import { getChainRpcUrl, poolBundlerCall, poolRpcCall } from '@/services/rpc-pool';
import { collectRpcUrls, NEVER_BANNED } from '@/services/rpc-pool-endpoints';

// The chain from the reproduction. `rpc-pool.ts` holds ONE module-level
// session, so bans and race winners carry across tests in this file — a chain
// per test is the isolation.
const CHAIN = 10;

function jsonResponse(body: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

const RESULT = { jsonrpc: '2.0', id: 1, result: '0x1' };
const CHAIN_HEX = `0x${CHAIN.toString(16)}`;

/** Every `X-Rpc-Url` header this run has put on the wire, in order. */
function sentXRpcUrls(): (string | null)[] {
  return mockFetch.mock.calls.map(([, init]: [string, any]) => {
    const headers = init?.headers ?? {};
    return headers['X-Rpc-Url'] ?? headers['x-rpc-url'] ?? null;
  });
}

let randomSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  mockFetch.mockReset();
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('a cached race winner is re-asked whether it may still be used', () => {
  test('the banned winner is not in the header, and both legs say the same thing', async () => {
    const urls = (await collectRpcUrls(CHAIN, NEVER_BANNED)).map((e) => e.url);
    expect(urls.length).toBeGreaterThan(1);

    // 1. A race, won by the top-scored endpoint — the winner is cached for an
    //    hour, and everything else in this test happens well inside it.
    //
    //    Only that endpoint answers `eth_chainId`; the others fail the probe,
    //    which the core skips silently (no wrong-chain memory, so they stay
    //    eligible for step 4). That is deliberate: with every candidate
    //    answering instantly the latencies all tie and the winner falls out of
    //    microtask ordering, which made this test pass or fail by luck — and
    //    when it lost, step 2's read never reached the winner to ban it, so
    //    the assertion at the bottom was measuring nothing.
    const raceWinner = urls[0];
    mockFetch.mockImplementation(async (url: string, init?: any) => {
      const method = JSON.parse(init.body).method;
      if (method !== 'eth_chainId') return jsonResponse(RESULT);
      return url === raceWinner
        ? jsonResponse({ jsonrpc: '2.0', id: 1, result: CHAIN_HEX })
        : jsonResponse({}, 500);
    });
    await poolBundlerCall('eth_sendUserOperation', [], CHAIN);
    const winner = sentXRpcUrls().filter((u): u is string => u != null).pop();
    expect(winner).toBe(raceWinner);

    // Guard against a vacuous test: the cache is live and short-circuits — the
    // next bundler call sends the same header without racing again.
    mockFetch.mockClear();
    await poolBundlerCall('eth_sendUserOperation', [], CHAIN);
    expect(mockFetch.mock.calls.map(([, init]) => JSON.parse(init.body).method))
      .not.toContain('eth_chainId');
    expect(sentXRpcUrls()).toContain(winner);

    // 2. An ordinary read then gets HTTP 401 from that endpoint: a permanent
    //    auth error, so the core bans it and fails over. Nothing here touches
    //    the race cache — the ban is learned on the other leg entirely, which
    //    is how the two opinions drifted apart in the first place.
    mockFetch.mockImplementation(async (url: string) =>
      url === winner ? jsonResponse({ error: 'unauthorized' }, 401) : jsonResponse(RESULT),
    );
    await poolRpcCall('eth_blockNumber', [], CHAIN);

    // 3. The REST leg already refuses it (this half was always right).
    mockFetch.mockImplementation(async (_url: string, init?: any) => {
      const method = JSON.parse(init.body).method;
      return method === 'eth_chainId'
        ? jsonResponse({ jsonrpc: '2.0', id: 1, result: CHAIN_HEX })
        : jsonResponse(RESULT);
    });
    const best = await getChainRpcUrl(CHAIN);
    expect(best).not.toBe(winner);
    expect(urls).toContain(best);

    // 4. And now the JSON-RPC leg. This assertion read `winner` before the
    //    short-circuit consulted the ban map: a UserOp submitted with a header
    //    naming an endpoint the pool had already condemned.
    mockFetch.mockClear();
    await poolBundlerCall('eth_sendUserOperation', [], CHAIN);
    const headers = sentXRpcUrls().filter((u): u is string => u != null);
    expect(headers.length).toBeGreaterThan(0);
    expect(headers).not.toContain(winner);
    // One pool, one answer: whatever it names is what `getChainRpcUrl` would.
    for (const header of headers) expect(urls).toContain(header);
  });
});
