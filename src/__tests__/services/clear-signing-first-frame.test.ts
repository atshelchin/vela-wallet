// Two properties of the web clear-signing shell that the sheet's wiring depends
// on and that nothing else asserts. The jest suite is `testEnvironment: 'node'`
// and matches `*.test.ts` only, so no component renders here — these cover the
// mechanism the wiring stands on, one level below React.
//
// 1. FIRST FRAME. `use-clear-signing.web.ts` dispatches from a `useLayoutEffect`
//    (as `use-approval-guard.web.ts` already did) so the first committed view
//    lands before the browser paints. That is only worth anything if the core
//    answers `start()` SYNCHRONOUSLY — otherwise the sheet still paints one
//    frame with `surface: 'none'`, every `clear.surface` branch misses, and a
//    generic "Signature request" fallback card appears in front of a request
//    that has not been decoded yet. The tests below call `start()` and assert on
//    the view WITHOUT awaiting anything.
//
// 2. NO TWO ANSWERS TO ONE QUESTION. Every batch leg resolves on its own core
//    session with its own descriptor / ERC-165 / decimals caches. The executor
//    coalesces the lookups that are outstanding at the same moment, so sibling
//    legs asking about the same token are handed the same bytes and cannot
//    disagree — while retaining nothing once a request settles, so it never
//    becomes a second, shell-side cache with its own staleness rules.

const fetchWithTimeout = jest.fn();
jest.mock('@/services/net', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
  NET_TIMEOUTS: { descriptor: 5000 },
}));

const poolRpcCall = jest.fn();
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: (...args: unknown[]) => poolRpcCall(...args),
}));

const lookupSelector = jest.fn();
jest.mock('@/services/selector-registry', () => ({
  lookupSelector: (...args: unknown[]) => lookupSelector(...args),
}));

jest.mock('@/services/storage', () => ({
  getEthereumDataURL: () => 'https://data.example',
}));

// Load-bearing (see clear-signing-core.test.ts): jest lists no `.web.ts` in
// `moduleFileExtensions`, so the web entry has to be imported by explicit path
// for `initSync` to run before a core is constructed.
import '@/services/vela-core';
import { executeClearOperation } from '@/services/wallet-state-core/clear-executor.web';
import { createClearSigningSession } from '@/services/wallet-state-core/clear-session.web';
import type { ClearSigningEvent } from '@/services/wallet-state-core/generated/ClearSigningEvent';
import type { ClearSigningView } from '@/services/wallet-state-core/generated/ClearSigningView';

const LOCALE = {
  number_format: 'comma_dot',
  date_format: 'mdy_slash',
  time_format: 'h24',
  tz_offset_minutes: 0,
} as const;

const TOKEN = '0x1234567890abcdef1234567890abcdef12345678';

/**
 * Everything the session committed, in order, with NOTHING awaited — the frames
 * a layout effect would have flushed to React before the browser painted.
 */
function framesBeforePaint(event: ClearSigningEvent): ClearSigningView[] {
  const frames: ClearSigningView[] = [];
  const session = createClearSigningSession({
    onView: (next) => { frames.push(next); },
    onError: (error) => { throw error; },
  });
  session.start(event);
  return frames;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  fetchWithTimeout.mockResolvedValue({ ok: false, text: async () => '' });
  poolRpcCall.mockResolvedValue({ result: null });
  lookupSelector.mockResolvedValue([]);
});

