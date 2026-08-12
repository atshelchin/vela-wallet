// The `sign_request` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules — single-flight, the settled-rid registry, the
// commitment point, the funding pin — are covered by the Rust suite. What only
// exists on THIS side is the executor, and every one of its jobs is a fund-safety
// job:
//
//   - **The wire codec.** Every amount crosses as a decimal string: a lost or
//     truncated `bundlerCostWei` / `thresholdWei` prices the funding prompt
//     wrong, and a lost `maxFeePerGas` submits at a fee the user never saw.
//   - **The response routing table.** The core answers by `transport_id`; if the
//     shell resolves it to the wrong instance an extension signature is
//     delivered over a concurrent WalletPair socket (F2).
//   - **The record codec + Persist/Update serialisation.** `updateTransaction`
//     on a row that has not been written yet is a SILENT no-op — a confirmed op
//     stranded as forever-'pending'.
//   - **The failure classification.** The core only ever sees typed variants;
//     `PasskeyErrorCode.CANCELLED` and `parseBundlerUnderfunded` are matched
//     here, and mistaking a passkey cancel for a failure would send the dApp an
//     error for a request the user merely postponed.
//   - **§12.1.6.** The granted-account switch must be issued in the SESSION's
//     index domain and acked before the approval surface can act.
//
// So all of them are asserted against the real core, over the real executor,
// with the real `services/storage.ts` on a mocked key-value store.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// The passkey ceremony's error vocabulary — the only thing the executor reads
// from a module that otherwise reaches native code.
jest.mock('@/modules/passkey', () => ({
  PasskeyErrorCode: { CANCELLED: 'PASSKEY_CANCELLED', FAILED: 'PASSKEY_FAILED' },
}));

// Chain display facts. `dapp-history.ts` asks for the native symbol when it
// builds a tx record; nothing here asserts on it.
jest.mock('@/models/network', () => ({
  nativeSymbol: (chainId: number) => (chainId === 100 ? 'xDAI' : 'ETH'),
  getAllNetworksSync: () => [{ chainId: 100 }, { chainId: 1 }],
}));

// The sign-time simulation blob is presentation only — the executor forwards it
// to the record and never interprets it.
jest.mock('@/services/tx-simulation', () => ({
  serializeAssetSim: (sim: unknown) => sim,
}));

// The detached "list what this tx delivered" tail (`token-autoadd`), and the
// receipt read it is driven from.
const mockAutoAdd = jest.fn(async () => 0);
jest.mock('@/services/token-autoadd', () => ({
  autoAddReceivedTokens: (...args: unknown[]) => mockAutoAdd(...(args as [])),
}));
jest.mock('@/services/rpc-adapter', () => ({
  rpcCall: jest.fn(async () => ({ result: null })),
}));

// The bundler. Every amount that crosses the JSON boundary starts and ends here
// as a bigint, which is what makes the codec observable.
const mockCheckFunding = jest.fn<Promise<any>, [number, string, bigint | undefined]>(
  async () => null,
);
const mockSponsor = jest.fn<Promise<any>, [any, any]>(async () => ({ outcome: 'funded', sponsored: false }));
const mockClearCache = jest.fn();
const mockAccountInfo = jest.fn<Promise<any>, [number, string]>(async () => null);
jest.mock('@/services/bundler-service', () => ({
  checkBundlerFunding: (chainId: number, safe: string, cost?: bigint) =>
    mockCheckFunding(chainId, safe, cost),
  attemptSilentSponsorship: (funding: any, opts: any) => mockSponsor(funding, opts),
  clearBundlerCache: (...args: unknown[]) => mockClearCache(...(args as [])),
  fetchBundlerAccountInfo: (chainId: number, safe: string) => mockAccountInfo(chainId, safe),
  parseBundlerUnderfunded: (msg: string) =>
    /Deposit to:/i.test(msg)
      ? { depositAddress: '0xdead000000000000000000000000000000000000', requiredWei: 7n, spendableWei: 2n }
      : null,
  recommendedFundingWei: (threshold: bigint, current: bigint) => threshold - current,
  underfundedRequiredWei: (u: { requiredWei?: bigint }) => u.requiredWei ?? null,
  formatWei: (wei: bigint) => `${wei.toString()} wei`,
}));

