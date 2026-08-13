// The `fee_policy` core (Rust/wasm) driven through the WEB shell.
//
// `fee-policy-parity.test.ts` proves the two IMPLEMENTATIONS agree. It cannot
// prove the web runtime reaches either of them — and for four rounds it did
// not: `fee_policy.rs` shipped complete inside the wasm with zero construction
// sites in `src/`, while `GasFeeCard` went on computing the fee in TypeScript.
// Every gate in the repo was green throughout (`specs/017-.../integration-plan.md`).
//
// So this suite asserts the WIRING, against the same corpus:
//
//   - the quote the web session settles on IS the corpus number, produced by
//     the real core over the real executor;
//   - the executor's codec — `FeeCall.value` is a decimal base-unit string on
//     the wire and HEX by the time it reaches the MultiSend builder, which is
//     the difference between simulating this operation and a different one;
//   - the fee leg is the CORE's, appended to the recipient its own quote named,
//     so what is simulated is what is submitted;
//   - the picker rows carry the core's `insufficient`, not a second copy of the
//     gate;
//   - the readers stop at the wire: a degenerate zero bundler quote reaches the
//     core, because `accept_bundler_quote` is where that rule lives.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const gasSignalReads: { chainId: number; wantTip: boolean }[] = [];
const mockGasSignals = jest.fn(async (chainId: number, wantTip: boolean) => {
  gasSignalReads.push({ chainId, wantTip });
  return { ethGasPrice: '1000000000', baseFee: '1000000000', priorityFee: '0' };
});
const mockBundlerQuote = jest.fn(async (): Promise<unknown> => null);
const mockSimulate = jest.fn(async (_params: unknown): Promise<unknown> => ({
  kind: 'simulation_failed',
}));
const simulations: {
  chainId: number;
  account: string;
  deployed: boolean;
  calls: { to: string; value: string; data: string }[];
  publicKeyHex?: string;
}[] = [];

jest.mock('@/services/safe-transaction', () => ({
  ...jest.requireActual('@/services/safe-transaction'),
  fetchRawGasSignals: (chainId: number, wantTip: boolean) => mockGasSignals(chainId, wantTip),
  fetchRawBundlerQuote: () => mockBundlerQuote(),
  simulateUserOpGas: (params: any) => {
    simulations.push(params);
    return mockSimulate(params);
  },
}));

const mockInBandQuotes = jest.fn(async (): Promise<unknown[] | null> => null);
jest.mock('@/services/bundler-service', () => ({
  fetchInBandGasQuotes: () => mockInBandQuotes(),
  fetchBundlerAccountInfo: jest.fn(async () => null),
}));

import '@/services/vela-core';
import { createFeeSession } from '@/services/wallet-state-core/fee-session';
import type { FeeView } from '@/services/wallet-state-core/generated/FeeView';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAIN = 137;
const ME = '0x1111111111111111111111111111111111111111';
const RELAY = '0x4444444444444444444444444444444444444444';
const USDC = '0x2222222222222222222222222222222222222222';
const PUBKEY = '04' + '11'.repeat(64);

const nativeRow = (usdPrice: string | null = '2000') => ({
  recipient: RELAY,
  asset: 'native' as const,
  feeToken: null,
  balance: 10n ** 18n,
  decimals: 18,
  symbol: 'POL',
  usdBalance: '2000',
  usdPrice,
});

const erc20Row = (over: Record<string, unknown> = {}) => ({
  recipient: RELAY,
  asset: 'erc20' as const,
  feeToken: USDC,
  balance: 1_000_000_000n,
  decimals: 6,
  symbol: 'USDC',
  usdBalance: '1000',
  usdPrice: '1',
  ...over,
} as ReturnType<typeof nativeRow> & { feeToken: string });

/** An 18-decimal stablecoin — the DAI shape the 126-DAI corpus case prices. */
const daiRow = () => erc20Row({ decimals: 18, symbol: 'DAI', balance: 10n ** 21n, usdBalance: '1000' });

interface Harness {
  latest(): FeeView;
  settled(): Promise<FeeView>;
  dispatch(event: any): void;
  dispose(): void;
}

