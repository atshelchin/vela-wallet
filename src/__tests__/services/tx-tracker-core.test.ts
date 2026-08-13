// The `tx_tracker` core (Rust/wasm) driven through the WEB shell.
//
// This machine's whole subject is money that has already left the wallet, so
// every rule it owns is a rule about not lying:
//
//   - A timeout or an unreachable bundler is NEVER a failure (①). Marking one
//     failed invites a re-send and a double spend.
//   - A fee-hold stays pending; only the wording changes (②).
//   - ONLY a `success === false` receipt or an explicit relay `rejected` may
//     write `failed`, and either terminates tracking at once (③).
//   - Past 24h polling stops but the record stays pending — an honest unknown (④).
//   - Every consumer of one hash shares one request and one 3s cooldown (⑤).
//   - Pending records survive a reload and still converge (⑥).
//   - A convergence patches the SAME record id in place (⑦).
//   - "Unreachable all window" is not "accepted but not landed" (⑧).
//
// The verdicts are the core's and the Rust suite covers them in isolation; what
// only exists on THIS side is the executor — the RPC→typed-result mapping that
// used to be three copies of a regex, the clock, the store filter, and the two
// hand-offs (`activity_feed`'s re-read, `token_trust`'s auto-add). Each of the
// eight is therefore asserted end to end, over the real executor and the real
// `services/storage.ts` on a mocked key-value store.

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

// The bundler. The `tx-reconciler.ts` classification on top of it is REAL —
// that mapping is precisely what the core delegates to the shell.
const rpcCallMock = jest.fn();
jest.mock('@/services/rpc-adapter', () => ({
  rpcCall: (...args: unknown[]) => rpcCallMock(...(args as [])),
}));

// Load-bearing (see browser-history-core.test.ts): jest lists no `.web.ts` in
// `moduleFileExtensions`, so the web entry must be imported by explicit path
// for `initSync` to run on the planted wasm bytes before the core is built.
import '@/services/vela-core';
import { loadTransactions, saveTransactions, type LocalTransaction } from '@/services/storage';
import { _resetUserOpReceiptPollCache } from '@/services/tx-reconciler';
import { createTxTrackerSession } from '@/services/wallet-state-core/tx-tracker-session.web';
import type { TrackEntryView } from '@/services/wallet-state-core/generated/TrackEntryView';
import type { TrackView } from '@/services/wallet-state-core/generated/TrackView';
import type { TrustReceiptLog } from '@/services/wallet-state-core/generated/TrustReceiptLog';

const CHAIN = 56;
const ME = '0x' + '11'.repeat(20);
const OP = '0xAAbb' + 'cc'.repeat(30);
const TX = '0x' + 'dd'.repeat(32);
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Epoch ms the whole test controls; the executor's only clock. */
let clock = 1_700_000_000_000;

/** Drain the effect loop's round trips. */
async function flush(turns = 30) {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

type Reply = { result?: unknown; error?: unknown } | Error;

/** Scripted bundler answers, by method. A function is called per request. */
let receiptReply: () => Reply = () => ({ result: null });
let statusReply: () => Reply = () => ({ result: null });
let receiptCalls = 0;
let statusCalls = 0;

function pendingRecord(over: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: 'tx-1',
    userOpHash: OP,
    txHash: '',
    from: ME,
    to: '0x' + '22'.repeat(20),
    value: '1',
    symbol: 'BNB',
    decimals: 18,
    chainId: CHAIN,
    timestamp: Math.floor(clock / 1000),
    status: 'pending',
    type: 'send',
    ...over,
  };
}

function open() {
  const faults: unknown[] = [];
  const reconciled: number[] = [];
  const autoAdds: { from: string; chainId: number; logs: TrustReceiptLog[] }[] = [];
  let view: TrackView = { entries: [] };
  const session = createTxTrackerSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => faults.push(error),
    ports: {
      feedReconciled: (count) => reconciled.push(count),
      receiptLogsConfirmed: (from, chainId, logs) => autoAdds.push({ from, chainId, logs }),
    },
  });
  return {
    session,
    faults,
    reconciled,
    autoAdds,
    latest: () => view,
    entry: (hash = OP): TrackEntryView | undefined =>
      view.entries.find((e) => e.user_op_hash === hash.toLowerCase()),
  };
}

