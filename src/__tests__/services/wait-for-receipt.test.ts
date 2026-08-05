/**
 * Tests for waitForReceipt's resilience: it must keep polling through transient
 * bundler blips, distinguish "unreachable / unknown" from "submitted but not
 * confirmed", honour an abort signal, and surface a genuine drop.
 */

jest.mock('react-native', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const rpcCall = jest.fn();
jest.mock('@/services/rpc-adapter', () => ({
  rpcCall: (...args: any[]) => rpcCall(...args),
}));

import { waitForReceipt } from '@/services/safe-transaction';
import { _resetUserOpReceiptPollCache } from '@/services/tx-reconciler';

describe('waitForReceipt', () => {
  beforeEach(() => {
    rpcCall.mockReset();
    _resetUserOpReceiptPollCache();
  });
  afterEach(() => jest.useRealTimers());

  test('returns the tx hash on the first successful poll', async () => {
    rpcCall.mockResolvedValueOnce({ result: { success: true, receipt: { transactionHash: '0xabc' } } });
    await expect(waitForReceipt('0xhash', 1)).resolves.toBe('0xabc');
  });

  test('throws a "dropped" error when the bundler reports success=false', async () => {
    rpcCall.mockResolvedValueOnce({ result: { success: false, receipt: { transactionHash: '0xdead' } } });
    await expect(waitForReceipt('0xhash', 1)).rejects.toThrow(/dropped from the network/i);
  });

  test('rejects immediately when the abort signal is already aborted (no poll)', async () => {
    const c = new AbortController();
    c.abort();
    await expect(waitForReceipt('0xhash', 1, 120_000, c.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(rpcCall).not.toHaveBeenCalled();
  });

  test('keeps polling through a transient bundler error, then succeeds', async () => {
    jest.useFakeTimers();
    rpcCall
      .mockRejectedValueOnce(new Error('All bundler endpoints failed'))
      .mockResolvedValueOnce({ result: { success: true, receipt: { transactionHash: '0xok' } } });
    const p = waitForReceipt('0xhash', 1, 30_000);
    const assertion = expect(p).resolves.toBe('0xok');
    await jest.advanceTimersByTimeAsync(3_000);
    await assertion;
    expect(rpcCall).toHaveBeenCalledTimes(2);
  });

  test('final error says status is UNKNOWN when the bundler was never reachable', async () => {
    jest.useFakeTimers();
    rpcCall.mockRejectedValue(new Error('All bundler endpoints failed'));
    const p = waitForReceipt('0xhash', 1, 3_000);
    const assertion = expect(p).rejects.toThrow(/unknown|reach the bundler/i);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  test('final error says "not confirmed" when the bundler answered but no receipt landed', async () => {
    jest.useFakeTimers();
    rpcCall.mockResolvedValue({ result: null }); // clean response, not ready yet
    const p = waitForReceipt('0xhash', 1, 3_000);
    const assertion = expect(p).rejects.toThrow(/not confirmed within/i);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});

/**
 * A null receipt is ambiguous: it covers "landing shortly", "parked until fees fall",
 * and "refused, never landing". Only the relay's status endpoint separates them, and
 * getting that wrong is what left a rejected payroll spinning as pending forever.
 */
describe('waitForReceipt — relay lifecycle status', () => {
  const routed = (status: Record<string, unknown> | null) => (method: string) =>
    Promise.resolve(method === 'eth_getUserOperationStatus' ? { result: status } : { result: null });

  beforeEach(() => {
    rpcCall.mockReset();
    _resetUserOpReceiptPollCache();
  });
  afterEach(() => jest.useRealTimers());

  test('does not ask for a status on the first poll — a receipt is usually just not ready', async () => {
    jest.useFakeTimers();
    rpcCall.mockResolvedValue({ result: null });
    const p = waitForReceipt('0xhash', 1, 3_000);
    const assertion = expect(p).rejects.toThrow(/not confirmed within/i);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(rpcCall.mock.calls.every(([method]: any[]) => method === 'eth_getUserOperationReceipt')).toBe(true);
  });

  test('fails fast when the relay rejected the operation, instead of waiting out the timeout', async () => {
    jest.useFakeTimers();
    rpcCall.mockImplementation(routed({
      status: 'rejected',
      last_executor_stage: 'in_band_settlement',
      last_executor_error: 'in-band reimbursement is below the required amount: paid=1, required=2, shortfall=1',
    }));
    const p = waitForReceipt('0xhash', 1, 120_000);
    const assertion = expect(p).rejects.toMatchObject({
      name: 'UserOpRejectedError',
      detail: expect.stringContaining('below the required amount'),
    });
    await jest.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  test('reports a fee hold as waiting, not as a confirmation timeout', async () => {
    jest.useFakeTimers();
    rpcCall.mockImplementation(routed({
      status: 'queued',
      last_executor_stage: 'in_band_settlement_hold',
      last_executor_error: 'waiting for network fees to fit the signed in-band reimbursement: attempt=2/12',
    }));
    const p = waitForReceipt('0xhash', 1, 30_000);
    const assertion = expect(p).rejects.toMatchObject({ name: 'UserOpFeeHoldError' });
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  test('a queued op with no hold stage still times out as an ordinary pending send', async () => {
    jest.useFakeTimers();
    rpcCall.mockImplementation(routed({ status: 'queued' }));
    const p = waitForReceipt('0xhash', 1, 30_000);
    const assertion = expect(p).rejects.toThrow(/not confirmed within/i);
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  test('an older relay without the status method behaves exactly as before', async () => {
    jest.useFakeTimers();
    rpcCall.mockImplementation((method: string) =>
      Promise.resolve(method === 'eth_getUserOperationStatus'
        ? { error: { code: -32601, message: 'method not found' } }
        : { result: null }));
    const p = waitForReceipt('0xhash', 1, 30_000);
    const assertion = expect(p).rejects.toThrow(/not confirmed within/i);
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  test('a landed receipt still wins over any status', async () => {
    jest.useFakeTimers();
    rpcCall.mockImplementation((method: string) =>
      Promise.resolve(method === 'eth_getUserOperationStatus'
        ? { result: { status: 'queued', last_executor_stage: 'in_band_settlement_hold' } }
        : { result: { success: true, receipt: { transactionHash: '0xlanded' } } }));
    await expect(waitForReceipt('0xhash', 1, 30_000)).resolves.toBe('0xlanded');
  });
});
