// The resident half of `tx_tracker` — the part that decides WHO hears a verdict.
//
// The core knows hashes, not surfaces. This module turns its view into the
// three outcomes a receipt-watching surface accepts, and the mapping is a
// money-safety decision in both directions:
//
//   - a fee-hold is delivered ONCE and the watcher stays registered, because
//     the op is still pending and may yet confirm (invariant ②);
//   - a timeout / unreachable bundler / accepted-but-not-landed delivers
//     NOTHING, ever (invariant ①) — a send that is merely slow must never turn
//     into a failed one on screen;
//   - a drop and a rejection are distinguishable (`rejected`), and both are
//     final: the watcher is dropped with the verdict.
//
// Driven against the real core through the real executor; only the bundler and
// the two sibling machines' entry points are doubled.

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

const rpcCallMock = jest.fn();
jest.mock('@/services/rpc-adapter', () => ({
  rpcCall: (...args: unknown[]) => rpcCallMock(...(args as [])),
}));

// The two hand-offs. Doubled so this test asserts the resident's wiring without
// booting `activity_feed`, `token_trust` or `sign_request`.
const feedReconciled = jest.fn();
jest.mock('@/services/wallet-state-core/feed-resident', () => ({
  notifyFeedReconciled: (count: number) => feedReconciled(count),
}));
const receiptLogsConfirmed = jest.fn();
jest.mock('@/services/wallet-state-core/token-trust-resident', () => ({
  notifyReceiptLogsConfirmed: (...args: unknown[]) => receiptLogsConfirmed(...(args as [])),
}));
const signSink = jest.fn();
jest.mock('@/services/wallet-state-core/sign-resident', () => ({
  setSignTrackerSink: (sink: unknown) => signSink(sink),
}));

import '@/services/vela-core';
import { _resetUserOpReceiptPollCache } from '@/services/tx-reconciler';
import {
  dispatchTxTracker,
  trackSubmitted,
  txTrackerView,
  unwatchTxTracker,
} from '@/services/wallet-state-core/tx-tracker-resident';
import type { SendReceiptOutcome } from '@/services/wallet-state-core/generated/SendReceiptOutcome';

const CHAIN = 56;
const TX = '0x' + 'dd'.repeat(32);

let clock = 1_700_000_000_000;
let receiptReply: () => { result?: unknown; error?: unknown } = () => ({ result: null });
let statusReply: () => { result?: unknown; error?: unknown } = () => ({ result: null });
let hashSeq = 0;

/** A fresh hash per case — the resident is a singleton, as it is in the app. */
function freshHash(): string {
  hashSeq += 1;
  return '0x' + hashSeq.toString(16).padStart(64, '0');
}

async function flush(turns = 30) {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

async function tick(atMs: number) {
  clock = atMs;
  dispatchTxTracker({ type: 'tick' });
  await flush();
}

beforeEach(() => {
  mockStorage.clear();
  _resetUserOpReceiptPollCache();
  feedReconciled.mockClear();
  receiptLogsConfirmed.mockClear();
  receiptReply = () => ({ result: null });
  statusReply = () => ({ result: null });
  clock += 60 * 60 * 1000; // a fresh hour per case, so nothing ages into 24h
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  rpcCallMock.mockImplementation(async (method: string) => {
    if (method === 'eth_getUserOperationReceipt') return receiptReply();
    if (method === 'eth_getUserOperationStatus') return statusReply();
    return { result: null };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Track one hash and collect whatever the watcher is told. */
function watch(hash: string) {
  const outcomes: SendReceiptOutcome[] = [];
  trackSubmitted(hash, [`rec-${hash.slice(-4)}`], CHAIN, (outcome) => outcomes.push(outcome));
  return outcomes;
}

test('a confirmation reaches the watcher once, with its tx hash', async () => {
  const hash = freshHash();
  receiptReply = () => ({ result: { success: true, receipt: { transactionHash: TX, logs: [] } } });
  const outcomes = watch(hash);
  await flush();

  expect(outcomes).toEqual([{ type: 'confirmed', tx_hash: TX }]);
  // Terminal: the watcher is gone, so a later view cannot re-fire it.
  await tick(clock + 12_000);
  expect(outcomes).toHaveLength(1);
  expect(feedReconciled).toHaveBeenCalledWith(1);
});

test('a dropped op and a rejected op are told apart', async () => {
  const dropped = freshHash();
  receiptReply = () => ({ result: { success: false, receipt: { transactionHash: TX } } });
  const droppedOutcomes = watch(dropped);
  await flush();
  expect(droppedOutcomes).toEqual([{ type: 'failed', rejected: false }]);

  const rejected = freshHash();
  receiptReply = () => ({ result: null });
  statusReply = () => ({ result: { status: 'rejected' } });
  const rejectedOutcomes = watch(rejected);
  await flush();
  for (let i = 0; i < 6; i++) await tick(clock + 3_000);
  expect(rejectedOutcomes).toEqual([{ type: 'failed', rejected: true }]);
});

test('a slow or unreachable bundler never tells the watcher anything', async () => {
  const hash = freshHash();
  receiptReply = () => ({ error: { message: 'gateway timeout' } });
  const outcomes = watch(hash);
  await flush();
  // The whole 120s window and well past it.
  for (let i = 0; i < 60; i++) await tick(clock + 3_000);

  expect(txTrackerView().entries.find((e) => e.user_op_hash === hash)?.status).toBe('unreachable');
  expect(outcomes).toEqual([]);
});

test('a fee-hold is delivered once and the watcher survives it', async () => {
  const hash = freshHash();
  receiptReply = () => ({ result: null });
  statusReply = () => ({
    result: { status: 'queued', last_executor_stage: 'in_band_settlement_hold' },
  });
  const outcomes = watch(hash);
  await flush();
  for (let i = 0; i < 45; i++) await tick(clock + 3_000);

  expect(outcomes).toEqual([{ type: 'fee_held' }]);

  // The relay sent it after all — the same watcher still hears the confirmation.
  _resetUserOpReceiptPollCache();
  receiptReply = () => ({ result: { success: true, receipt: { transactionHash: TX, logs: [] } } });
  await tick(clock + 12_000);
  expect(outcomes).toEqual([{ type: 'fee_held' }, { type: 'confirmed', tx_hash: TX }]);
});

test('unwatching stops the callback but not the tracking', async () => {
  const hash = freshHash();
  receiptReply = () => ({ result: null });
  const outcomes = watch(hash);
  await flush();
  unwatchTxTracker(hash);

  _resetUserOpReceiptPollCache();
  receiptReply = () => ({ result: { success: true, receipt: { transactionHash: TX, logs: [] } } });
  await tick(clock + 3_000);

  expect(outcomes).toEqual([]);
  expect(txTrackerView().entries.find((e) => e.user_op_hash === hash)?.status).toBe('confirmed');
  // The record patch still happened — tracking is about the money, not the UI.
  expect(feedReconciled).toHaveBeenCalledWith(1);
});