/** Advance the clock and hand the core a tick. Any frequency is safe by design. */
async function tick(app: ReturnType<typeof open>, atMs: number) {
  clock = atMs;
  app.session.dispatch({ type: 'tick' });
  await flush();
}

beforeEach(() => {
  mockStorage.clear();
  _resetUserOpReceiptPollCache();
  receiptCalls = 0;
  statusCalls = 0;
  receiptReply = () => ({ result: null });
  statusReply = () => ({ result: null });
  clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  rpcCallMock.mockImplementation(async (method: string) => {
    if (method === 'eth_getUserOperationReceipt') {
      receiptCalls += 1;
      const reply = receiptReply();
      if (reply instanceof Error) throw reply;
      return reply;
    }
    if (method === 'eth_getUserOperationStatus') {
      statusCalls += 1;
      const reply = statusReply();
      if (reply instanceof Error) throw reply;
      return reply;
    }
    return { result: null };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A definitive receipt the bundler answers with. */
const receiptOf = (success: boolean, logs: unknown[] = []) => ({
  result: { success, receipt: { transactionHash: TX, logs } },
});

// ---------------------------------------------------------------------------
// ① a timeout / unreachable bundler is never a failure
// ---------------------------------------------------------------------------

test('an unreachable bundler for the whole window never fails the record', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => new Error('network down');
  statusReply = () => ({ error: { code: -32601 } });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();

  // Well past the 120s wait window, still nothing but RPC failures.
  for (let t = 3; t <= 130; t += 3) await tick(app, clock + 3_000);

  const stored = await loadTransactions();
  expect(stored[0].status).toBe('pending');
  expect(stored[0].txHash).toBe('');
  expect(app.entry()?.status).not.toBe('dropped');
  expect(app.entry()?.status).not.toBe('rejected');
  expect(app.faults).toEqual([]);
});

// ---------------------------------------------------------------------------
// ⑧ unreachable ≠ pending
// ---------------------------------------------------------------------------

test('unreachable all window reads unreachable, a clean no-receipt reads accepted-not-landed', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ error: { message: 'boom' } });
  const unreachable = open();
  unreachable.session.start({ type: 'app_resumed' });
  await flush();
  for (let t = 0; t < 45; t++) await tick(unreachable, clock + 3_000);
  expect(unreachable.entry()?.status).toBe('unreachable');

  // Same 120s, but the bundler answered every time — the op simply has not
  // landed. Two different truths, and the machine keeps them apart.
  mockStorage.clear();
  _resetUserOpReceiptPollCache();
  clock = 1_700_000_000_000;
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: null });
  const notLanded = open();
  notLanded.session.start({ type: 'app_resumed' });
  await flush();
  for (let t = 0; t < 45; t++) await tick(notLanded, clock + 3_000);
  expect(notLanded.entry()?.status).toBe('accepted_not_landed');

  const stored = await loadTransactions();
  expect(stored[0].status).toBe('pending');
});

// ---------------------------------------------------------------------------
// ② a fee-hold stays pending, only the wording changes
// ---------------------------------------------------------------------------

test('a fee-held op keeps its record pending and only changes wording', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: null });
  statusReply = () => ({
    result: { status: 'queued', last_executor_stage: 'in_band_settlement_hold' },
  });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();
  for (let t = 0; t < 45; t++) await tick(app, clock + 3_000);

  expect(statusCalls).toBeGreaterThan(0);
  expect(app.entry()?.status).toBe('fee_held');
  // The relay will send it itself: nothing was written, nothing failed.
  const stored = await loadTransactions();
  expect(stored[0].status).toBe('pending');
  expect(app.reconciled).toEqual([]);
});

// ---------------------------------------------------------------------------
// ③ only a definitive drop or an explicit rejection may fail — and it stops
// ---------------------------------------------------------------------------

test('a success===false receipt fails the record and stops polling immediately', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => receiptOf(false);

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();

  const stored = await loadTransactions();
  expect(stored[0].status).toBe('failed');
  // A failed patch never writes a hash — `updateTransaction(id, {status})`.
  expect(stored[0].txHash).toBe('');
  expect(app.entry()?.status).toBe('dropped');
  expect(app.entry()?.polling).toBe(false);

  const before = receiptCalls;
  for (let t = 0; t < 10; t++) await tick(app, clock + 3_000);
  expect(receiptCalls).toBe(before);
  // A drop is not a confirmation: token_trust is never told.
  expect(app.autoAdds).toEqual([]);
});

