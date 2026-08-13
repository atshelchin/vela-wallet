// "Select all valuable" decides which assets get emptied out of a wallet in one
// tap. That predicate exists TWICE and neither copy can be deleted: web runs the
// Rust `send` machine, iOS/Android cannot (Hermes has no WebAssembly) and run
// `services/batch-send.ts`'s `isMultiSelectable(tok, true)` through
// `use-token-multi-select.ts`. So the thing to remove is not the duplication but
// the DRIFT.
//
// A red test here means one platform would sweep an asset the other leaves
// behind — a spam airdrop dragged into a signed MultiSend, or a real holding
// silently skipped.
//
// It also pins the SCOPE split, which is deliberate and is the reason the shell
// still says anything at all: `TokenSelector` hands `onToggleAll` its own
// search/category-filtered rows, and sweeping a token the user cannot see is a
// fund-safety regression. The shell states that scope (`visible_ids`); the core
// decides membership and the on/off direction. Before this round the shell ran
// `selectAllValuable` itself and the core's aggregate event was dead code.
//
// The Rust core is driven for real, through the web session — never transcribed
// into a snapshot someone can regenerate without looking at the other side.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => {
    mockStorage.set(key, val);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));
// The passkey module reaches for react-native's NativeModules at import time.
jest.mock('@/modules/passkey', () => ({
  PasskeyErrorCode: { CANCELLED: 'PASSKEY_CANCELLED', FAILED: 'PASSKEY_FAILED' },
  sign: jest.fn(),
  cancelSign: jest.fn(),
}));
jest.mock('@/services/platform', () => ({
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
  showAlert: jest.fn(),
}));

const mockFetchTokens = jest.fn<Promise<unknown[]>, [string, unknown]>(async () => []);
jest.mock('@/services/wallet-api', () => ({
  fetchTokens: (address: string, options: unknown) => mockFetchTokens(address, options),
  clearTokenCache: jest.fn(),
}));
jest.mock('@/services/safe-transaction', () => ({
  ...jest.requireActual('@/services/safe-transaction'),
  prefetchForSend: jest.fn(),
  estimateTransactionFee: jest.fn(async () => null),
}));
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: jest.fn(async () => null),
}));
jest.mock('@/services/recipient-risk', () => ({
  resolveRecipientRisk: jest.fn(async () => null),
}));
jest.mock('@/services/tx-simulation', () => ({
  simulateAssetChanges: jest.fn(async () => null),
  serializeAssetSim: (sim: unknown) => sim,
}));

// Load-bearing: jest lists no `.web.ts` in `moduleFileExtensions`, so a bare
// `@/services/vela-core` resolves the NATIVE index and the wasm is never
// initialized. The explicit web entry runs `initSync` on the planted bytes.
import '@/services/vela-core';
import { networkId } from '@/models/network';
import { tokenId, type APIToken } from '@/models/types';
// The REAL native predicate — the one `use-token-multi-select.ts` calls.
import { selectAllValuable } from '@/services/batch-send';
import { createSendSession } from '@/services/wallet-state-core/send-session';
import type { SendEvent } from '@/services/wallet-state-core/generated/SendEvent';
import type { SendView } from '@/services/wallet-state-core/generated/SendView';

const CHAIN = 1;
const ME = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const SHIB = '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE';

const settle = async () => {
  for (let i = 0; i < 16; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

function token(over: Partial<APIToken>): APIToken {
  return {
    network: networkId(CHAIN),
    chainName: 'Ethereum',
    symbol: 'TKN',
    balance: '1',
    decimals: 18,
    logo: null,
    name: 'Token',
    tokenAddress: null,
    priceUsd: 1,
    spam: false,
    ...over,
  };
}

/** The table: one row per way a holding can fail (or pass) the predicate. */
const NATIVE = token({ symbol: 'ETH', balance: '2', priceUsd: 2000, tokenAddress: null });
const STABLE = token({ symbol: 'USDC', balance: '100', decimals: 6, priceUsd: 1, tokenAddress: USDC });
const SPAM = token({ symbol: 'SPAM', balance: '9', priceUsd: 3, tokenAddress: SHIB, spam: true });
const UNPRICED = token({ symbol: 'MYST', balance: '5', priceUsd: null, tokenAddress: DAI });
const ZERO_PRICE = token({ symbol: 'ZERO', balance: '7', priceUsd: 0, tokenAddress: '0x1111111111111111111111111111111111111111' });
const DUST = token({ symbol: 'DUST', balance: '0.0000000000000001', priceUsd: 0.000001, tokenAddress: '0x2222222222222222222222222222222222222222' });
const NO_BALANCE = token({ symbol: 'EMPTY', balance: '0', priceUsd: 500, tokenAddress: '0x3333333333333333333333333333333333333333' });

const CATALOG = [NATIVE, STABLE, SPAM, UNPRICED, ZERO_PRICE, DUST, NO_BALANCE];

function open(tokens: APIToken[]) {
  let view: SendView | null = null;
  const holder: { session: ReturnType<typeof createSendSession> | null } = { session: null };
  mockFetchTokens.mockImplementation(async () => tokens);
  const session = createSendSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => {
      throw error;
    },
    ports: {
      tokensFetched: () => {},
      tokensPartial: (partial) => holder.session?.dispatch({ type: 'tokens_partial', tokens: partial }),
      credentialId: () => 'cred-1',
      credentialLoaded: () => {},
      signingStarted: () => {},
      receiptUpdate: () => {},
      alert: () => {},
      close: () => {},
      // The fee seam. `EstimateFee` is answered by the screen's live
      // `fee_policy` session in production; this suite is not about the
      // quote, so it refuses one — the same answer a failed estimate gives.
      feeQuote: async () => ({ type: 'failed' as const, kind: 'estimate_failed' as const }),
    },
  });
  holder.session = session;
  session.start({
    type: 'open',
    account: { id: 'cred-1', address: ME, name: 'Me' },
    params: {
      preselected_symbol: null,
      preselected_network: null,
      prefilled_recipient: null,
      prefilled_chain_id: null,
      prefilled_token_address: null,
      prefilled_amount_base: null,
      locked: false,
      preselected_multi: null,
    },
    display: { code: 'USD', rate: 1, fiat_decimals: 2 },
  });
  return {
    session,
    dispatch: (event: SendEvent) => session.dispatch(event),
    latest: () => view as SendView,
  };
}

