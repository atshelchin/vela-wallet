// The `token_trust` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite. What only exists on
// this side is the executor: the JSON-RPC request shapes it builds from the
// core's operations, the `getLogs` wording→outcome mapping, and the two
// answer-everything contracts (one metadata entry per requested address, one
// timestamp per requested block) that a scan chain's liveness depends on.
// Getting any of those wrong silently kills money-in discovery or — worse for
// this machine — lets a token be listed from the wrong source, so they are
// asserted against the real core rather than a hand-written double.
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// The transport is faked; the WORDING layer is not — `getLogsRangeCap` is the
// real parser, because the executor's only classification is its output.
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: jest.fn(),
  getLogsRangeCap: jest.requireActual('@/services/rpc-pool-endpoints').getLogsRangeCap,
}));
jest.mock('@/services/token-metadata', () => ({ resolveTokenMetadata: jest.fn() }));
jest.mock('@/services/wallet-api', () => ({ clearTokenCache: jest.fn() }));

// Load-bearing (see browser-history-core.test.ts): jest lists no `.web.ts` in
// `moduleFileExtensions`, so the web entry must be imported by explicit path
// for `initSync` to run on the planted wasm bytes before the core is built.
import '@/services/vela-core/index.web';
import { poolRpcCall } from '@/services/rpc-pool';
import { resolveTokenMetadata } from '@/services/token-metadata';
import { clearTokenCache } from '@/services/wallet-api';
import { createTokenTrustSession } from '@/services/wallet-state-core/token-trust-session.web';
import type { TrustView } from '@/services/wallet-state-core/generated/TrustView';
import type { CustomToken } from '@/models/types';

const mockPool = poolRpcCall as jest.Mock;
const mockMeta = resolveTokenMetadata as jest.Mock;
const mockClearCache = clearTokenCache as jest.Mock;

const CHAIN = 56;
const ME = '0x' + '11'.repeat(20);
const OTHER = '0x' + '22'.repeat(20);
const SENDER = '0x' + '33'.repeat(20);
const STABLE = '0x' + 'aa'.repeat(20);
const CUSTOM = '0x' + 'bb'.repeat(20);
const MYSTERY = '0x' + 'cc'.repeat(20);
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SENTINELS = [
  '0xfffffffffffffffffffffffffffffffffffffffe',
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
];

const topicOf = (addr: string) => '0x' + '0'.repeat(24) + addr.slice(2).toLowerCase();
/** A 32-byte word holding `n` — the `data` of a Transfer log. */
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0');