// The passkey + build + submit pipeline. The single I/O call the whole machine
// exists to sequence.
type SubmitArgs = {
  request: { id: string; method: string; params: any[] };
  address: string;
  chainId: number;
  maxFee: bigint | undefined;
  gasFeeToken: string | null | undefined;
  quotedFee: { amount: bigint; recipient: string } | undefined;
  credentialId: string;
};
const submits: SubmitArgs[] = [];
let submitImpl: (args: SubmitArgs, onSubmitted: (hash: string) => void) => Promise<any> =
  async () => '0xsig';
jest.mock('@/hooks/use-dapp-signing', () => ({
  handleDAppRequest: (
    request: any, account: any, safeAddress: string, chainId: number,
    maxFee?: bigint, onSubmitted?: (h: string) => void,
    gasFeeToken?: string | null, quotedFee?: any,
  ) => {
    const args: SubmitArgs = {
      request, address: safeAddress, chainId, maxFee, gasFeeToken, quotedFee,
      credentialId: account.id,
    };
    submits.push(args);
    return submitImpl(args, onSubmitted ?? (() => {}));
  },
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized. Importing the web entry by explicit
// path first runs `initSync` on the planted bytes.
import '@/services/vela-core/index.web';
import { createSignRequestSession } from '@/services/wallet-state-core/sign-session.web';
import { loadTransactions, type LocalTransaction } from '@/services/storage';
import type { DAppTransport } from '@/services/dapp-transport';
import type { SignEvent } from '@/services/wallet-state-core/generated/SignEvent';
import type { SignView } from '@/services/wallet-state-core/generated/SignView';
import type { SignShellPorts } from '@/services/wallet-state-core/sign-types';

const NOW = 1_770_000_000_000;
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const ACCOUNTS = [
  { address: ALICE, credential_id: 'cred-alice' },
  { address: BOB, credential_id: 'cred-bob' },
];

const INITIAL_VIEW: SignView = {
  surface: 'hidden', request: null, is_signing: false, is_submitting: false,
  pending_op_hash: null, error: null, funding: null, confirm_gate_open: false,
  reconcile_pending: false, swipe_action: 'none', tracker_handoff: null,
  notice: null, global_chain_id: 1,
};

/** Let the effect loop's round trips settle. */
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

interface Answer {
  id: string;
  result?: any;
  error?: { code: number; message: string };
  /** The transaction store AT THE MOMENT the dApp was answered (§4). */
  storeAtAnswer: LocalTransaction[];
}

function fakeTransport(answers: Answer[]): DAppTransport {
  return {
    name: 'fake',
    connected: true,
    connect: async () => {},
    disconnect: () => {},
    sendResponse: (id: string, result?: any, error?: { code: number; message: string }) => {
      let store: LocalTransaction[] = [];
      try {
        store = JSON.parse(mockStorage.get('vela.transactionHistory') ?? '[]');
      } catch { /* unreadable */ }
      answers.push({ id, result, error, storeAtAnswer: store });
    },
    pushWalletInfo: () => {},
    fetchDAppInfo: async () => null,
    on: () => () => {},
  } as unknown as DAppTransport;
}

function open(overrides?: Partial<SignShellPorts>) {
  const faults: unknown[] = [];
  const answers: Answer[] = [];
  const switches: number[] = [];
  const transports = new Map<string, DAppTransport>();
  transports.set('t1', fakeTransport(answers));
  transports.set('t2', fakeTransport(answers));
  let view: SignView = INITIAL_VIEW;
  const holder: { session: ReturnType<typeof createSignRequestSession> | null } = { session: null };

  const session = createSignRequestSession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
    ports: {
      transportFor: (id) => transports.get(id) ?? null,
      opSubmitted: (id, hash) => {
        holder.session?.dispatch({ type: 'op_submitted', id, user_op_hash: hash, now_ms: NOW });
      },
      assetSim: () => null,
      switchActiveAccount: async (index) => {
        switches.push(index);
        await new Promise<void>((r) => setTimeout(r, 0));
      },
      ...overrides,
    },
  });
  holder.session = session;
  session.start({ type: 'networks_changed', chain_ids: [100, 1] });
  session.dispatch({ type: 'accounts_changed', accounts: ACCOUNTS, active_index: 0 });

  const dispatch = (event: SignEvent) => session.dispatch(event);
  return {
    session, dispatch, faults, answers, switches, transports,
    latest: () => view,
    answersFor: (id: string) => answers.filter((a) => a.id === id),
  };
}

function arrival(over: Partial<Extract<SignEvent, { type: 'request_arrived' }>> = {}): SignEvent {
  return {
    type: 'request_arrived',
    id: 'req-1',
    method: 'personal_sign',
    params_json: JSON.stringify(['0x68690a', ALICE]),
    origin: 'https://dapp.example',
    transport_id: 't1',
    dedicated_transport: true,
    per_request_chain: null,
    dapp: { name: 'Example', url: 'https://dapp.example' },
    granted_address: null,
    requested_address: null,
    request_ts_ms: null,
    now_ms: NOW,
    ...over,
  };
}

const APPROVE_TX = {
  type: 'approve_tapped' as const,
  opts: {
    max_fee_per_gas: '1500000000',
    bundler_cost_wei: '420000000000000',
    gas_fee_token: null,
    quoted_fee: null,
    fee_collector: null,
    params_override_json: null,
    intent: null,
  },
};

const TX_PARAMS = JSON.stringify([{ from: ALICE, to: BOB, value: '0x5af3107a4000' }]);

beforeEach(() => {
  mockStorage.clear();
  submits.length = 0;
  submitImpl = async () => '0xsig';
  mockCheckFunding.mockReset();
  mockCheckFunding.mockResolvedValue(null);
  mockSponsor.mockReset();
  mockSponsor.mockResolvedValue({ outcome: 'funded', sponsored: false });
  mockClearCache.mockReset();
  mockAccountInfo.mockReset();
  mockAccountInfo.mockResolvedValue(null);
  mockAutoAdd.mockClear();
});

describe('sign_request core (web shell)', () => {
  test('a signature is recorded BEFORE the dApp is answered, and signs the capped params', async () => {
    const h = open();
    h.dispatch(arrival());
    await settle();
    expect(h.latest().surface).toBe('sheet');
    expect(h.latest().confirm_gate_open).toBe(true);

    // The sheet re-encoded the payload (the never-unlimited editor's shape):
    // sign/submit/record THESE, never the original (invariant ⑨).
    const capped = JSON.stringify(['0x6361707065640a', ALICE]);
    h.dispatch({ ...APPROVE_TX, opts: { ...APPROVE_TX.opts, params_override_json: capped, intent: 'Sign in' } });
    await settle();

    expect(submits).toHaveLength(1);
    expect(JSON.stringify(submits[0].request.params)).toBe(capped);
    expect(submits[0].credentialId).toBe('cred-alice');
    expect(submits[0].address).toBe(ALICE);
    // Decimal-string codec: the fee the sheet quoted is the fee that is signed.
    expect(submits[0].maxFee).toBe(1_500_000_000n);

    const answered = h.answersFor('req-1');
    expect(answered).toHaveLength(1);
    expect(answered[0].result).toBe('0xsig');
    // §4: the durable, app-owned record precedes the result the dApp polls.
    expect(answered[0].storeAtAnswer).toHaveLength(1);
    expect(answered[0].storeAtAnswer[0].type).toBe('sign_message');
    expect(answered[0].storeAtAnswer[0].intent).toBe('Sign in');
    expect(h.latest().surface).toBe('hidden');
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a transaction is recorded pending at submit and patched confirmed IN PLACE', async () => {
    submitImpl = async (_args, onSubmitted) => {
      onSubmitted('0xopHash');
      await new Promise<void>((r) => setTimeout(r, 0));
      return '0xtxHash';
    };
    const h = open();
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS, per_request_chain: 100 }));
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();

    const rows = await loadTransactions();
    // One record, never two: the pending row is patched by id.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(`dapp-${NOW}-tx`);
    expect(rows[0].status).toBe('confirmed');
    expect(rows[0].txHash).toBe('0xtxHash');
    expect(rows[0].userOpHash).toBe('0xopHash');
    expect(rows[0].chainId).toBe(100);
    // The row existed — as 'pending' — before the dApp heard anything.
    const answered = h.answersFor('req-1');
    expect(answered).toHaveLength(1);
    expect(answered[0].storeAtAnswer[0].status).toBe('pending');
    // The tracker handoff the (unwired) tx_tracker will be fed from.
    expect(h.latest().tracker_handoff).toEqual({
      user_op_hash: '0xopHash', record_ids: [`dapp-${NOW}-tx`], chain_id: 100,
    });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('BUG-2: a reject during the gas pre-check answers 4001 and never submits', async () => {
    let releasePrecheck: (value: null) => void = () => {};
    mockCheckFunding.mockImplementation(
      () => new Promise((resolve) => { releasePrecheck = resolve; }),
    );
    const h = open();
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS }));
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();
    expect(h.latest().is_signing).toBe(true);
    expect(submits).toHaveLength(0);

    // The user swipes the sheet away while the ≤15 s pre-check is still out.
    h.dispatch({ type: 'reject_tapped' });
    await settle();
    expect(h.answersFor('req-1')).toEqual([
      expect.objectContaining({ error: { code: 4001, message: 'User rejected' } }),
    ]);

    // …and the pre-check answers afterwards. It must not resurrect the pipeline.
    releasePrecheck(null);
    await settle();
    expect(submits).toHaveLength(0);
    expect(h.answersFor('req-1')).toHaveLength(1);
    expect(await loadTransactions()).toEqual([]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('BUG-3: two approve taps in the same tick produce ONE submit', async () => {
    const h = open();
    h.dispatch(arrival());
    await settle();
    h.dispatch(APPROVE_TX);
    h.dispatch(APPROVE_TX);
    await settle();
    expect(submits).toHaveLength(1);
    expect(h.answersFor('req-1')).toHaveLength(1);
    h.session.dispose();
  });

  test('F2: the answer goes to the transport that OWNS the request', async () => {
    const h = open();
    // A WalletPair session (t1) is live; an extension sign (t2) arrives on top.
    h.dispatch(arrival({ id: 'wp-1', transport_id: 't1' }));
    await settle();
    h.dispatch(arrival({ id: 'ext-1', transport_id: 't2', per_request_chain: 100 }));
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();

    const t2 = h.transports.get('t2')!;
    // The one answer went out, and it went out on t2 — the extension's own
    // transport — never over t1's socket.
    expect(h.answersFor('ext-1')).toHaveLength(1);
    expect(h.answersFor('wp-1')).toHaveLength(0);
    expect(t2).toBeDefined();
    expect(submits[0].chainId).toBe(100); // F4: the request's OWN chain
    h.session.dispose();
  });

  test('the funding round trip keeps every amount exact, and Continue replays the capped opts', async () => {
    mockCheckFunding.mockResolvedValue({
      depositAddress: '0xdep0000000000000000000000000000000000000',
      safeAddress: ALICE,
      chainId: 100,
      nativeSym: 'xDAI',
      thresholdWei: 123_456_789_012_345_678_901n,
      recommendedWei: 987_654_321_098_765_432_109n,
      currentBalance: 5n,
      recommendedFormatted: '',
      currentFormatted: '',
    });
    mockSponsor.mockResolvedValue({ outcome: 'denied', denialReason: 'not eligible' });

    const h = open();
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS, per_request_chain: 100 }));
    await settle();
    const capped = JSON.stringify([{ from: ALICE, to: BOB, value: '0x1' }]);
    h.dispatch({ ...APPROVE_TX, opts: { ...APPROVE_TX.opts, params_override_json: capped } });
    await settle();

    // The pre-check saw the raw bundler cost as a bigint, not a truncated number.
    expect(mockCheckFunding.mock.calls[0][2]).toBe(420_000_000_000_000n);
    // …and the sponsorship attempt got the SAME amounts back out of the core.
    expect(mockSponsor.mock.calls[0][0]).toMatchObject({
      thresholdWei: 123_456_789_012_345_678_901n,
      recommendedWei: 987_654_321_098_765_432_109n,
      currentBalance: 5n,
    });
    expect(h.latest().surface).toBe('funding');
    expect(h.latest().funding).toMatchObject({
      presentation: 'topup',
      denial_reason: 'not eligible',
      data: { threshold_wei: '123456789012345678901', current_balance_wei: '5' },
    });
    expect(submits).toHaveLength(0);

    // Topped up → Continue. The retry busts the bundler cache and resubmits the
    // SAME capped params, never the original request.
    mockCheckFunding.mockResolvedValue(null);
    h.dispatch({ type: 'funding_complete_tapped' });
    await settle();
    expect(mockClearCache).toHaveBeenCalledWith(100, ALICE);
    expect(submits).toHaveLength(1);
    expect(JSON.stringify(submits[0].request.params)).toBe(capped);
    h.session.dispose();
  });

  test('a fresh request supersedes a stale funding prompt, and Continue cannot replay it', async () => {
    mockCheckFunding.mockResolvedValue({
      depositAddress: '0xdep0000000000000000000000000000000000000',
      safeAddress: ALICE, chainId: 100, nativeSym: 'xDAI',
      thresholdWei: 10n, recommendedWei: 10n, currentBalance: 0n,
      recommendedFormatted: '', currentFormatted: '',
    });
    mockSponsor.mockResolvedValue({ outcome: 'denied' });
    const h = open();
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS, per_request_chain: 100 }));
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();
    expect(h.latest().surface).toBe('funding');

    // A different dApp request takes the sheet.
    h.dispatch(arrival({ id: 'req-2' }));
    await settle();
    expect(h.latest().surface).toBe('sheet');
    expect(h.latest().request?.id).toBe('req-2');

    // A late "Continue" must not submit the OLD request's params under the NEW id.
    h.dispatch({ type: 'funding_complete_tapped' });
    await settle();
    expect(submits).toHaveLength(0);
    h.session.dispose();
  });

  test('a passkey cancel is neither an error nor a response — the sheet stays open', async () => {
    submitImpl = async () => {
      throw Object.assign(new Error('cancelled'), { code: 'PASSKEY_CANCELLED' });
    };
    const h = open();
    h.dispatch(arrival());
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();
    expect(h.answersFor('req-1')).toEqual([]);
    expect(h.latest().surface).toBe('sheet');
    expect(h.latest().is_signing).toBe(false);
    expect(h.latest().error).toBeNull();
    expect(await loadTransactions()).toEqual([]);
    h.session.dispose();
  });

  test('an underfunded submit is recognised from the bundler wording and offers a top-up', async () => {
    submitImpl = async () => {
      throw new Error('dedicated bundler gas account. Deposit to: 0xdead000000000000000000000000000000000000 required: 7');
    };
    mockSponsor.mockResolvedValue({ outcome: 'denied', denialReason: 'nope' });
    const h = open();
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS, per_request_chain: 100 }));
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();
    // The reactive path healed nothing, so the funding view is offered — and no
    // error response went to the dApp (the request stays pending).
    expect(h.latest().surface).toBe('funding');
    expect(h.latest().funding?.data.deposit_address).toBe('0xdead000000000000000000000000000000000000');
    expect(h.answersFor('req-1')).toEqual([]);
    h.session.dispose();
  });

  test('an unsupported chain is refused 4902 before any UI', async () => {
    const h = open();
    h.dispatch(arrival({ per_request_chain: 9999 }));
    await settle();
    expect(h.latest().surface).toBe('hidden');
    expect(h.answersFor('req-1')).toEqual([
      expect.objectContaining({ error: expect.objectContaining({ code: 4902 }) }),
    ]);
    h.session.dispose();
  });

  test('§12.1.6: the granted account is switched first, and approve is inert until it lands', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const h = open({
      switchActiveAccount: async (index) => {
        switchedTo.push(index);
        await gate;
      },
    });
    const switchedTo: number[] = [];

    // The origin was granted BOB — the second row of the session's own list.
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS, granted_address: BOB.toUpperCase() }));
    await settle();
    expect(switchedTo).toEqual([1]);
    // The approval surface is shut until the switch acks…
    expect(h.latest().reconcile_pending).toBe(true);
    expect(h.latest().confirm_gate_open).toBe(false);
    h.dispatch(APPROVE_TX);
    await settle();
    expect(submits).toHaveLength(0);

    // …and once it does, the signer is BOB, never whoever was active before.
    release();
    await settle();
    expect(h.latest().reconcile_pending).toBe(false);
    expect(h.latest().confirm_gate_open).toBe(true);
    h.dispatch(APPROVE_TX);
    await settle();
    expect(submits).toHaveLength(1);
    expect(submits[0].address).toBe(BOB);
    expect(submits[0].credentialId).toBe('cred-bob');
    h.session.dispose();
  });

  test('a submit failure answers -32603 with the bundler wording and closes the record', async () => {
    submitImpl = async (_args, onSubmitted) => {
      onSubmitted('0xopHash');
      await new Promise<void>((r) => setTimeout(r, 0));
      throw new Error('no receipt in time');
    };
    const h = open();
    h.dispatch(arrival({ method: 'eth_sendTransaction', params_json: TX_PARAMS, per_request_chain: 100 }));
    await settle();
    h.dispatch(APPROVE_TX);
    await settle();

    expect(h.answersFor('req-1')).toEqual([
      expect.objectContaining({ error: { code: -32603, message: 'no receipt in time' } }),
    ]);
    // The already-submitted record must not linger 'pending' forever.
    const rows = await loadTransactions();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(h.latest().error).toEqual({ kind: 'submit_failed', detail: 'no receipt in time' });
    h.session.dispose();
  });
});