test('an explicit relay rejection fails the record and stops polling immediately', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: null });
  statusReply = () => ({ result: { status: 'rejected' } });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();
  // The first status poll waits one full 12s interval, by design.
  for (let t = 0; t < 6; t++) await tick(app, clock + 3_000);

  expect(app.entry()?.status).toBe('rejected');
  expect(app.entry()?.polling).toBe(false);
  expect((await loadTransactions())[0].status).toBe('failed');

  const before = receiptCalls + statusCalls;
  for (let t = 0; t < 10; t++) await tick(app, clock + 3_000);
  expect(receiptCalls + statusCalls).toBe(before);
});

test('an included/failed lifecycle answer is recorded but never terminates the wait', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: null });
  statusReply = () => ({ result: { status: 'failed' } });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();
  for (let t = 0; t < 6; t++) await tick(app, clock + 3_000);

  // Ported quirk, verbatim from `waitForReceipt`: only `rejected` is acted on.
  expect(app.entry()?.polling).toBe(true);
  expect((await loadTransactions())[0].status).toBe('pending');
});

// ---------------------------------------------------------------------------
// ④ past 24h: stop polling, stay pending
// ---------------------------------------------------------------------------

test('a submission older than 24h is not polled and is left pending', async () => {
  await saveTransactions([
    pendingRecord({ timestamp: Math.floor((clock - 25 * 3600 * 1000) / 1000) }),
  ]);
  receiptReply = () => receiptOf(true);

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();
  for (let t = 0; t < 5; t++) await tick(app, clock + 3_000);

  expect(receiptCalls).toBe(0);
  expect((await loadTransactions())[0].status).toBe('pending');
});

test('an op that ages past 24h while tracked stops polling and stays pending', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: null });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();
  expect(receiptCalls).toBeGreaterThan(0);

  await tick(app, clock + 25 * 3600 * 1000);
  const before = receiptCalls;
  await tick(app, clock + 12_000);
  await tick(app, clock + 12_000);

  expect(receiptCalls).toBe(before);
  expect(app.entry()?.polling).toBe(false);
  expect((await loadTransactions())[0].status).toBe('pending');
});

// ---------------------------------------------------------------------------
// ⑤ one hash, many consumers, one request and one 3s cooldown
// ---------------------------------------------------------------------------

test('two consumers of one hash share a single request and the 3s cooldown', async () => {
  receiptReply = () => ({ result: null });
  const app = open();
  app.session.start({ type: 'submitted', user_op_hash: OP, record_ids: ['a'], chain_id: CHAIN });
  // The receipt sheet joins the same hash (different casing on purpose — the
  // entry key is lowercased, exactly as `receiptPollKey` is).
  app.session.dispatch({
    type: 'submitted',
    user_op_hash: OP.toUpperCase(),
    record_ids: ['b'],
    chain_id: CHAIN,
  });
  await flush();

  expect(receiptCalls).toBe(1);
  // Both consumers' record ids landed on ONE entry, so a resolution patches
  // both siblings together.
  expect(app.entry()?.record_ids.sort()).toEqual(['a', 'b']);

  // Inside the cooldown a tick buys nothing.
  await tick(app, clock + 1_000);
  expect(receiptCalls).toBe(1);
  await tick(app, clock + 2_500);
  expect(receiptCalls).toBe(2);
});

// ---------------------------------------------------------------------------
// ⑥ pending records survive a restart and converge
// ⑦ pending → confirmed patches the same id, in place
// ---------------------------------------------------------------------------

