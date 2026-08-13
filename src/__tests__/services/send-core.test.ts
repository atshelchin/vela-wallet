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
/**
 * What `EstimateFee` asks the shell for.
 *
 * This is the `feeQuote` PORT, not `estimateTransactionFee`: on web the
 * operation is answered by the screen's live `fee_policy` session, so the port
 * is the real production seam and the right place to observe the request from.
 * `tier` is no longer visible here — it is stated once, for both fee surfaces,
 * where the `QuoteRequested` that carries it is built — and `value` crosses as
 * the decimal base-unit string the core states, not as hex (the hex codec moved
 * with the estimate, into `fee-executor.web.ts`).
 */
type EstimateArgs = {
  chainId: number;
  account: string;
  calls: { to: string; value: string; data: string }[];
  feeToken: string | null;
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
import '@/services/vela-core';
import { networkId } from '@/models/network';
import { tokenId, type APIToken } from '@/models/types';
import { loadTransactions } from '@/services/storage';
import { createSendSession } from '@/services/wallet-state-core/send-session.web';
import { _resetFeeRegistry, rememberFee } from '@/services/wallet-state-core/send-types';
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
      feeQuote: async (request) => {
        estimates.push(request);
        try {
          return { type: 'ok' as const, estimate: rememberFee(await estimateImpl(request)) };
        } catch {
          // The live session answers a refusal as a typed variant, never a
          // rejection — the shared effect loop's contract.
          return { type: 'failed' as const, kind: 'estimate_failed' as const };
        }
      },
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
    display: { code: 'USD', rate: 1, fiat_decimals: 2 },
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
    // The key that builds the initCode rides on the REQUEST, so it belongs to
    // the account this quote is for — not to a session-level mirror.
    expect(estimate.publicKeyHex).toBe(PUBKEY);
    // An ERC-20 transfer is priced as the real calldata, not a native dummy.
    expect(estimate.calls).toHaveLength(1);
    expect(estimate.calls[0].to.toLowerCase()).toBe(USDC.toLowerCase());
    expect(estimate.calls[0].data.startsWith('0xa9059cbb')).toBe(true);
    // Base units as the DECIMAL string the core states them in; the hex codec
    // the MultiSend builder needs lives past this seam, in the fee executor.
    expect(estimate.calls[0].value).toBe('0');
    expect(estimate.calls[0].data.endsWith((25_000_000).toString(16).padStart(64, '0'))).toBe(true);
    // The fee leg is NOT here: `fee_policy` appends its own, to the recipient
    // its own quote named, so the simulated op is the submitted one.
    expect(estimate.calls.some((call) => call.to === FEE_RECIPIENT)).toBe(false);
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

  /**
   * The ⇄ toggle, through the REAL core, on the web shell — the twin of
   * `app_send.rs::leaving_fiat_mode_with_no_rate_drops_the_figure_instead_of_relabelling_it`.
   *
   * The defect had no arithmetic in it: the conversion was skipped (no rate),
   * the digits were kept, and only the unit LABEL changed. 5000 CNY became
   * 5000 USDC with the confirm slider armed. Relabelling a unit and multiplying
   * by 1 are the same operation, which is why four rounds of `?? 1` guards did
   * not catch it.
   *
   * Mutation proof (rebuild the wasm — jest loads the prebuilt artifact):
   * make `toggle_fiat_input`'s failed `convert` keep `model.amount`'s digits
   * and `amount` becomes "5000" with `token_amount: "5000"` — 5000 whole USDC,
   * signable, on a `can_continue: true` form.
   */
  it('never carries a fiat figure out of fiat mode when nothing can price it', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'set_recipient', recipient: BOB });

    // A priced CNY: the door opens and 5000 CNY is a real, resolvable figure.
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: 7.17, fiat_decimals: 2 } });
    app.dispatch({ type: 'toggle_fiat_input' });
    app.dispatch({ type: 'set_amount', amount: '5000' });
    await settle();
    expect(app.latest().amount_fiat_code).toBe('CNY');
    expect(app.latest().token_amount).toBe('697.35007');

    // CNY goes unpriceable mid-screen — nothing converts (already guarded).
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: null, fiat_decimals: 2 } });
    await settle();
    expect(app.latest().token_amount).toBe('0');

    // Leaving is still allowed (never trap someone in an unresolvable mode),
    // but the CNY digits do NOT come along wearing a USDC label.
    app.dispatch({ type: 'toggle_fiat_input' });
    await settle();
    const view = app.latest();
    expect(view.amount_fiat_code).toBeNull();
    expect(view.amount).toBe('');
    expect(view.token_amount).toBe('');
    expect(view.can_continue).toBe(false);
  });

  /**
   * The other road to the same overpayment: the figure is fine, the RATE
   * belongs to another currency. `display_changed` swaps the whole context in
   * one event, so "5000" typed in CNY can end up beside a USD rate.
   *
   * Two things are pinned. The figure is not converted at the wrong rate — and
   * the mismatch does not OUTLIVE the event either, because a screen the user
   * cannot type their way out of is the same bug wearing a different hat:
   * `with_value` keeps the unit, so a stranded CNY figure meant every
   * subsequent keystroke also resolved to "0", for ever, with `Continue`
   * refusing each one and nothing on screen saying why.
   *
   * Mutation proof: drop the `p.code() == code` filter in
   * `DenominatedAmount::to_token_units` (and rebuild the wasm) and
   * `token_amount` becomes "5000"; delete `redenominate_to_display` and the
   * recovery block at the bottom goes back to "0".
   */
  it('will not resolve a CNY figure at a USD rate, and lets the user recover', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: 7.17, fiat_decimals: 2 } });
    app.dispatch({ type: 'toggle_fiat_input' });
    app.dispatch({ type: 'set_amount', amount: '5000' });
    await settle();
    expect(app.latest().token_amount).toBe('697.35007');

    app.dispatch({ type: 'display_changed', display: { code: 'USD', rate: 1, fiat_decimals: 2 } });
    await settle();
    // Still fiat — the MODE is the user's choice — but denominated in the
    // currency now on screen, and the CNY digits did not come with it.
    expect(app.latest().amount_fiat_code).toBe('USD');
    expect(app.latest().amount).toBe('');
    expect(app.latest().token_amount).toBe('0');
    expect(app.latest().can_continue).toBe(false);

    // And typing again works, at the rate now on screen. This is the recovery
    // that did not exist: the figure used to keep its CNY unit through every
    // `set_amount`, so nothing the user typed could ever resolve.
    app.dispatch({ type: 'set_recipient', recipient: BOB });
    app.dispatch({ type: 'set_amount', amount: '4999' });
    await settle();
    expect(app.latest().amount_fiat_code).toBe('USD');
    expect(app.latest().token_amount).toBe('4999');
    expect(app.latest().can_continue).toBe(true);
  });

  /**
   * `can_continue` used to ask only `!amount.is_empty()`, so the button lit up
   * on a figure that could never become base units — press it and the machine
   * answered `InvalidAmount`, every time, with no explanation anywhere on the
   * screen. The gate now asks the string the signature is built from, and the
   * screen says which factor is missing.
   *
   * Mutation proof: restore `!model.amount.is_empty()` as the whole gate (and
   * rebuild the wasm) and `can_continue` goes true on an amount worth nothing.
   */
  it('refuses Continue on an unresolvable figure, and says why', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'set_recipient', recipient: BOB });
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: 7.17, fiat_decimals: 2 } });
    app.dispatch({ type: 'toggle_fiat_input' });
    app.dispatch({ type: 'set_amount', amount: '5000' });
    await settle();
    expect(app.latest().can_continue).toBe(true);
    expect(app.latest().amount_warning?.type).not.toBe('cannot_convert');

    // The rate for the currency already on screen goes away.
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: null, fiat_decimals: 2 } });
    await settle();
    const view = app.latest();
    expect(view.amount).toBe('5000');
    expect(view.token_amount).toBe('0');
    expect(view.can_continue).toBe(false);
    expect(view.amount_warning).toEqual({ type: 'cannot_convert', code: 'CNY', symbol: TOKEN.symbol });
    // The way out is on screen and pressable — an unpriced currency must not
    // take the exit with it.
    expect(view.denom_toggle_shown).toBe(true);
    expect(view.denom_toggle_enabled).toBe(true);
  });

  /**
   * ⇄ used to be rendered on `priceUsd > 0` alone while the core refused to
   * enter fiat without a rate for the display currency: the control looked
   * live and swallowed the tap. Nothing happened, and nothing said so.
   *
   * Mutation proof: make `denom_toggle` return `true` unconditionally (and
   * rebuild the wasm) and the screen goes back to offering a control that
   * cannot act.
   */
  it('disables ⇄ instead of silently ignoring it', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'set_amount', amount: '1' });
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: null, fiat_decimals: 2 } });
    await settle();
    expect(app.latest().denom_toggle_shown).toBe(true);
    expect(app.latest().denom_toggle_enabled).toBe(false);

    // And the refusal is real: pressing it changes nothing.
    app.dispatch({ type: 'toggle_fiat_input' });
    await settle();
    expect(app.latest().amount_fiat_code).toBeNull();
    expect(app.latest().amount).toBe('1');
  });

  /**
   * A receipt is about a signature, not about today's rate.
   *
   * `receipt_view` used to ask `resolve_token_amount` for its headline figure,
   * re-running the fiat↔token conversion against the CURRENT display context —
   * a live computation about a fact that stopped being live when the calldata
   * was signed. Move the display currency after the payment and the token
   * amount on a completed transfer moved with it, down to `0` once the rate was
   * gone. This is the same repro that produced the calldata below.
   *
   * Mutation proof: put `model_token_amount(model, token)` back in
   * `receipt_view` (and rebuild the wasm) and the post-payment amount reads
   * `"0"` under the unpriced currency and `"5000"` — the raw CNY digits wearing
   * a USDC label — under a USD rate.
   */
  it('reports the amount that was signed, whatever the currency does next', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'set_recipient', recipient: BOB });
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: 7.17, fiat_decimals: 2 } });
    app.dispatch({ type: 'toggle_fiat_input' });
    app.dispatch({ type: 'set_amount', amount: '500' });
    await settle();
    expect(app.latest().token_amount).toBe('69.735007');

    app.dispatch({ type: 'continue' });
    await settle();
    app.dispatch({ type: 'slide_confirm' });
    await settle();

    // 69_735_007 base units of a 6-decimal token — what the passkey signed.
    expect(submits[0].calls[0].data.endsWith('0428125f')).toBe(true);
    expect(app.latest().receipt?.amount).toBe('69.735007');
    expect(app.latest().receipt?.usd_value).toBeCloseTo(69.735007, 9);

    // The rate vanishes AFTER the payment.
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: null, fiat_decimals: 2 } });
    await settle();
    expect(app.latest().receipt?.amount).toBe('69.735007');
    expect(app.latest().receipt?.usd_value).toBeCloseTo(69.735007, 9);

    // …and neither does a different currency with a perfectly good rate.
    app.dispatch({ type: 'display_changed', display: { code: 'USD', rate: 1, fiat_decimals: 2 } });
    await settle();
    expect(app.latest().receipt?.amount).toBe('69.735007');
  });

  /**
   * `can_confirm` never looked at the amount — it asked only about the fee and
   * the pipeline, so the money was checked once by `Continue` and never again.
   * A `display_changed` landing under an open confirm page re-denominates the
   * field to empty, and the slide stayed armed over nothing at all.
   *
   * Mutation proof: drop `&& confirm_amount_ok` from `can_confirm` (and rebuild
   * the wasm) and `can_confirm` stays true on a `token_amount` of `"0"`.
   */
  it('disarms the confirm slide when the amount stops resolving, and says why', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'set_recipient', recipient: BOB });
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: 7.17, fiat_decimals: 2 } });
    app.dispatch({ type: 'toggle_fiat_input' });
    app.dispatch({ type: 'set_amount', amount: '500' });
    await settle();
    app.dispatch({ type: 'continue' });
    await settle();
    expect(app.latest().stage).toBe('confirm');
    expect(app.latest().can_confirm).toBe(true);
    expect(app.latest().confirm_amount_issue).toBeNull();

    // The display currency commits to USD while the review page is open.
    app.dispatch({ type: 'display_changed', display: { code: 'USD', rate: 1, fiat_decimals: 2 } });
    await settle();
    const view = app.latest();
    expect(view.stage).toBe('confirm');
    expect(view.amount).toBe('');
    expect(view.token_amount).toBe('0');
    expect(view.can_confirm).toBe(false);
    expect(view.confirm_amount_issue).toEqual({ code: 'USD', symbol: TOKEN.symbol });

    // And the machine does not depend on the shell honouring `can_confirm`: a
    // slide that arrives anyway signs nothing. `toBaseUnits('0', 6)` is a
    // perfectly valid 0n, so without the guard the submit path would have
    // encoded a zero-value transfer and asked for a passkey over it.
    app.dispatch({ type: 'slide_confirm' });
    await settle();
    expect(submits).toHaveLength(0);
    expect(mockPasskeySign).not.toHaveBeenCalled();
    expect(app.latest().stage).toBe('enter_details');
  });

  /**
   * The previous round made the ⇄ refusal visible (the row dims). This is the
   * half that was still missing: WHY. It is also the one branch
   * `amount_warning` cannot reach — the figure is in token units, so it
   * resolves perfectly and nothing else on the screen has anything to say.
   *
   * Mutation proof: return `None` unconditionally for `denom_toggle_reason`
   * (and rebuild the wasm) and the dimmed row goes back to explaining nothing.
   */
  it('says why ⇄ is disabled, not just that it is', async () => {
    mockFetchTokens.mockImplementation(async () => [NATIVE, TOKEN]);
    const app = track(open());
    await settle();
    app.dispatch({ type: 'select_token', token_id: tokenId(TOKEN) });
    await settle();
    app.dispatch({ type: 'set_amount', amount: '10' });
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: null, fiat_decimals: 2 } });
    await settle();
    const view = app.latest();
    expect(view.denom_toggle_shown).toBe(true);
    expect(view.denom_toggle_enabled).toBe(false);
    // The token figure resolves fine, so no other surface speaks…
    expect(view.token_amount).toBe('10');
    expect(view.amount_warning).toBeNull();
    // …which is why the row has to.
    expect(view.denom_toggle_reason).toEqual({ code: 'CNY', symbol: TOKEN.symbol });

    // And when the row works again it goes quiet.
    app.dispatch({ type: 'display_changed', display: { code: 'CNY', rate: 7.17, fiat_decimals: 2 } });
    await settle();
    expect(app.latest().denom_toggle_enabled).toBe(true);
    expect(app.latest().denom_toggle_reason).toBeNull();
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
