// The `send` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules — the step machine, the re-entry lock, the cancel
// checkpoints, the Max math, the same-asset ceiling — are covered by the Rust
// suite. What only exists on THIS side is the executor, and every one of its
// jobs is a fund-safety job:
//
//   - **The amount codec.** The core states base units as DECIMAL strings and
//     every consumer in `safe-transaction.ts` reads `value` as HEX. Getting it
//     wrong does not fail loudly — it signs a different number.
//   - **`displayed = signed` (invariant ①).** The `quotedFee` handed to the
//     submit path must be built from the very estimate the confirm screen
//     rendered, across a JSON boundary that turns every bigint into a string.
//   - **The persist → track ordering (invariant ⑥).** All siblings in ONE
//     atomic write, and the tracker only after it: a patch that lands before
//     its record is a silent no-op, stranding a confirmed send as pending.
//   - **The pre-sign treasury recheck (invariant ⑭).** A float that fell below
//     its floor after the preflight must stop the flow BEFORE the passkey.
//   - **The failure classification.** `PasskeyErrorCode.CANCELLED`,
//     `parseBundlerUnderfunded` and the relayer-unavailable regex are matched
//     here; the core only ever sees typed variants (invariant ⑮).
//   - **Invariant ⑫.** An EIP-681 amount is restored with the token's REAL
//     on-chain decimals, never the ones the link implied.
//
// All of them are asserted against the real core, over the real executor, with
// the real `services/storage.ts` on a mocked key-value store.

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

// The passkey ceremony. Only its error vocabulary and the cancel entry point
// reach the executor; the assertion itself is never verified here.
const mockPasskeySign = jest.fn(async () => ({
  signatureHex: '00',
  authenticatorDataHex: '00',
  clientDataJSONHex: '00',
}));
const mockCancelSign = jest.fn();
jest.mock('@/modules/passkey', () => ({
  PasskeyErrorCode: { CANCELLED: 'PASSKEY_CANCELLED', FAILED: 'PASSKEY_FAILED' },
  sign: (...args: unknown[]) => mockPasskeySign(...(args as [])),
  cancelSign: () => mockCancelSign(),
}));

// The Safe-compat check the sign closure runs on the assertion. Everything else
// in the module (hex codecs) stays real.
jest.mock('@/services/vela-core', () => ({
  ...jest.requireActual('@/services/vela-core'),
  verifySafeWebAuthn: () => ({ ok: true }),
}));

// The token list.
const mockFetchTokens = jest.fn<Promise<any[]>, [string, any]>(async () => []);
const mockClearTokenCache = jest.fn();
jest.mock('@/services/wallet-api', () => ({
  fetchTokens: (address: string, options: any) => mockFetchTokens(address, options),
  clearTokenCache: (address?: string) => mockClearTokenCache(address),
}));

// The money calls. `sendBatchCalls` is the single I/O site a send exists for.
type SubmitArgs = {
  from: string;
  calls: { to: string; value: string; data: string }[];
  chainId: number;
  publicKeyHex: string;
  maxFee: bigint | undefined;
  gasFeeToken: string | null | undefined;
  quotedFee: { amount: bigint; recipient: string } | undefined;
};
const submits: SubmitArgs[] = [];
type EstimateArgs = {
  from: string;
  chainId: number;
  tier: string;
  tx: any;
  batch: any;
  gasFeeToken: string | null | undefined;
  publicKeyHex: string | undefined;
};
const estimates: EstimateArgs[] = [];
let estimateImpl: (args: EstimateArgs) => Promise<any> = async () => FEE;
let submitImpl: (
  args: SubmitArgs,
  signFn: (challenge: Uint8Array) => Promise<unknown>,
) => Promise<any> = async () => ({
  userOpHash: OP_HASH,
  waitForTxHash: async () => TX_HASH,
});

class FakeFeeHoldError extends Error {}
class FakeRejectedError extends Error {}

