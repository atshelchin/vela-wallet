// The `eth_getLogs` failure-wording classifier exists TWICE on web, and this
// pins the two together.
//
//   • Rust — `rpc_pool::get_logs_range_cap` (`app/rpc_pool.rs:661`), reached on
//     every web RPC call: a `range_cap` verdict means "request-specific, keep
//     the endpoint healthy", anything else routes into ban / failover / answer.
//   • TypeScript — `getLogsRangeCap` (`rpc-pool-endpoints.ts:213`), still called
//     by `token-trust-executor.ts:140` to turn the SAME error object into
//     the `token_trust` core's `RangeCapped{cap}` / `Failed` axis, because
//     `poolRpcCall` hands the caller the raw body and not the core's verdict.
//
// Neither copy can be deleted today: the core one routes the pool, the TS one
// feeds the scan machine, and native has no core at all. So the thing to remove
// is not the duplication but the DRIFT — and both halves decide the same user
// outcome from opposite directions:
//
//   * TS says "range cap", Rust says "endpoint fault"  → the pool bans/fails
//     over a perfectly healthy endpoint while the scanner keeps halving.
//   * TS says "endpoint fault", Rust says "range cap"  → the incoming-transfer
//     scan gives up on that block window, so a token the user actually received
//     is never auto-recognised; nothing on screen says why.
//   * The two agree it is a cap but on a different NUMBER → the scanner asks
//     for a span the pool has already been told is too wide, forever.
//
// The Rust side is driven FOR REAL through the web shell (the same path
// `rpc-pool-core.test.ts` uses) — not transcribed into a table that could be
// regenerated from the wrong side.
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
// Keep pool init off the network — the chain index would add ~20 endpoints and
// make the sweeps non-deterministic.
jest.mock('@/services/chain-registry', () => ({ fetchChainInfo: jest.fn(async () => null) }));

// The redirect that used to live here pointed the native module at the real
// web session. There is one module now, so mocking it to itself is what a
// stack overflow looks like — the import below already gets the real thing.

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// The wasm only initialises through the explicit web entry (same reason as
// every other core test).
import '@/services/vela-core';

import {
  collectRpcUrls,
  getLogsRangeCap,
  NEVER_BANNED,
  type RPCResponse,
} from '@/services/rpc-pool-endpoints';
import { createRpcPoolSession } from '@/services/wallet-state-core/rpc-pool-session';
import type { RpcCallVerdict } from '@/services/wallet-state-core/generated/RpcCallVerdict';
import type { RpcPoolView } from '@/services/wallet-state-core/generated/RpcPoolView';
import type { RpcPoolCallRegistry } from '@/services/wallet-state-core/rpc-pool-types';

const CHAIN = 8453;

type RpcError = NonNullable<RPCResponse['error']>;

function jsonResponse(body: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

/** A fresh core per scenario, with the minimum registry `rpc-pool.ts` provides. */
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
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
    registry,
  });

  function call(callId: string, method: string): Promise<RpcCallVerdict> {
    payloads.set(callId, { method, params: [] });
    return new Promise<RpcCallVerdict>((resolve) => {
      waiters.set(callId, resolve);
      session.dispatch({
        type: 'call_requested',
        call_id: callId,
        chain_id: CHAIN,
        kind: 'rpc',
        method,
        now_ms: Date.now(),
      });
    });
  }

  return { session, faults, call, latest: () => view };
}

/**
 * What the REAL core decided about this error, in the TS classifier's own
 * vocabulary: a block span, or `null` for "not a range error".
 *
 * Every endpoint answers the same error, so a non-range verdict is whatever the
 * pool's own routing makes of it (an answer, or a swept-out chain) — either way
 * it is *not* `range_cap`, which is exactly the axis under test.
 */
async function coreVerdict(error: RpcError): Promise<number | null> {
  mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, error }));
  const h = open();
  h.session.start({ type: 'bans_loaded', entries: [] });
  try {
    const verdict = await h.call('c1', 'eth_getLogs');
    expect(h.faults).toEqual([]);
    return verdict.type === 'range_cap' ? verdict.max_span : null;
  } finally {
    h.session.dispose();
  }
}

/**
 * Provider wordings, each one a real shape seen in the wild plus the quirks the
 * Rust port copied on purpose. The expectation column is deliberately absent:
 * neither side is the reference, they are compared to each other.
 */
