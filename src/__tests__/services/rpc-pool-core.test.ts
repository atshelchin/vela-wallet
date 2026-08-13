// The `rpc_pool` core (Rust/wasm) driven through the WEB shell.
//
// The routing rules themselves are covered by the Rust suite. What only exists
// on this side is the wiring, and every part of it is load-bearing enough to be
// asserted against the REAL core rather than a double:
//
//   • the ban-map storage codec — the core speaks `banned_at_ms`, the store
//     holds `bannedAt` (written by `services/rpc-pool.ts`, still written by
//     native). Getting it wrong would silently drop every persisted ban, and a
//     banned endpoint would be tried again on every boot;
//   • the mechanical outcome classification — an HTTP status, a JSON `error`
//     member, a timeout. Mis-map one and the core bans a healthy endpoint (or
//     keeps a dead one);
//   • the executor's `X-Rpc-Url` header and per-call timeout;
//   • `rpc-pool.web.ts`'s promise bookkeeping: the caller must get the body of
//     the endpoint the core actually chose, and the exact rejection message
//     callers already match on.
//
// Every network call in the web app flows through this path, so the failure
// mode of a mistake here is "nothing loads".
//
// Mocks before imports, as in `browser-history-core.test.ts`: the module graph
// below reaches storage and the network on first evaluation.
/* eslint-disable import/first */
jest.mock('react-native', () => ({}));

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
  },
}));
// Keep pool init off the network: the chain index would otherwise add ~20 more
// endpoints and make the sweeps non-deterministic.
jest.mock('@/services/chain-registry', () => ({ fetchChainInfo: jest.fn(async () => null) }));

// Stand in for metro's platform resolution, which jest does not do (no `.web.ts`
// in `moduleFileExtensions`): `rpc-pool.web.ts` imports the session bare, and on
// web that is the wasm-backed module, not the native stub that throws. This
// redirects to the REAL web session — no double, no stub.
jest.mock('@/services/wallet-state-core/rpc-pool-session', () =>
  require('@/services/wallet-state-core/rpc-pool-session'),
);

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier to
// `index.web.ts`, which is why the session module imports it bare). Importing
// the web entry by explicit path first runs `initSync` on the planted bytes.
import '@/services/vela-core';

import { collectRpcUrls, NEVER_BANNED, type RPCResponse } from '@/services/rpc-pool-endpoints';
import { createRpcPoolSession } from '@/services/wallet-state-core/rpc-pool-session';
import { readStoredBans } from '@/services/wallet-state-core/rpc-pool-executor';
import type { RpcCallVerdict } from '@/services/wallet-state-core/generated/RpcCallVerdict';
import type { RpcKind } from '@/services/wallet-state-core/generated/RpcKind';
import type { RpcPoolView } from '@/services/wallet-state-core/generated/RpcPoolView';
import type { RpcPoolCallRegistry } from '@/services/wallet-state-core/rpc-pool-types';

const BAN_KEY = 'vela.rpc.banned';

type FetchCall = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function jsonResponse(body: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

/** Every fetch the executor made, in order. */
function recordedCalls(): FetchCall[] {
  return mockFetch.mock.calls.map(([url, init]) => ({
    url: url as string,
    body: JSON.parse((init as { body: string }).body) as Record<string, unknown>,
    headers: (init as { headers: Record<string, string> }).headers,
  }));
}

/**
 * A session plus the minimum registry `rpc-pool.web.ts` provides, so the core
 * runs against the real executor. Each test gets a fresh core (and therefore a
 * fresh ban map and pool), which module-level `rpc-pool.web.ts` cannot give.
 */
function open() {
  const faults: unknown[] = [];
  let view: RpcPoolView = { failed_chains: [], rate_limited_chains: [], banned: [] };
  const payloads = new Map<string, { method: string; params: unknown[] }>();
  const bodies = new Map<string, Map<string, RPCResponse>>();
  const waiters = new Map<string, (verdict: RpcCallVerdict) => void>();

  const registry: RpcPoolCallRegistry = {
    payload: (callId) => payloads.get(callId),
    keepBody: (callId, url, body) => {
      const perUrl = bodies.get(callId) ?? new Map<string, RPCResponse>();
      perUrl.set(url, body);
      bodies.set(callId, perUrl);
    },
    settle: (callId, verdict) => waiters.get(callId)?.(verdict),
  };

  const session = createRpcPoolSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => {
      faults.push(error);
    },
    registry,
  });

  function call(
    callId: string,
    chainId: number,
    method: string,
    kind: RpcKind = 'rpc',
  ): Promise<RpcCallVerdict> {
    payloads.set(callId, { method, params: [] });
    return new Promise<RpcCallVerdict>((resolve) => {
      waiters.set(callId, resolve);
      session.dispatch({
        type: 'call_requested',
        call_id: callId,
        chain_id: chainId,
        kind,
        method,
        now_ms: Date.now(),
      });
    });
  }

  function bundlerBase(callId: string, chainId: number): Promise<RpcCallVerdict> {
    return new Promise<RpcCallVerdict>((resolve) => {
      waiters.set(callId, resolve);
      session.dispatch({
        type: 'bundler_base_requested',
        call_id: callId,
        chain_id: chainId,
        now_ms: Date.now(),
      });
    });
  }

  const body = (callId: string, url: string) => bodies.get(callId)?.get(url);

  return { session, faults, call, bundlerBase, body, latest: () => view };
}