function open(event: any): Harness {
  let view: FeeView | null = null;
  const faults: unknown[] = [];
  const session = createFeeSession({
    onView: (next) => { view = next; },
    onError: (error) => faults.push(error),
    publicKeyHex: () => PUBKEY,
  });
  session.start(event);
  return {
    latest: () => {
      if (faults.length) throw faults[0];
      return view!;
    },
    settled: async () => {
      // The effect loop resolves through promise microtasks; a handful of turns
      // is enough for the gather → estimate → price pipeline with mocked I/O.
      for (let i = 0; i < 40 && (view === null || view.busy); i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 40 && view!.busy; i++) await Promise.resolve();
      if (faults.length) throw faults[0];
      return view!;
    },
    dispatch: (event) => session.dispatch(event),
    dispose: () => session.dispose(),
  };
}

const quoteRequest = (over: Record<string, unknown> = {}) => ({
  type: 'quote_requested',
  chain_id: CHAIN,
  account: ME,
  deployed: true,
  public_key_available: true,
  tier: 'fast',
  calls: [],
  fee_token: null,
  ...over,
});

// ---------------------------------------------------------------------------
// The shared oracle — the SAME file `fee-policy-parity.test.ts` replays
// ---------------------------------------------------------------------------

interface VectorCase {
  name: string;
  fn: string;
  input: Record<string, any>;
  expect: Record<string, any>;
}
const corpus: { suite: string; cases: VectorCase[] } = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../rust/crates/vela-core/tests/vectors-fee-policy/fee-policy.json'),
    'utf8',
  ),
);

/**
 * The corpus case this suite drives end to end: 700k gas at 30 gwei, ETH at
 * $2,000, paid in an 18-decimal $1 stablecoin. That is the case `4a2fc3e`
 * added — the one where a u128 numerator saturated and 126 DAI was quoted as
 * one cent. Pinning the WIRED path to it means the fix cannot be true in the
 * core while the web runtime quotes something else.
 *
 * Chosen by INPUT, not by index or name, so a renamed or reordered corpus
 * cannot silently point this at a different number — it finds none and the
 * first test fails.
 */
const WIRED_TOTAL_GAS = 700_000n;
const WIRED_GAS_PRICE = 30_000_000_000n;
const wiredCase = corpus.cases.find(
  (c) =>
    c.fn === 'in_band_fee' &&
    c.input.total_gas === WIRED_TOTAL_GAS.toString() &&
    c.input.gas_price === WIRED_GAS_PRICE.toString() &&
    c.input.fee_asset?.is_native === false &&
    c.input.fee_asset?.decimals === 18 &&
    c.input.fee_asset?.usd_price === '1' &&
    c.input.native_asset?.usd_price === '2000' &&
    c.expect.amount !== null,
);

/**
 * The bundler answers a raw quote whose `networkFeePerGas` IS the corpus's gas
 * price, so nothing between here and the core rescales it.
 */
const wiredBundlerQuote = {
  maxFeePerGas: (WIRED_GAS_PRICE * 2n).toString(),
  networkFeePerGas: WIRED_GAS_PRICE.toString(),
  relayerFeePerGas: WIRED_GAS_PRICE.toString(),
};

/**
 * Raw limits that the core's padding turns into exactly 700,000 gas:
 * `max(0 x 1.5, 300k) + max(200k x 1.5, 100k) + (90k + 10k)`. Stated as the
 * bundler's own numbers because that padding is the core's, not the shell's.
 */
const wiredGasOutcome = {
  kind: 'estimated' as const,
  verificationGasLimit: 0n,
  callGasLimit: 200_000n,
  preVerificationGas: 90_000n,
};

beforeEach(() => {
  simulations.length = 0;
  gasSignalReads.length = 0;
  mockGasSignals.mockClear();
  mockBundlerQuote.mockReset();
  mockBundlerQuote.mockResolvedValue(null);
  mockSimulate.mockReset();
  mockSimulate.mockResolvedValue({ kind: 'simulation_failed' });
  mockInBandQuotes.mockReset();
  mockInBandQuotes.mockResolvedValue(null);
});