const WORDINGS: { name: string; error: RpcError }[] = [
  // --- not a range error: the endpoint's problem, or a plain answer ---------
  { name: 'plain bad request', error: { code: -32602, message: 'invalid params' } },
  { name: 'execution error is an answer', error: { code: 3, message: 'execution reverted' } },
  { name: 'no message at all', error: { code: -32602 } as RpcError },
  { name: 'empty message', error: { code: -32602, message: '' } },

  // --- result-count caps: narrow the span, but the number is NOT a span -----
  { name: 'infura result cap', error: { code: -32005, message: 'query returned more than 10000 results' } },
  { name: 'result cap worded through the range', error: { code: -32000, message: 'too many results in block range' } },

  // --- stated block spans ---------------------------------------------------
  { name: 'stated span', error: { code: -32000, message: 'this node is limited to a 100 block range' } },
  { name: 'k suffix', error: { code: -32000, message: 'up to a 2k block range' } },
  { name: 'alchemy log-size wording', error: { code: -32602, message: 'Log response size exceeded. You can make eth_getLogs requests with up to a 2K block range and no limit' } },
  { name: 'maximum-is wording', error: { code: -32000, message: 'block range exceeded: maximum is 500' } },
  { name: 'thousands separator', error: { code: -32000, message: 'block range limit 1,000 exceeded' } },
  { name: 'underscore separator', error: { code: -32000, message: 'range too large: 10_000' } },
  { name: 'eth_getLogs limited-to wording', error: { code: -32000, message: 'eth_getLogs is limited to a 1000 block range' } },

  // --- one vector per needle, each phrased so NO other needle also matches.
  // Without these, dropping a single needle from one side still passes because
  // some other needle in the same message covers for it.
  { name: 'needle: block height', error: { code: -32000, message: 'exceed maximum block height 128' } },
  { name: 'needle: too many blocks', error: { code: -32000, message: 'requested too many blocks: 300' } },
  { name: 'needle: range is too', error: { code: -32000, message: 'the span is 700 but that range is too big' } },
  { name: 'needle: range too', error: { code: -32000, message: 'span of 700, range too big' } },
  { name: 'needle: range limit', error: { code: -32000, message: 'range limit 900 hit' } },
  { name: 'needle: limited to', error: { code: -32000, message: 'this endpoint is limited to 42 blocks per query' } },
  { name: 'needle: range + exceed', error: { code: -32000, message: 'span 88 would exceed the allowed range' } },
  { name: 'needle: range + large', error: { code: -32000, message: 'span 88 makes the range large' } },
  { name: 'needle: range + wide', error: { code: -32000, message: 'span 88 makes the range wide' } },
  { name: 'needle: range + maximum', error: { code: -32000, message: 'maximum span for a range is 88' } },
  { name: 'needle: result + more than', error: { code: -32000, message: 'more than 7 result rows' } },
  { name: 'needle: result + exceed', error: { code: -32000, message: 'result set would exceed the cap' } },
  { name: 'needle: result + limit', error: { code: -32000, message: 'result limit reached' } },
  { name: 'needle: result + too many', error: { code: -32000, message: 'too many result rows' } },
  { name: 'result caps outrank a stated span', error: { code: -32000, message: 'more than 7 results in a 5000 block range' } },

  // --- range errors with no usable number → both sides must say "halve" -----
  { name: 'no number', error: { code: -32000, message: 'block range is too wide' } },
  { name: 'leading zero span', error: { code: -32000, message: 'requested too many blocks from 0 to 100000, maximum is set to 2048' } },

  // --- the ported quirk: greedy first number + a stray k/m as a suffix ------
  { name: 'greedy first number, stray m', error: { code: -32000, message: 'block range: got 5000, max 100' } },
];

let randomSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockStorage.clear();
  // The core draws its backoff jitter through the shell; pinning it to 0 makes
  // every inter-pass delay 0ms, so a swept-out chain resolves instantly.
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('eth_getLogs range-cap wording: the Rust pool vs the TypeScript classifier', () => {
  test.each(WORDINGS)('$name', async ({ error }) => {
    expect(await coreVerdict(error)).toEqual(getLogsRangeCap(error));
  });

  test('the axis itself agrees on every wording — cap vs endpoint fault', async () => {
    for (const { name, error } of WORDINGS) {
      const core = await coreVerdict(error);
      const ts = getLogsRangeCap(error);
      // Stated as booleans as well as numbers: this is the branch
      // `token-trust-executor.ts:146` takes (`RangeCapped` vs `Failed`),
      // and it is the one that decides whether a received token is scanned for
      // at all.
      expect([name, core !== null]).toEqual([name, ts !== null]);
    }
  });

  test('a non-getLogs call is never classified as a range cap, on either side', async () => {
    // The core gates the range branch on `method == "eth_getLogs"`; the TS
    // classifier is only ever reached from the getLogs arm. A drift here would
    // let a range-worded error on some other method suppress a real fault.
    mockFetch.mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'this node is limited to a 100 block range' },
      }),
    );
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });
    const verdict = await h.call('c1', 'eth_blockNumber');
    expect(verdict.type).not.toBe('range_cap');
    h.session.dispose();
  });
});

describe('the seam that keeps both copies reachable', () => {
  test('a range cap resolves the caller with the raw body, so the TS half still has to classify', async () => {
    // This is WHY the duplication exists rather than being deleted: the pool's
    // verdict carries `max_span`, but `poolRpcCall` resolves with the endpoint
    // body, so `token-trust-executor.ts` only ever sees `error` again.
    const seeds = await collectRpcUrls(CHAIN, NEVER_BANNED);
    const error: RpcError = { code: -32000, message: 'eth_getLogs is limited to a 1000 block range' };
    mockFetch.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, error }));
    const h = open();
    h.session.start({ type: 'bans_loaded', entries: [] });
    const verdict = await h.call('c1', 'eth_getLogs');
    expect(verdict).toEqual({ type: 'range_cap', url: seeds[0].url, max_span: 1000 });
    expect(getLogsRangeCap(error)).toBe(1000);
    h.session.dispose();
  });
});
