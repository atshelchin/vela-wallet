// The `manage_tokens` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite. What only exists on
// this side is the executor: the storage codec (snake_case wire vs the
// camelCase `CustomToken` on disk, still written by native and by the auto-add
// path), the `fetchErc20Meta → meta: null` collapse for every unresolved path,
// the address echo the core's staleness gate depends on, and the two side
// effects the shell keeps — the success haptic and the fetchTokens cache drop.
// Getting the codec wrong would silently empty an existing install's custom
// token list, so it is asserted against the real core rather than a double.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

const hapticSuccess = jest.fn();
jest.mock('@/services/platform', () => ({
  hapticSuccess: () => hapticSuccess(),
  isAppActive: () => true,
  showAlert: jest.fn(),
}));

const clearTokenCache = jest.fn();
jest.mock('@/services/wallet-api', () => ({
  clearTokenCache: (address?: string) => clearTokenCache(address),
  fetchTokens: jest.fn(async () => []),
}));

// The probe's transport. Kept at this seam on purpose: `fetchErc20Meta` itself
// runs for real, so its `null` paths (RPC error, a reverted sub-call, a blank
// name/symbol) are the ones being mapped, not a stub's.
const rpcCall = jest.fn();
jest.mock('@/services/rpc-adapter', () => ({
  rpcCall: (method: string, params: unknown[], chainId: number) => rpcCall(method, params, chainId),
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier to
// `index.web.ts`, which is why the session module imports it bare). Importing
// the web entry by explicit path first runs `initSync` on the planted bytes.
import '@/services/vela-core';
import { createManageTokensSession } from '@/services/wallet-state-core/manage-tokens-session';
import type { MtokView } from '@/services/wallet-state-core/generated/MtokView';

const KEY = 'vela.customTokens';
const ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ACCOUNT = '0x1111111111111111111111111111111111111111';

/** Let the effect loop's storage/RPC round-trips settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const word = (n: number) => n.toString(16).padStart(64, '0');
const pad32 = (hex: string) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');

/** A dynamic `string` return value — `[offset][length][data]`, as ERC-20s send. */
function abiString(text: string): string {
  const hex = Buffer.from(text, 'utf8').toString('hex');
  return word(0x20) + word(hex.length / 2) + pad32(hex);
}

/** `aggregate3 -> Result[]`, the layout `decAggregate3` walks. */
function aggregate3(entries: { ok: boolean; data: string }[]): string {
  const elements = entries.map(
    (entry) => word(entry.ok ? 1 : 0) + word(0x40) + word(entry.data.length / 2) + pad32(entry.data),
  );
  const offsets: string[] = [];
  let cursor = entries.length * 32; // past the offset words themselves
  for (const element of elements) {
    offsets.push(word(cursor));
    cursor += element.length / 2;
  }
  return '0x' + word(0x20) + word(entries.length) + offsets.join('') + elements.join('');
}

/** name/symbol/decimals, all three sub-calls succeeding. */
function metaResult(name: string, symbol: string, decimals: number): string {
  return aggregate3([
    { ok: true, data: abiString(name) },
    { ok: true, data: abiString(symbol) },
    { ok: true, data: word(decimals) },
  ]);
}

function open() {
  const faults: unknown[] = [];
  const invalidations: number[] = [];
  let view: MtokView | null = null;
  const session = createManageTokensSession({
    account: () => ACCOUNT,
    onInvalidated: () => invalidations.push(1),
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start({ type: 'start' });
  return { session, faults, invalidations, latest: () => view as MtokView };
}

beforeEach(() => {
  mockStorage.clear();
  hapticSuccess.mockClear();
  clearTokenCache.mockClear();
  rpcCall.mockReset();
});

describe('manage_tokens core (web shell)', () => {
  test('hydrates the manage list from a store written by the TypeScript path', async () => {
    // Exactly what `saveCustomToken` / `token-autoadd.ts` persist today.
    mockStorage.set(
      KEY,
      JSON.stringify([
        {
          id: '1_0xdead', chainId: 1, contractAddress: '0xdead',
          symbol: 'DEAD', name: 'Dead Token', decimals: 6, networkName: 'Ethereum',
        },
      ]),
    );
    const m = open();
    await settle();
    expect(m.latest().custom_tokens).toEqual([
      {
        id: '1_0xdead', chain_id: 1, contract_address: '0xdead',
        symbol: 'DEAD', name: 'Dead Token', decimals: 6, network_name: 'Ethereum',
      },
    ]);
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('a corrupt store hydrates as empty instead of stalling the core', async () => {
    mockStorage.set(KEY, '{ not json');
    const m = open();
    await settle();
    expect(m.latest().custom_tokens).toEqual([]);
    // Ready, not stuck loading: the form still responds.
    m.session.dispatch({ type: 'address_input', s: ADDR });
    expect(m.latest().address_valid).toBe(true);
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('a resolved probe becomes a card; saving writes the on-disk shape, buzzes, invalidates', async () => {
    rpcCall.mockResolvedValue({ result: metaResult('USD Coin', 'USDC', 6) });
    const m = open();
    await settle();
    m.session.dispatch({ type: 'address_input', s: ADDR });
    m.session.dispatch({ type: 'detect_requested', networks: [{ chain_id: 1, name: 'Ethereum' }] });
    await settle();

    expect(m.latest().found).toEqual([
      {
        chain_id: 1, network_name: 'Ethereum', name: 'USD Coin',
        symbol: 'USDC', decimals: 6, added: false,
      },
    ]);
    expect(m.latest().detecting).toBe(false);
    expect(m.latest().not_found).toBe(false);

    m.session.dispatch({ type: 'save_requested', chain_id: 1 });
    await settle();
    await settle();

    // camelCase on disk, address lowercased — unchanged from `handleSave`.
    expect(JSON.parse(mockStorage.get(KEY)!)).toEqual([
      {
        id: `1_${ADDR.toLowerCase()}`,
        chainId: 1,
        contractAddress: ADDR.toLowerCase(),
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        networkName: 'Ethereum',
      },
    ]);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(clearTokenCache).toHaveBeenCalledWith(ACCOUNT);
    expect(m.invalidations).toHaveLength(1);
    expect(m.latest().found[0].added).toBe(true);
    expect(m.latest().saving).toBe(false);
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('every unresolved probe path collapses to no card and the not-found flag', async () => {
    // An RPC error, a reverted sub-call, and a token with no symbol.
    rpcCall
      .mockResolvedValueOnce({ error: { code: -32000, message: 'execution reverted' } })
      .mockResolvedValueOnce({
        result: aggregate3([
          { ok: false, data: '' },
          { ok: false, data: '' },
          { ok: false, data: '' },
        ]),
      })
      .mockResolvedValueOnce({ result: metaResult('Nameless', '', 18) });
    const m = open();
    await settle();
    m.session.dispatch({ type: 'address_input', s: ADDR });
    m.session.dispatch({
      type: 'detect_requested',
      networks: [
        { chain_id: 1, name: 'Ethereum' },
        { chain_id: 8453, name: 'Base' },
        { chain_id: 100, name: 'Gnosis' },
      ],
    });
    await settle();

    expect(m.latest().found).toEqual([]);
    expect(m.latest().not_found).toBe(true);
    expect(m.latest().detecting).toBe(false);
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('a probe answer for a superseded address is dropped (the echo gate)', async () => {
    const other = '0xBBbbbbBBbbbBbBbBbbBBBB00000000000000cafe';
    let release: ((value: unknown) => void) | null = null;
    rpcCall.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const m = open();
    await settle();
    m.session.dispatch({ type: 'address_input', s: ADDR });
    m.session.dispatch({ type: 'detect_requested', networks: [{ chain_id: 1, name: 'Ethereum' }] });
    // The user keeps typing while the probe is out.
    m.session.dispatch({ type: 'address_input', s: other });
    release!({ result: metaResult('USD Coin', 'USDC', 6) });
    await settle();

    // The answer belonged to the old address: no card under the new input.
    expect(m.latest().input_address).toBe(other);
    expect(m.latest().found).toEqual([]);
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('delete drops the row, buzzes and invalidates', async () => {
    mockStorage.set(
      KEY,
      JSON.stringify([
        { id: '1_0xa', chainId: 1, contractAddress: '0xa', symbol: 'A', name: 'A', decimals: 18, networkName: 'Ethereum' },
        { id: '1_0xb', chainId: 1, contractAddress: '0xb', symbol: 'B', name: 'B', decimals: 18, networkName: 'Ethereum' },
      ]),
    );
    const m = open();
    await settle();
    m.session.dispatch({ type: 'delete_requested', id: '1_0xa' });
    await settle();
    await settle();

    expect(m.latest().custom_tokens.map((token) => token.id)).toEqual(['1_0xb']);
    expect(JSON.parse(mockStorage.get(KEY)!).map((t: { id: string }) => t.id)).toEqual(['1_0xb']);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(clearTokenCache).toHaveBeenCalledWith(ACCOUNT);
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });

  test('a token already in storage is marked added without a second write', async () => {
    mockStorage.set(
      KEY,
      JSON.stringify([
        {
          id: `1_${ADDR.toLowerCase()}`, chainId: 1, contractAddress: ADDR.toLowerCase(),
          symbol: 'USDC', name: 'USD Coin', decimals: 6, networkName: 'Ethereum',
        },
      ]),
    );
    rpcCall.mockResolvedValue({ result: metaResult('USD Coin', 'USDC', 6) });
    const m = open();
    await settle();
    m.session.dispatch({ type: 'address_input', s: ADDR });
    m.session.dispatch({ type: 'detect_requested', networks: [{ chain_id: 1, name: 'Ethereum' }] });
    await settle();
    m.session.dispatch({ type: 'save_requested', chain_id: 1 });
    await settle();
    await settle();

    expect(m.latest().found[0].added).toBe(true);
    // No write, so no buzz and no cache drop — as `handleSave`'s early return.
    expect(hapticSuccess).not.toHaveBeenCalled();
    expect(clearTokenCache).not.toHaveBeenCalled();
    expect(m.faults).toEqual([]);
    m.session.dispose();
  });
});