jest.mock('@/services/safe-transaction', () => ({
  prefetchForSend: jest.fn(),
  estimateTransactionFee: (
    from: string,
    chainId: number,
    tier: string,
    tx: any,
    batch: any,
    gasFeeToken: any,
    publicKeyHex: any,
  ) => {
    const args = { from, chainId, tier, tx, batch, gasFeeToken, publicKeyHex };
    estimates.push(args);
    return estimateImpl(args);
  },
  sendBatchCalls: (
    from: string,
    calls: any,
    chainId: number,
    publicKeyHex: string,
    signFn: any,
    maxFee: any,
    gasFeeToken: any,
    quotedFee: any,
  ) => {
    const args: SubmitArgs = { from, calls, chainId, publicKeyHex, maxFee, gasFeeToken, quotedFee };
    submits.push(args);
    return submitImpl(args, signFn);
  },
  get UserOpFeeHoldError() {
    return FakeFeeHoldError;
  },
  get UserOpRejectedError() {
    return FakeRejectedError;
  },
}));

// The relayer treasury.
let treasuryImpl: () => Promise<any> = async () => ({ kind: 'unknown' });
const mockParseUnderfunded = jest.fn((message: string) =>
  /Deposit to:/i.test(message) ? { depositAddress: '0xdead' } : null,
);
jest.mock('@/services/bundler-service', () => ({
  probeTreasury: () => treasuryImpl(),
  parseBundlerUnderfunded: (message: string) => mockParseUnderfunded(message ?? ''),
}));