test('a record left pending by a dead process converges on the next launch, in place', async () => {
  // The previous process wrote two siblings of one batch and died.
  await saveTransactions([
    pendingRecord({ id: 'tx-1' }),
    pendingRecord({ id: 'tx-2' }),
    pendingRecord({ id: 'other', userOpHash: '0x' + '99'.repeat(32), status: 'confirmed', txHash: TX }),
  ]);
  receiptReply = () => receiptOf(true, [{ address: '0x' + 'ab'.repeat(20), topics: [TRANSFER_TOPIC], data: '0x01' }]);

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();

  const stored = await loadTransactions();
  // Same rows, same ids — never a second record (⑦).
  expect(stored.map((t) => t.id)).toEqual(['tx-1', 'tx-2', 'other']);
  expect(stored[0]).toMatchObject({ status: 'confirmed', txHash: TX });
  expect(stored[1]).toMatchObject({ status: 'confirmed', txHash: TX });
  expect(app.entry()?.status).toBe('confirmed');

  // The feed is told to re-read (both siblings in one patch), and token_trust
  // gets the AUTHENTIC logs — the single legal auto-add entry point.
  expect(app.reconciled).toEqual([2]);
  expect(app.autoAdds).toHaveLength(1);
  expect(app.autoAdds[0]).toMatchObject({ from: ME, chainId: CHAIN });
  expect(app.autoAdds[0].logs).toEqual([
    { address: '0x' + 'ab'.repeat(20), topics: [TRANSFER_TOPIC], data: '0x01' },
  ]);
});

test('the sweep reads back exactly the still-pending submissions', async () => {
  await saveTransactions([
    pendingRecord({ id: 'send-pending' }),
    pendingRecord({ id: 'dapp-pending', type: 'dapp_tx', userOpHash: '0x' + '55'.repeat(32) }),
    // Already landed on-chain — nothing to converge.
    pendingRecord({ id: 'has-hash', txHash: TX, userOpHash: '0x' + '66'.repeat(32) }),
    // A receive has no UserOp of its own.
    pendingRecord({ id: 'receive', type: 'receive', userOpHash: '' }),
    pendingRecord({ id: 'settled', status: 'confirmed', userOpHash: '0x' + '77'.repeat(32) }),
  ]);
  receiptReply = () => ({ result: null });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();

  expect(app.latest().entries.map((e) => e.record_ids).flat().sort()).toEqual([
    'dapp-pending',
    'send-pending',
  ]);
});

// ---------------------------------------------------------------------------
// The live hand-off — a submit tracked from acceptance to receipt
// ---------------------------------------------------------------------------

test('a live submission is tracked from bundler acceptance to a confirmed record', async () => {
  await saveTransactions([pendingRecord({ id: 'live' })]);
  receiptReply = () => ({ result: null });

  const app = open();
  app.session.start({
    type: 'submitted',
    user_op_hash: OP,
    record_ids: ['live'],
    chain_id: CHAIN,
  });
  await flush();
  expect(app.entry()?.status).toBe('pending');
  expect((await loadTransactions())[0].status).toBe('pending');

  receiptReply = () => receiptOf(true);
  await tick(app, clock + 3_000);

  expect(app.entry()).toMatchObject({ status: 'confirmed', tx_hash: TX, polling: false });
  expect((await loadTransactions())[0]).toMatchObject({ status: 'confirmed', txHash: TX });
  expect(app.reconciled).toEqual([1]);
});

test('a confirmation with no logs never calls the auto-add entry point', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => receiptOf(true, []);

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();

  expect(app.entry()?.status).toBe('confirmed');
  expect(app.autoAdds).toEqual([]);
});

test('a receipt with no transactionHash is pending, not confirmed', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: { success: true, receipt: {} } });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();

  expect(app.entry()?.status).toBe('pending');
  expect((await loadTransactions())[0].status).toBe('pending');
});

test('the reconcile sweep is single-flight and 12s-throttled', async () => {
  await saveTransactions([pendingRecord()]);
  receiptReply = () => ({ result: null });

  const app = open();
  app.session.start({ type: 'app_resumed' });
  await flush();
  const reads = (mockStorage.get('vela.transactionHistory') ?? '').length;
  expect(reads).toBeGreaterThan(0);

  // Home focus twice inside 12s: the second sweep is dropped by the core, so a
  // chatty shell can never hammer the store or the bundler.
  const before = receiptCalls;
  clock += 1_000;
  app.session.dispatch({ type: 'home_focused' });
  await flush();
  clock += 1_000;
  app.session.dispatch({ type: 'home_focused' });
  await flush();
  expect(receiptCalls).toBe(before);
});