describe('fee_policy is wired into the web shell', () => {
  it('has a corpus case that pins the wired quote', () => {
    // Without this the suite below could pass while asserting nothing, which is
    // the exact failure mode it exists to close.
    expect(corpus.suite).toBe('fee-policy');
    expect(wiredCase).toBeDefined();
  });

  it('publishes a PRISTINE view before the first dispatch — which is not an answer', async () => {
    // The trap the send flow fell into. `EffectLoop.start` commits the core's
    // own initial view before it dispatches anything, and that view is
    // `busy: false, fee: null, failed: null` — byte-identical to "the run
    // finished with nothing". A caller that resolves its request on the first
    // non-busy view therefore answers EVERY first quote with "no fee", and the
    // `send` core reads that as a refused estimate and never reaches confirm.
    //
    // `use-fee-quote.ts` judges a request against the view its own dispatch
    // produced, never against this one. This test is what makes that reasoning
    // checkable: if `start` ever stops publishing a pre-dispatch view, the
    // guard becomes dead code and someone should know.
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    const seen: FeeView[] = [];
    const session = createFeeSession({
      onView: (next) => seen.push(next),
      onError: (error) => { throw error; },
      publicKeyHex: () => PUBKEY,
    });
    session.start(quoteRequest() as any);

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toMatchObject({ busy: false, fee: null, failed: null });
    // …and the very next one, from the dispatch itself, is the run starting.
    expect(seen[1].busy).toBe(true);
    session.dispose();
  });

  it('settles on the CORPUS number, through the real core and the real executor', async () => {
    mockInBandQuotes.mockResolvedValue([nativeRow(), daiRow()]);
    mockBundlerQuote.mockResolvedValue(wiredBundlerQuote);
    mockSimulate.mockResolvedValue(wiredGasOutcome);

    const app = open(quoteRequest({ fee_token: USDC }));
    const view = await app.settled();

    expect(view.failed).toBeNull();
    expect(view.fee).not.toBeNull();
    expect(view.fee!.fee_asset.type).toBe('erc20');
    // 126 DAI, in full. Quoted as one cent before `4a2fc3e`.
    expect((view.fee!.fee_asset as any).amount).toBe(wiredCase!.expect.amount);
    expect((view.fee!.fee_asset as any).amount).toBe('126000000000000000000');
    // The gas basis the corpus case was chosen for — proof the number above is
    // that case's answer and not a coincidence at a different basis.
    expect(view.fee!.total_gas).toBe(WIRED_TOTAL_GAS.toString());
    expect(view.fee!.network_fee_per_gas).toBe(WIRED_GAS_PRICE.toString());
    // Displayed = signed: the recipient rides with the quote.
    expect(view.fee!.fee_recipient).toBe(RELAY);
    expect(view.confirm_fee_ready).toBe(true);
    // The picker row shows the same number the estimate carries — one value,
    // read twice, never computed twice.
    expect(view.options.find((r) => r.selected)!.amount).toBe(wiredCase!.expect.amount);
    app.dispose();
  });

  it('simulates the CORE fee leg, and hands the builder hex', async () => {
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    // 25 USDC as the core states it: a decimal base-unit string.
    const transfer = { to: USDC, value: '0', data: '0xa9059cbb' + '00'.repeat(64) };
    const app = open(quoteRequest({ fee_token: USDC, calls: [transfer] }));
    await app.settled();

    expect(simulations).toHaveLength(1);
    const sim = simulations[0];
    expect(sim.account).toBe(ME);
    expect(sim.deployed).toBe(true);
    expect(sim.publicKeyHex).toBe(PUBKEY);
    // The user's call plus the fee leg the CORE appended — the shell built
    // neither, so the simulated operation is the submitted one.
    expect(sim.calls).toHaveLength(2);
    expect(sim.calls[0].to).toBe(USDC);
    expect(sim.calls[1].to.toLowerCase()).toBe(USDC.toLowerCase());
    // ERC-20 `transfer(recipient, 1)` — the placeholder amount, to the quote's
    // own recipient.
    expect(sim.calls[1].data.startsWith('0xa9059cbb')).toBe(true);
    expect(sim.calls[1].data.toLowerCase()).toContain(RELAY.slice(2).toLowerCase());
    // Every value crosses this seam as HEX. `'0'` decimal would be read as the
    // hex string it is not.
    for (const call of sim.calls) expect(call.value.startsWith('0x')).toBe(true);
    app.dispose();
  });

  it('publishes picker rows whose gate is the core’s', async () => {
    // A stablecoin the Safe holds too little of to pay with, beside a native row
    // it can. The rule (`fee_row_insufficient`) is asserted against the corpus
    // in the parity suite; here it must reach the ROW.
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row({ balance: 1n })]);
    const app = open(quoteRequest());
    const view = await app.settled();

    const rows = view.options;
    expect(rows.map((r) => r.symbol)).toEqual(['POL', 'USDC']);
    expect(rows[0].selected).toBe(true);
    expect(rows[0].insufficient).toBe(false);
    expect(rows[1].insufficient).toBe(true);
    // The cost of THIS transaction in each coin, priced by the core.
    expect(rows[0].amount).not.toBeNull();
    expect(rows[1].amount).not.toBeNull();
    app.dispose();
  });

  it('drops a zero-balance stablecoin from the picker, not the executor', async () => {
    // `use-inband-fee-tokens.ts` filtered these out before handing them over.
    // The executor now passes every row the bundler published and `picker_rows`
    // decides — one filter, in the machine that owns it.
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row({ balance: 0n })]);
    const app = open(quoteRequest());
    const view = await app.settled();
    expect(view.options.map((r) => r.symbol)).toEqual(['POL']);
    app.dispose();
  });

  it('lets the CORE reject a degenerate zero bundler quote', async () => {
    // `getBundlerGasQuote` rejects `maxFeePerGas = 0` itself and returns null.
    // `fetchRawBundlerQuote` deliberately does not, so `accept_bundler_quote`
    // is the only place that rule runs — and the local fallback it falls to is
    // what prices the quote below.
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    mockBundlerQuote.mockResolvedValue({
      maxFeePerGas: '0',
      networkFeePerGas: '0',
      relayerFeePerGas: '0',
    });
    const app = open(quoteRequest({ fee_token: USDC }));
    const view = await app.settled();

    expect(view.fee).not.toBeNull();
    // Not the bundler's zero: the chain price, marked up by the 'fast' tier.
    expect(view.fee!.quoted).toBe(false);
    expect(BigInt(view.fee!.network_fee_per_gas)).toBeGreaterThan(0n);
    app.dispose();
  });

  it('refuses rather than quotes when the relay cannot price the chosen asset', async () => {
    mockInBandQuotes.mockResolvedValue([nativeRow()]);
    const app = open(quoteRequest({ fee_token: USDC }));
    const view = await app.settled();

    // The semantic variant, not a message the shell pattern-matched.
    expect(view.failed).toBe('fee_token_unavailable');
    expect(view.fee).toBeNull();
    expect(view.confirm_fee_ready).toBe(false);
    app.dispose();
  });

  it('never estimates an undeployed account it cannot build initCode for', async () => {
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    const app = open(quoteRequest({ deployed: false, public_key_available: false }));
    const view = await app.settled();

    expect(view.failed).toBe('missing_public_key');
    expect(simulations).toHaveLength(0);
    app.dispose();
  });

  it('recomputes a chip switch locally — no second trip to the relay', async () => {
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    const app = open(quoteRequest());
    await app.settled();
    const quotesBefore = mockInBandQuotes.mock.calls.length;
    const simsBefore = simulations.length;

    app.dispatch({ type: 'select_fee_asset', token: USDC });
    const view = await app.settled();

    expect(view.fee_token).toBe(USDC);
    expect(view.fee!.fee_asset.type).toBe('erc20');
    expect(view.options.find((r) => r.contract === USDC)!.selected).toBe(true);
    // The switch is a recompute on the settled quote, which is why it is free.
    expect(mockInBandQuotes.mock.calls.length).toBe(quotesBefore);
    expect(simulations.length).toBe(simsBefore);
    app.dispose();
  });

  it('drops the fee-asset choice and a stale ERC-20 quote on leaving confirm', async () => {
    // Invariant ⑥. An ERC-20 estimate carries `total_wei = 0`, and the reserve
    // math downstream would read that as "gas is free".
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    const app = open(quoteRequest({ fee_token: USDC }));
    expect((await app.settled()).fee!.fee_asset.type).toBe('erc20');

    app.dispatch({ type: 'leave_confirm' });
    const view = app.latest();
    expect(view.fee).toBeNull();
    expect(view.fee_token).toBeNull();
    app.dispose();
  });

  it('hides a quote that belongs to another chain', async () => {
    // Invariant ①. The estimate is kept and HIDDEN rather than deleted, which
    // is what makes a late old-chain answer harmless instead of poisonous.
    mockInBandQuotes.mockResolvedValue([nativeRow(), erc20Row()]);
    const app = open(quoteRequest());
    expect((await app.settled()).fee).not.toBeNull();

    app.dispatch({ type: 'chain_changed', chain_id: CHAIN + 1 });
    expect(app.latest().fee).toBeNull();
    expect(app.latest().confirm_fee_ready).toBe(false);
    app.dispose();
  });
});