// Best-effort confirm-step surfaces.
jest.mock('@/services/recipient-identity', () => ({
  resolveRecipientIdentity: jest.fn(async () => ({ name: 'Bob', source: 'ens' })),
}));
jest.mock('@/services/recipient-risk', () => ({
  resolveRecipientRisk: jest.fn(async () => ({ isContract: false, firstInteraction: true })),
}));
jest.mock('@/services/tx-simulation', () => ({
  simulateAssetChanges: jest.fn(async () => null),
  serializeAssetSim: (sim: unknown) => sim,
}));
const mockResolveMeta = jest.fn(async () => new Map<string, { symbol: string; decimals: number }>());
jest.mock('@/services/token-metadata', () => ({
  resolveTokenMetadata: (...args: unknown[]) => mockResolveMeta(...(args as [])),
}));
jest.mock('@/services/add-network', () => ({
  addCustomNetworkByChainId: jest.fn(async () => ({ ok: false, reason: 'not-found' })),
}));
const haptics: string[] = [];
jest.mock('@/services/platform', () => ({
  hapticSuccess: () => haptics.push('success'),
  hapticError: () => haptics.push('error'),
  showAlert: jest.fn(),
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized. Importing the web entry by explicit
// path first runs `initSync` on the planted bytes.
import '@/services/vela-core/index.web';
import { networkId } from '@/models/network';
import { tokenId, type APIToken } from '@/models/types';
import { loadTransactions } from '@/services/storage';
import { createSendSession } from '@/services/wallet-state-core/send-session.web';
import { _resetFeeRegistry } from '@/services/wallet-state-core/send-types';
import type { SendAlertKind } from '@/services/wallet-state-core/generated/SendAlertKind';
import type { SendEvent } from '@/services/wallet-state-core/generated/SendEvent';
import type { SendView } from '@/services/wallet-state-core/generated/SendView';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAIN = 1;
const ME = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const BOB = '0x2222222222222222222222222222222222222222';
const CAROL = '0x3333333333333333333333333333333333333333';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const FEE_RECIPIENT = '0x4444444444444444444444444444444444444444';
const OP_HASH = '0xa1b2c3';
const TX_HASH = '0xdeadbeef';
const PUBKEY = '04' + '11'.repeat(64);

const FEE = {
  chainId: CHAIN,
  totalWei: 105_000n,
  maxFeePerGas: 5n,
  networkFeePerGas: 3n,
  relayerFeePerGas: 2n,
  bundlerGasPrice: 3n,
  totalGas: 21_000n,
  deployed: true,
  tier: 'fast' as const,
  quoted: true,
  inBand: true,
  feeAsset: { kind: 'native' as const },
  feeRecipient: FEE_RECIPIENT,
};

const NATIVE: APIToken = {
  network: networkId(CHAIN),
  chainName: 'Ethereum',
  symbol: 'ETH',
  balance: '2',
  decimals: 18,
  logo: null,
  name: 'Ether',
  tokenAddress: null,
  priceUsd: 2000,
  spam: false,
};

const TOKEN: APIToken = {
  network: networkId(CHAIN),
  chainName: 'Ethereum',
  symbol: 'USDC',
  balance: '100',
  decimals: 6,
  logo: null,
  name: 'USD Coin',
  tokenAddress: USDC,
  priceUsd: 1,
  spam: false,
};

/** Let the effect loop's round trips settle. */
const settle = async () => {
  for (let i = 0; i < 24; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

function open(params: Partial<Extract<SendEvent, { type: 'open' }>['params']> = {}) {
  const faults: unknown[] = [];
  const alerts: SendAlertKind[] = [];
  const partials: number[] = [];
  const receipts: { hash: string; outcome: string }[] = [];
  let view: SendView | null = null;
  const holder: { session: ReturnType<typeof createSendSession> | null } = { session: null };

  const session = createSendSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => faults.push(error),
    ports: {
      tokensFetched: () => {},
      tokensPartial: (tokens) => {
        partials.push(tokens.length);
        holder.session?.dispatch({ type: 'tokens_partial', tokens });
      },
      credentialId: () => 'cred-1',
      credentialLoaded: () => {},
      signingStarted: () => holder.session?.dispatch({ type: 'signing_started' }),
      receiptUpdate: (hash, outcome) => {
        receipts.push({ hash, outcome: outcome.type });
        holder.session?.dispatch({ type: 'receipt_update', user_op_hash: hash, outcome });
      },
      alert: (kind) => alerts.push(kind),
      close: () => {},
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
      ...params,
    },
    display: { rate: 1, fiat_decimals: 2 },
  });

  return {
    session,
    dispatch: (event: SendEvent) => session.dispatch(event),
    faults,
    alerts,
    partials,
    receipts,
    latest: () => view as SendView,
  };
}

/** Boot → pick a token → fill the form → confirm. */
async function reachConfirm(token: APIToken = NATIVE, amount = '0.5') {
  const app = open();
  await settle();
  app.dispatch({ type: 'select_token', token_id: tokenId(token) });
  await settle();
  app.dispatch({ type: 'set_recipient', recipient: BOB });
  app.dispatch({ type: 'set_amount', amount });
  await settle();
  app.dispatch({ type: 'continue' });
  await settle();
  return app;
}

let sessions: { dispose: () => void }[] = [];
const track = <T extends { session: { dispose: () => void } }>(app: T): T => {
  sessions.push(app.session);
  return app;
};

beforeEach(() => {
  mockStorage.clear();
  mockStorage.set(
    'vela.accounts',
    JSON.stringify([{ id: 'cred-1', name: 'Me', address: ME, publicKeyHex: PUBKEY, createdAt: '' }]),
  );
  submits.length = 0;
  estimates.length = 0;
  haptics.length = 0;
  sessions = [];
  _resetFeeRegistry();
  estimateImpl = async () => FEE;
  submitImpl = async () => ({ userOpHash: OP_HASH, waitForTxHash: async () => TX_HASH });
  treasuryImpl = async () => ({ kind: 'unknown' });
  mockFetchTokens.mockReset();
  mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
  mockPasskeySign.mockClear();
  mockCancelSign.mockClear();
  mockClearTokenCache.mockClear();
});

afterEach(() => {
  // Disposes the loop, which aborts the 15 s pre-check timer.
  for (const session of sessions) session.dispose();
});

describe('send core (web shell)', () => {
  it('boots the token list, sorts it and lands on the amount form', async () => {
    const app = track(open());
    await settle();
    expect(app.faults).toEqual([]);
    // Non-zero balances, highest USD value first.
    expect(app.latest().tokens.map((t) => t.symbol)).toEqual(['ETH', 'USDC']);
    expect(app.latest().loading).toBe(false);

    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    expect(app.latest().stage).toBe('enter_details');
    expect(app.latest().selected_token?.symbol).toBe('USDC');
  });

  it('estimates against the REAL send shape, with the stored public key', async () => {
    const app = track(await reachConfirm(TOKEN, '25'));
    expect(app.latest().stage).toBe('confirm');
    const estimate = estimates.at(-1)!;
    expect(estimate.publicKeyHex).toBe(PUBKEY);
    expect(estimate.tier).toBe('fast');
    // An ERC-20 transfer is priced as the real calldata, not a native dummy.
    expect(estimate.tx.to.toLowerCase()).toBe(USDC.toLowerCase());
    expect(estimate.tx.data.startsWith('0xa9059cbb')).toBe(true);
    // 25 USDC at 6 decimals = 25_000_000 = 0x17d7840 — HEX, never the decimal
    // string the core states base units in.
    expect(estimate.tx.value).toBe('0x0');
    expect(estimate.tx.data.endsWith((25_000_000).toString(16).padStart(64, '0'))).toBe(true);
  });

  it('signs EXACTLY the fee the confirm screen displayed (invariant ①)', async () => {
    const app = track(await reachConfirm());
    const displayed = app.latest().fee!;
    expect(displayed.total_wei).toBe('105000');
    expect(displayed.fee_recipient).toBe(FEE_RECIPIENT);

    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(submits).toHaveLength(1);
    expect(submits[0].quotedFee).toEqual({ amount: 105_000n, recipient: FEE_RECIPIENT });
    expect(submits[0].maxFee).toBe(5n);
    expect(submits[0].publicKeyHex).toBe(PUBKEY);
  });

  it('hands the submit path HEX values, never the core decimal strings', async () => {
    const app = track(await reachConfirm(NATIVE, '0.5'));
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(submits[0].calls).toEqual([
      // 0.5 ETH = 5e17 wei. A decimal "500000000000000000" reaching
      // abiEncodeUint256Hex would move ~5.7e-4 of the intended amount.
      { to: BOB, value: '0x' + (5n * 10n ** 17n).toString(16), data: '0x' },
    ]);
  });

  it('persists every sibling in ONE write, then tracks (invariant ⑥)', async () => {
    const app = track(await reachConfirm());
    // Split the send across two recipients from the amount form.
    app.dispatch({ type: 'edit_amount' });
    await settle();
    app.dispatch({
      type: 'seed_split_recipients',
      recipients: [
        { id: '', address: BOB, amount: '0.1', name: 'Bob' },
        { id: '', address: CAROL, amount: '0.2', name: null },
      ],
    });
    await settle();
    app.dispatch({ type: 'continue' });
    await settle();
    expect(app.latest().stage).toBe('confirm');

    app.dispatch({ type: 'slide_confirm' });
    await settle();

    // One MultiSend UserOp, two activity rows sharing its hash.
    expect(submits.at(-1)!.calls).toHaveLength(2);
    const rows = await loadTransactions();
    expect(rows.map((r) => r.id).sort()).toEqual([`${OP_HASH}-0`, `${OP_HASH}-1`]);
    // The tracker's patch found BOTH of them — which is only possible because
    // TrackSubmitted was emitted after RecordsPersisted.
    expect(rows.every((r) => r.status === 'confirmed' && r.txHash === TX_HASH)).toBe(true);
    expect(app.latest().receipt?.status).toBe('confirmed');
    expect(app.latest().receipt?.kind).toBe('split');
    expect(app.latest().receipt?.transfers).toHaveLength(2);
    expect(haptics).toContain('success');
    expect(mockClearTokenCache).toHaveBeenCalledWith(ME);
  });

  it('never advances to confirm on a failed estimate (invariant ②)', async () => {
    estimateImpl = async () => {
      throw new Error('bundler unreachable');
    };
    const app = track(await reachConfirm());
    expect(app.latest().stage).toBe('enter_details');
    expect(app.latest().estimating_gas).toBe(false);
    expect(app.alerts.at(-1)).toEqual({ type: 'estimate_failed', kind: 'estimate_failed' });
    expect(submits).toHaveLength(0);
  });

  it('stops before the passkey when the float fell below its floor (invariant ⑭)', async () => {
    const app = track(await reachConfirm());
    // The preflight passed; the float drops in the window before signing.
    treasuryImpl = async () => ({
      kind: 'low-float',
      status: {
        chainId: CHAIN,
        address: FEE_RECIPIENT,
        asset: 'native',
        balance: 1n,
        floor: 9n,
        bootstrapNeeded: true,
      },
    });
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(submits).toHaveLength(0);
    expect(mockPasskeySign).not.toHaveBeenCalled();
    expect(app.latest().treasury_bootstrap?.address).toBe(FEE_RECIPIENT);
    expect(app.latest().tx_status).toBe('idle');
    // The lock was released, so a retry is not a silent no-op (issue #91).
    expect(app.latest().sending).toBe(false);
  });

  it('classifies a passkey cancel as no error at all', async () => {
    submitImpl = async () => {
      const error: Error & { code?: string } = new Error('cancelled');
      error.code = 'PASSKEY_CANCELLED';
      throw error;
    };
    const app = track(await reachConfirm());
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(app.latest().tx_status).toBe('idle');
    expect(app.latest().tx_error).toBeNull();
    expect(haptics).not.toContain('error');
  });

  it('routes an underfunded bundler to the error key, not the personal top-up', async () => {
    submitImpl = async () => {
      throw new Error('dedicated bundler gas account is underfunded. Deposit to: 0xdead');
    };
    treasuryImpl = async () => ({ kind: 'covered' });
    const app = track(await reachConfirm());
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(app.latest().tx_status).toBe('error');
    expect(app.latest().tx_error).toBe('bundler_fund');
    expect(haptics).toContain('error');
  });

  it('reports a raw library exception as the calm generic key (invariant ⑮)', async () => {
    submitImpl = async () => {
      throw new Error('AA21 didnt pay prefund / execution reverted at 0x…');
    };
    const app = track(await reachConfirm());
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(app.latest().tx_error).toBe('generic');
    // The wording never reaches the view.
    expect(JSON.stringify(app.latest())).not.toContain('AA21');
  });

  it('moves through preparing → signing while the passkey sheet is up', async () => {
    const app = track(await reachConfirm());
    expect(app.latest().tx_status).toBe('idle');
    let statusDuringSign: string | undefined;
    submitImpl = async (_args, signFn) => {
      // The sheet opening is a fact the core must hear mid-`SubmitUserOp`.
      await signFn(new Uint8Array([1, 2, 3]));
      statusDuringSign = app.latest().tx_status;
      return { userOpHash: OP_HASH, waitForTxHash: async () => TX_HASH };
    };
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(mockPasskeySign).toHaveBeenCalledWith(expect.any(String), 'cred-1');
    expect(statusDuringSign).toBe('signing');
    expect(app.latest().tx_status).toBe('confirmed');
  });

  it('leaves a submitted payment submitted when the receipt poll times out (invariant ⑤)', async () => {
    submitImpl = async () => ({
      userOpHash: OP_HASH,
      waitForTxHash: async () => {
        throw new Error('timed out waiting for receipt');
      },
    });
    const app = track(await reachConfirm());
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    expect(app.latest().receipt?.status).toBe('submitted');
    expect((await loadTransactions())[0].status).toBe('pending');
  });

  it('stamps the receipt failed on a definitive drop, and holds on a fee hold', async () => {
    submitImpl = async () => ({
      userOpHash: OP_HASH,
      waitForTxHash: async () => {
        throw new Error('the operation was dropped from the network');
      },
    });
    const dropped = track(await reachConfirm());
    dropped.dispatch({ type: 'slide_confirm' });
    await settle();
    expect(dropped.latest().receipt?.status).toBe('failed');
    expect((await loadTransactions())[0].status).toBe('failed');

    // Only the ledger — the seeded account must survive, or the next send has
    // no public key and never reaches the bundler at all.
    mockStorage.delete('vela.transactionHistory');
    submits.length = 0;
    submitImpl = async () => ({
      userOpHash: OP_HASH,
      waitForTxHash: async () => {
        throw new FakeFeeHoldError('parked');
      },
    });
    const held = track(await reachConfirm());
    held.dispatch({ type: 'slide_confirm' });
    await settle();
    // Waiting, not failure: the op is still queued (invariant ⑦).
    expect(held.latest().receipt?.status).toBe('submitted');
    expect(held.latest().receipt?.hold_reason).toBe('fee_hold');
  });

  it('restores an EIP-681 amount with the token REAL decimals (invariant ⑫)', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE]); // the token is not held
    mockResolveMeta.mockImplementation(
      async () => new Map([[USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }]]),
    );
    const app = track(
      open({
        locked: true,
        prefilled_recipient: BOB,
        prefilled_chain_id: String(CHAIN),
        prefilled_token_address: USDC,
        prefilled_amount_base: '2500000',
      }),
    );
    await settle();

    expect(app.latest().lock_error).toBeNull();
    expect(app.latest().selected_token?.decimals).toBe(6);
    // 2_500_000 base units at the RESOLVED 6 decimals is 2.5 — reading the link
    // as 18-decimals would have shown 0.0000000000025.
    expect(app.latest().amount).toBe('2.5');
    expect(app.latest().amount_locked).toBe(true);
    expect(app.latest().recipient).toBe(BOB);
  });

  it('surfaces the unknown-token exception when metadata cannot be resolved', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE]);
    mockResolveMeta.mockImplementation(async () => new Map());
    const app = track(
      open({
        locked: true,
        prefilled_recipient: BOB,
        prefilled_chain_id: String(CHAIN),
        prefilled_token_address: USDC,
      }),
    );
    await settle();

    expect(app.latest().lock_error).toEqual({ type: 'token' });
    expect(app.latest().stage).toBe('lock_error');
  });

  it('offers to add an unsupported network instead of failing closed', async () => {
    const app = track(
      open({ locked: true, prefilled_recipient: BOB, prefilled_chain_id: '123456' }),
    );
    await settle();
    expect(app.latest().lock_error).toEqual({ type: 'network', chain_id: 123456 });

    app.dispatch({ type: 'add_network_tapped', chain_id: 123456 });
    await settle();
    expect(app.latest().adding_network).toBe(false);
    expect(app.latest().add_network_msg).toEqual({ type: 'net_not_found' });
  });

  it('cancels the passkey and releases the lock on the confirm ✕', async () => {
    // A submit that never settles: the flow is parked in `submitting`.
    submitImpl = async (_args, signFn) => {
      await signFn(new Uint8Array([1]));
      return new Promise(() => {}) as never;
    };
    const app = track(await reachConfirm());
    app.dispatch({ type: 'slide_confirm' });
    await settle();
    expect(app.latest().tx_status).toBe('signing');

    app.dispatch({ type: 'cancel_signing' });
    await settle();

    expect(mockCancelSign).toHaveBeenCalled();
    expect(app.latest().tx_status).toBe('idle');
    expect(app.latest().sending).toBe(false);
  });

  it('feeds the amount form progressive chunks without letting them decide a lock', async () => {
    mockFetchTokens.mockImplementation(async (_address, options) => {
      options?.onProgress?.([NATIVE]);
      await new Promise<void>((r) => setTimeout(r, 0));
      return [NATIVE, TOKEN];
    });
    const app = track(open());
    await settle();
    expect(app.partials).toEqual([1]);
    expect(app.latest().tokens.map((t) => t.symbol)).toEqual(['ETH', 'USDC']);
  });

  it('refuses a second slide while one is in flight (invariant ④)', async () => {
    submitImpl = async () => new Promise(() => {}) as never;
    const app = track(await reachConfirm());
    app.dispatch({ type: 'slide_confirm' });
    app.dispatch({ type: 'slide_confirm' });
    await settle();
    expect(submits).toHaveLength(1);
    expect(app.latest().sending).toBe(true);
  });
});