/** Let the effect loop's storage/timer round-trips settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let randomSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockStorage.clear();
  // The core draws its backoff jitter through the shell; pinning the draw to 0
  // makes every inter-pass delay 0ms, so the multi-pass sweeps run instantly.
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('rpc_pool core (web shell)', () => {
  test('routes to the best endpoint and hands the caller that endpoint’s body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x1' }));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('c1', 8453, 'eth_blockNumber');

    expect(verdict.type).toBe('respond');
    const url = (verdict as { url: string }).url;
    const seeds = await collectRpcUrls(8453, NEVER_BANNED);
    // Cold start: score order is source-priority order, i.e. collection order.
    expect(url).toBe(seeds[0].url);
    expect(h.body('c1', url)).toEqual({ jsonrpc: '2.0', id: 1, result: '0x1' });
    expect(recordedCalls()).toHaveLength(1);
    expect(recordedCalls()[0].body.method).toBe('eth_blockNumber');
    // An RPC call carries no X-Rpc-Url; that header belongs to bundler calls.
    expect(recordedCalls()[0].headers['X-Rpc-Url']).toBeUndefined();
    expect(h.latest().failed_chains).toEqual([]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an execution revert is an ANSWER, not a fault — delivered from the first endpoint', async () => {
    const reverted = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: 3, message: 'execution reverted: ERC20: insufficient allowance' },
    };
    mockFetch.mockResolvedValue(jsonResponse(reverted));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('c1', 8453, 'eth_call');

    expect(verdict.type).toBe('respond');
    expect(h.body('c1', (verdict as { url: string }).url)).toEqual(reverted);
    expect(recordedCalls()).toHaveLength(1); // no failover, no ban
    expect(mockStorage.has(BAN_KEY)).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('HTTP 401 bans the endpoint, fails over, and persists the ban in the stored (camelCase) shape', async () => {
    const seeds = await collectRpcUrls(8453, NEVER_BANNED);
    mockFetch.mockImplementation(async (url: string) =>
      url === seeds[0].url
        ? jsonResponse({ error: 'nope' }, 401)
        : jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x2' }),
    );
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('c1', 8453, 'eth_blockNumber');

    expect(verdict).toEqual({ type: 'respond', url: seeds[1].url });
    await settle();
    const persisted = JSON.parse(mockStorage.get(BAN_KEY)!) as unknown[];
    expect(persisted).toEqual([
      { url: seeds[0].url, bannedAt: expect.any(Number), permanent: false },
    ]);
    // …and that store reads back into the core's wire shape.
    expect(await readStoredBans()).toEqual([
      { url: seeds[0].url, banned_at_ms: expect.any(Number), permanent: false },
    ]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a ban written by the TypeScript pool keeps that endpoint out of the sweep', async () => {
    const seeds = await collectRpcUrls(8453, NEVER_BANNED);
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x3' }));
    const h = open();
    // Exactly what `saveBans()` persists today.
    h.session.start({
      type: 'bans_loaded',
      entries: (
        JSON.parse(
          JSON.stringify([{ url: seeds[0].url, bannedAt: Date.now(), permanent: false }]),
        ) as { url: string; bannedAt: number; permanent: boolean }[]
      ).map((e) => ({ url: e.url, banned_at_ms: e.bannedAt, permanent: e.permanent })),
    });

    const verdict = await h.call('c1', 8453, 'eth_blockNumber');

    expect(verdict).toEqual({ type: 'respond', url: seeds[1].url });
    expect(recordedCalls().map((c) => c.url)).toEqual([seeds[1].url]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a getLogs range cap is a request-specific answer: no failover, no ban, chain healthy', async () => {
    const seeds = await collectRpcUrls(8453, NEVER_BANNED);
    mockFetch.mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'eth_getLogs is limited to a 1000 block range' },
      }),
    );
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('c1', 8453, 'eth_getLogs');

    expect(verdict).toEqual({ type: 'range_cap', url: seeds[0].url, max_span: 1000 });
    expect(recordedCalls()).toHaveLength(1); // the next endpoint has the same cap
    expect(mockStorage.has(BAN_KEY)).toBe(false);
    expect(h.latest().failed_chains).toEqual([]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('429 everywhere: every endpoint swept every pass, chain failed AND flagged rate-limited', async () => {
    const seeds = await collectRpcUrls(8453, NEVER_BANNED);
    mockFetch.mockResolvedValue(jsonResponse({}, 429));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('c1', 8453, 'eth_blockNumber');

    expect(verdict).toEqual({ type: 'failed', rate_limited: true });
    // MAX_RPC_ATTEMPTS (3) full-pool passes.
    expect(recordedCalls()).toHaveLength(seeds.length * 3);
    expect(h.latest().failed_chains).toEqual([8453]);
    expect(h.latest().rate_limited_chains).toEqual([8453]);
    // 429 is a cooldown, never a hard ban.
    expect(mockStorage.has(BAN_KEY)).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('network failure everywhere is a HARD failure — not classified rate-limited', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('c1', 8453, 'eth_blockNumber');

    expect(verdict).toEqual({ type: 'failed', rate_limited: false });
    expect(h.latest().failed_chains).toEqual([8453]);
    expect(h.latest().rate_limited_chains).toEqual([]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a chain recovers: a later success clears both failure sets', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });
    await h.call('c1', 8453, 'eth_blockNumber');
    expect(h.latest().failed_chains).toEqual([8453]);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x4' }));
    await h.call('c2', 8453, 'eth_blockNumber');

    expect(h.latest().failed_chains).toEqual([]);
    expect(h.latest().rate_limited_chains).toEqual([]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a bundler call sends X-Rpc-Url — and only from an endpoint that reported this chain', async () => {
    const seeds = await collectRpcUrls(8453, NEVER_BANNED);
    const wrongChain = seeds[0].url;
    mockFetch.mockImplementation(async (url: string, init: { body: string }) => {
      const payload = JSON.parse(init.body) as { method: string };
      if (payload.method === 'eth_chainId') {
        // The highest-priority endpoint answers fastest but for the WRONG chain.
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: url === wrongChain ? '0x1' : '0x2105' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { hash: '0xdead' } });
    });
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.call('b1', 8453, 'eth_sendUserOperation', 'bundler');

    expect(verdict.type).toBe('respond');
    const submit = recordedCalls().filter((c) => c.body.method === 'eth_sendUserOperation');
    expect(submit).toHaveLength(1);
    // 0x2105 === 8453: the wrong-chain endpoint is excluded from the header
    // (invariant ②), so the winner is one of the endpoints that verified.
    expect(submit[0].headers['X-Rpc-Url']).toBeDefined();
    expect(submit[0].headers['X-Rpc-Url']).not.toBe(wrongChain);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('the bundler REST base is the endpoint the pool would submit to, chain suffix stripped', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x1' }));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });

    const verdict = await h.bundlerBase('base1', 8453);

    expect(verdict.type).toBe('bundler_base');
    const base = (verdict as { base_url: string | null }).base_url;
    expect(base).toBeTruthy();
    expect(base!.endsWith('/8453')).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});

describe('rpc-pool.web public surface', () => {
  // One module instance for the whole file (the session is a module-level
  // singleton by design), so these use distinct chains and never ban anything.
   
  const pool = require('@/services/rpc-pool') as typeof import('@/services/rpc-pool');

  test('a successful call resolves with the JSON body the chosen endpoint returned', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: '0xabc' }));
    await expect(pool.poolRpcCall('eth_blockNumber', [], 42161)).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: '0xabc',
    });
    expect(pool.getFailedRpcChains().has(42161)).toBe(false);
  });

  test('a chain whose every endpoint 429s rejects with the message callers match on', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 429));
    await expect(pool.poolRpcCall('eth_blockNumber', [], 100)).rejects.toThrow(
      'All RPC endpoints failed for chain 100',
    );
    expect(pool.getFailedRpcChains().has(100)).toBe(true);
    expect(pool.getRateLimitedChains().has(100)).toBe(true);
  });

  test('the params the caller passed are the params that go on the wire', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' }));
    await pool.poolRpcCall('eth_getBalance', ['0xabc', 'latest'], 10);
    const first = recordedCalls()[0];
    expect(first.body).toMatchObject({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: ['0xabc', 'latest'],
    });
  });
});