/**
 * What `use-token-multi-select.ts:35-45` would do to a selection, expressed over
 * the SAME `selectAllValuable` the native hook calls. Only the four lines of set
 * algebra are transcribed; the money predicate is the real import, which is the
 * half that decides whose funds move.
 */
function nativeToggleAll(selected: Set<string>, visible: APIToken[]): Set<string> {
  const valuable = selectAllValuable(visible);
  if (valuable.length === 0) return selected;
  const allOn = valuable.every((tk) => selected.has(tokenId(tk)));
  const next = new Set(selected);
  for (const tk of valuable) {
    if (allOn) next.delete(tokenId(tk));
    else next.add(tokenId(tk));
  }
  return next;
}

let sessions: { dispose: () => void }[] = [];
afterEach(() => {
  sessions.forEach((s) => s.dispose());
  sessions = [];
  jest.clearAllMocks();
});

async function sweeper(tokens: APIToken[] = CATALOG) {
  const app = open(tokens);
  sessions.push(app.session);
  await settle();
  app.dispatch({ type: 'set_multi_network', chain_id: CHAIN });
  await settle();
  return app;
}

describe('select-all-valuable: the core and the native hook agree on WHO gets swept', () => {
  it('projects exactly the ids the native predicate picks', async () => {
    const app = await sweeper();
    // Only tokens the core actually holds (it drops zero balances on load).
    const held = app.latest().tokens.map((t) => `${t.network}_${t.token_address ?? 'native'}_${t.symbol}`);
    const nativeAnswer = selectAllValuable(CATALOG.filter((t) => held.includes(tokenId(t)))).map(tokenId);
    expect([...app.latest().multi_valuable_ids].sort()).toEqual([...nativeAnswer].sort());
    // And it is not vacuous: the good holdings are in, the bad ones are out.
    expect(app.latest().multi_valuable_ids).toContain(tokenId(NATIVE));
    expect(app.latest().multi_valuable_ids).toContain(tokenId(STABLE));
    expect(app.latest().multi_valuable_ids).not.toContain(tokenId(SPAM));
    expect(app.latest().multi_valuable_ids).not.toContain(tokenId(UNPRICED));
    expect(app.latest().multi_valuable_ids).not.toContain(tokenId(ZERO_PRICE));
  });

  it('reaches the same selection as the native hook, tap for tap', async () => {
    const app = await sweeper();
    const visible = CATALOG.filter((t) =>
      app.latest().tokens.some((w) => `${w.network}_${w.token_address ?? 'native'}_${w.symbol}` === tokenId(t)),
    );
    let mirror = new Set<string>();

    const tapAll = async (rows: APIToken[]) => {
      app.dispatch({ type: 'toggle_all_multi_tokens', visible_ids: rows.map(tokenId) });
      await settle();
      mirror = nativeToggleAll(mirror, rows);
      expect([...app.latest().multi_selected_ids].sort()).toEqual([...mirror].sort());
    };

    await tapAll(visible); // on
    expect(app.latest().multi_selected_ids.length).toBeGreaterThan(1);
    await tapAll(visible); // off again
    expect(app.latest().multi_selected_ids).toEqual([]);

    // A hand-picked row plus a master tap: both sides keep the same union.
    app.dispatch({ type: 'toggle_multi_token', token_id: tokenId(UNPRICED) });
    await settle();
    mirror.add(tokenId(UNPRICED));
    await tapAll(visible);
  });

  it('sweeps only the rows the picker is showing', async () => {
    const app = await sweeper();
    // The search box narrowed to one row.
    const visible = [STABLE];
    app.dispatch({ type: 'toggle_all_multi_tokens', visible_ids: visible.map(tokenId) });
    await settle();
    expect(app.latest().multi_selected_ids).toEqual([tokenId(STABLE)]);
    expect(app.latest().multi_selected_ids).not.toContain(tokenId(NATIVE));
    // …and the native hook, handed the same narrowed list, says the same.
    expect([...nativeToggleAll(new Set(), visible)]).toEqual([tokenId(STABLE)]);
  });

  it('a filtered list can never select a token the core does not hold', async () => {
    const app = await sweeper();
    app.dispatch({
      type: 'toggle_all_multi_tokens',
      visible_ids: [tokenId(NO_BALANCE), 'ethereum_0xdeadbeef_GHOST'],
    });
    await settle();
    expect(app.latest().multi_selected_ids).toEqual([]);
  });
});