/** Drain the microtask/macrotask queue enough for the whole scan pipeline. */
async function flush(turns = 40) {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

function open() {
  const faults: unknown[] = [];
  let view: TrustView = { address: null, scanning: false, incoming: [], sim: null };
  const session = createTokenTrustSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  // The registry snapshot is a shell-pushed fact and a fine first event.
  session.start({
    type: 'registry_tokens_snapshot',
    chain_id: CHAIN,
    stables: [STABLE],
    wrapped_native: null,
  });
  return { session, faults, latest: () => view };
}

/** Every `eth_getLogs` filter the executor sent, in order. */
const logFilters = () =>
  mockPool.mock.calls.filter((c) => c[0] === 'eth_getLogs').map((c) => c[1][0]);

beforeEach(() => {
  mockStorage.clear();
  mockPool.mockReset();
  mockMeta.mockReset().mockResolvedValue(new Map());
  mockClearCache.mockReset();
});

describe('token_trust core (web shell) — receive scan', () => {
  test('restricts getLogs to the allowlist and keeps only logs actually addressed to us', async () => {
    // A user-added token on this chain — part of the allowlist, per the core.
    const listed: CustomToken[] = [{
      id: `${CHAIN}_${CUSTOM}`, chainId: CHAIN, contractAddress: CUSTOM,
      symbol: 'CUS', name: 'Custom', decimals: 8, networkName: 'BNB Chain',
    }];
    mockStorage.set('vela.customTokens', JSON.stringify(listed));
    mockMeta.mockResolvedValue(new Map([[STABLE.toLowerCase(), { symbol: 'USDT', decimals: 6 }]]));
    mockPool.mockImplementation(async (method: string) => {
      if (method === 'eth_blockNumber') return { result: '0x3e8' }; // 1000
      if (method === 'eth_getLogs') {
        return { result: [
          // Ours.
          { address: STABLE, topics: [TRANSFER_TOPIC, topicOf(SENDER), topicOf(ME)],
            data: word(2_500_000n), transactionHash: '0xfeed', blockNumber: '0x3e7', logIndex: '0x1' },
          // Someone else's — the endpoint offered it anyway. Invariant ①.
          { address: STABLE, topics: [TRANSFER_TOPIC, topicOf(SENDER), topicOf(OTHER)],
            data: word(9n), transactionHash: '0xbeef', blockNumber: '0x3e7', logIndex: '0x2' },
        ] };
      }
      if (method === 'eth_getBlockByNumber') return { result: { timestamp: '0x64' } }; // 100
      return { result: null };
    });

    const h = open();
    h.session.dispatch({ type: 'held_chains_snapshot', address: ME, chain_ids: [CHAIN] });
    h.session.dispatch({ type: 'poll_requested', address: ME });
    await flush();

    const filter = logFilters()[0];
    expect(filter.fromBlock).toBe('0x384'); // 1000 - 100
    expect(filter.toBlock).toBe('0x3e8');
    expect(filter.topics).toEqual([TRANSFER_TOPIC, null, topicOf(ME)]);
    // Sentinels + the chain's stable + the user's own token, and nothing else:
    // a token merely HELD is deliberately not watched (invariant ②).
    expect(filter.address).toEqual([...SENTINELS, STABLE.toLowerCase(), CUSTOM.toLowerCase()]);

    expect(h.latest().incoming).toHaveLength(1);
    expect(h.latest().incoming[0]).toMatchObject({
      id: `${CHAIN}-0xfeed-1`,
      token: STABLE.toLowerCase(),
      is_native: false,
      value: '2500000',
      symbol: 'USDT',
      decimals: 6,
      timestamp_sec: 100,
    });
    expect(h.latest().scanning).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a range-capped endpoint gets exactly one retry, never a chunked fan-out', async () => {
    let logCalls = 0;
    mockPool.mockImplementation(async (method: string) => {
      if (method === 'eth_blockNumber') return { result: '0x3e8' };
      if (method === 'eth_getLogs') {
        logCalls++;
        // Monad's wording; the real `getLogsRangeCap` reads 100 out of it.
        if (logCalls === 1) return { error: { code: -32600, message: 'eth_getLogs is limited to a 100 block range' } };
        return { result: [] };
      }
      return { result: null };
    });

    const h = open();
    h.session.dispatch({ type: 'held_chains_snapshot', address: ME, chain_ids: [CHAIN] });
    h.session.dispatch({ type: 'poll_requested', address: ME });
    await flush();

    expect(logCalls).toBe(2); // invariant ④
    expect(logFilters()[1].fromBlock).toBe('0x385'); // 1000 - (100 - 1)
    expect(logFilters()[1].toBlock).toBe('0x3e8');
    expect(h.latest().scanning).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an ERC-20 whose metadata never resolves is withheld — and does not wedge the scan', async () => {
    // `resolveTokenMetadata` simply OMITS what it could not resolve; the
    // executor must still answer that address (as `meta: null`) or the core's
    // metadata gate is never satisfied and `scanning` stays true forever.
    mockMeta.mockResolvedValue(new Map());
    mockPool.mockImplementation(async (method: string) => {
      if (method === 'eth_blockNumber') return { result: '0x3e8' };
      if (method === 'eth_getLogs') {
        return { result: [
          { address: MYSTERY, topics: [TRANSFER_TOPIC, topicOf(SENDER), topicOf(ME)],
            data: word(1n), transactionHash: '0xdead', blockNumber: '0x3e7', logIndex: '0x0' },
        ] };
      }
      if (method === 'eth_getBlockByNumber') return { result: { timestamp: '0x64' } };
      return { result: null };
    });

    const h = open();
    h.session.dispatch({ type: 'held_chains_snapshot', address: ME, chain_ids: [CHAIN] });
    h.session.dispatch({ type: 'poll_requested', address: ME });
    await flush();

    // Invariant ③: no metadata, no feed row (an 18-decimals guess would show a
    // 6-decimals stablecoin as "+0 tokens").
    expect(h.latest().incoming).toEqual([]);
    expect(h.latest().scanning).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('an unreachable chain yields nothing this tick instead of failing the poll', async () => {
    mockPool.mockRejectedValue(new Error('every endpoint failed'));

    const h = open();
    h.session.dispatch({ type: 'held_chains_snapshot', address: ME, chain_ids: [CHAIN] });
    h.session.dispatch({ type: 'poll_requested', address: ME });
    await flush();

    expect(h.latest().incoming).toEqual([]);
    expect(h.latest().scanning).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});

describe('token_trust core (web shell) — the auto-add source rule', () => {
  const receipt = [{
    address: MYSTERY,
    topics: [TRANSFER_TOPIC, topicOf(SENDER), topicOf(ME)],
    data: word(7n),
  }];

  test('a SIMULATION can never list a token, however convincing its logs', async () => {
    // The hostile case from token-autoadd.ts:5-14, verbatim: a fake inbound
    // Transfer plus a token that answers symbol()/decimals().
    mockMeta.mockResolvedValue(new Map([[MYSTERY.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));

    const h = open();
    h.session.dispatch({
      type: 'sim_deltas_computed',
      address: ME,
      chain_id: CHAIN,
      deltas: [
        { kind: 'native', token: null, delta: '-1000' },
        { kind: 'erc20', token: MYSTERY.toLowerCase(), delta: '1000000' },
      ],
    });
    await flush();

    // Not one write, and no read of the token list either — the admission
    // pipeline is unreachable from this event by construction (invariant ⑤).
    expect(mockStorage.has('vela.customTokens')).toBe(false);
    expect(mockClearCache).not.toHaveBeenCalled();

    // And it renders as unverified: metadata resolved, but a RECEIVED amount
    // from outside the trusted set is never rendered with confidence (⑥).
    expect(h.latest().sim?.ready).toBe(true);
    expect(h.latest().sim?.judgments).toEqual([
      { type: 'native', delta: '-1000' },
      { type: 'erc20_unverified', token: MYSTERY.toLowerCase(), delta: '1000000' },
    ]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('the same token IS listed when the logs come from a confirmed receipt', async () => {
    mockMeta.mockResolvedValue(new Map([[MYSTERY.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]));

    const h = open();
    h.session.dispatch({
      type: 'receipt_logs_confirmed', from: ME, chain_id: CHAIN, logs: receipt,
    });
    await flush();

    expect(JSON.parse(mockStorage.get('vela.customTokens')!)).toEqual([{
      id: `${CHAIN}_${MYSTERY.toLowerCase()}`,
      chainId: CHAIN,
      contractAddress: MYSTERY.toLowerCase(),
      symbol: 'USDC',
      // `name` defaults to the symbol, and `networkName` is re-derived by the
      // shell — exactly what `token-autoadd.ts:68-76` persists today.
      name: 'USDC',
      decimals: 6,
      networkName: 'BNB Chain',
    }]);
    // Without this the token wouldn't show until the 5-min fetchTokens TTL.
    expect(mockClearCache).toHaveBeenCalledWith(ME.toLowerCase());
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a token whose symbol cannot be resolved is never seeded as a "?"', async () => {
    mockMeta.mockResolvedValue(new Map());

    const h = open();
    h.session.dispatch({
      type: 'receipt_logs_confirmed', from: ME, chain_id: CHAIN, logs: receipt,
    });
    await flush();

    expect(mockStorage.has('vela.customTokens')).toBe(false);
    expect(mockClearCache).not.toHaveBeenCalled();
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a held token renders its received amount with confidence', async () => {
    mockMeta.mockResolvedValue(new Map([[MYSTERY.toLowerCase(), { symbol: 'MYS', decimals: 4 }]]));

    const h = open();
    // The `getCachedHeldTokens` snapshot the sign path pushes before judging.
    h.session.dispatch({
      type: 'held_tokens_snapshot', address: ME, chain_id: CHAIN, tokens: [MYSTERY.toLowerCase()],
    });
    h.session.dispatch({
      type: 'sim_deltas_computed',
      address: ME,
      chain_id: CHAIN,
      deltas: [{ kind: 'erc20', token: MYSTERY.toLowerCase(), delta: '1000000' }],
    });
    await flush();

    expect(h.latest().sim?.judgments).toEqual([
      { type: 'erc20_trusted', token: MYSTERY.toLowerCase(), delta: '1000000', symbol: 'MYS', decimals: 4 },
    ]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});