describe('the frame the signing sheet paints first', () => {
  it('holds a transaction on the loading surface, never on the generic fallback', () => {
    const frames = framesBeforePaint({
      type: 'resolve_transaction',
      to: TOKEN,
      data: '0xa9059cbb',
      value: null,
      chain_id: 1,
      locale: LOCALE,
    });
    const first = frames[frames.length - 1];
    expect(first.resolving).toBe(true);
    expect(first.surface).toBe('loading');
  });

  it('has a personal_sign message adjudicated already', () => {
    const frames = framesBeforePaint({
      type: 'message_presented',
      method: 'personal_sign',
      params: ['0x48656c6c6f'],
      request_origin: 'https://app.example',
    });
    const first = frames[frames.length - 1];
    expect(first.surface).toBe('message_sign');
    expect(first.message).not.toBeNull();
  });

  it('has eth_sign flagged as dangerous already — the buzz cannot lag the banner', () => {
    const frames = framesBeforePaint({
      type: 'message_presented',
      method: 'eth_sign',
      params: ['0x00', `0x${'11'.repeat(32)}`],
      request_origin: 'https://app.example',
    });
    const first = frames[frames.length - 1];
    expect(first.surface).toBe('eth_sign');
    expect(first.danger_haptic).toBe(true);
  });

  it('never leaves a request on `none` — that is the branch the fallback card falls out of', () => {
    // `surface: 'none'` is what `INITIAL_VIEW` carries. If a real request could
    // still be showing it after `start()`, the layout effect would buy nothing.
    for (const event of [
      {
        type: 'resolve_transaction', to: TOKEN, data: '0x', value: '0x1',
        chain_id: 1, locale: LOCALE,
      },
      {
        type: 'resolve_typed_data', typed_data_json: '{"primaryType":"Mail","message":{}}',
        chain_id: 1, locale: LOCALE,
      },
      {
        type: 'message_presented', method: 'personal_sign', params: ['0x00'],
        request_origin: null,
      },
    ] as ClearSigningEvent[]) {
      const frames = framesBeforePaint(event);
      expect(frames[frames.length - 1].surface).not.toBe('none');
    }
  });
});

describe('the executor coalesces the lookups sibling batch legs issue together', () => {
  const probe = (id: number) => ({
    id,
    operation: {
      type: 'rpc_eth_call' as const,
      chain_id: 1,
      to: TOKEN,
      data: '0x313ce567',
      probe: 'decimals' as const,
    },
  });

  it('asks the RPC once and hands both legs the same answer', async () => {
    let release: (value: unknown) => void = () => {};
    poolRpcCall.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const a = executeClearOperation(probe(1), new AbortController().signal);
    const b = executeClearOperation(probe(2), new AbortController().signal);
    release({ result: '0x0000000000000000000000000000000000000000000000000000000000000012' });

    const [ra, rb] = await Promise.all([a, b]);
    expect(poolRpcCall).toHaveBeenCalledTimes(1);
    // Same bytes, not merely equal ones: one leg's ERC-165/decimals race cannot
    // land on a different answer than its sibling's.
    expect(ra).toEqual(rb);
  });

  it('does not answer a DIFFERENT question from an outstanding one', async () => {
    poolRpcCall.mockResolvedValue({ result: '0x01' });
    await Promise.all([
      executeClearOperation(probe(1), new AbortController().signal),
      executeClearOperation(
        {
          id: 2,
          operation: {
            type: 'rpc_eth_call', chain_id: 1, to: TOKEN,
            data: '0x01ffc9a7', probe: 'supports_erc721',
          },
        },
        new AbortController().signal,
      ),
    ]);
    expect(poolRpcCall).toHaveBeenCalledTimes(2);
  });

  it('retains nothing once a request settles', async () => {
    // The distinction from a cache, and the reason no staleness policy is being
    // invented outside the core: a later ask is a fresh request.
    poolRpcCall.mockResolvedValue({ result: '0x02' });
    await executeClearOperation(probe(1), new AbortController().signal);
    await settle();
    await executeClearOperation(probe(2), new AbortController().signal);
    expect(poolRpcCall).toHaveBeenCalledTimes(2);
  });

  it('coalesces descriptor fetches the same way', async () => {
    let release: (value: unknown) => void = () => {};
    fetchWithTimeout.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const path = '/erc7730/eip155-1-token.json';
    const get = (id: number) => executeClearOperation(
      { id, operation: { type: 'http_get', path } },
      new AbortController().signal,
    );
    const a = get(1);
    const b = get(2);
    release({ ok: true, text: async () => '{"ok":1}' });
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(ra).toEqual({ type: 'descriptor_fetched', path, json: '{"ok":1}' });
    expect(rb).toEqual(ra);
  });
});
