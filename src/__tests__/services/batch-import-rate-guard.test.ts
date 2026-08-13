/**
 * The batch-import fiat rate on the WEB path (spec 017, G5) — what the shell is
 * allowed to tell the core, and what the core currently does with it.
 *
 * `currency.ts::getRate` is the DISPLAY helper and ends in `?? 1`: it answers
 * "1" for a currency no source can price, which is indistinguishable from "the
 * rate really is 1". The batch executor used it, so an unpriceable currency
 * reached the core as a KNOWN rate and `BatchRateStatus::Failed` was reachable
 * only when the source threw — the sheet's "Rate unavailable — enter one
 * manually" hint was dead UI for the case it exists for. `resolveRate` keeps
 * the `null`, which is the observation the core classifies (the same choice
 * `executors.ts::resolve_rate` already made for the display currency).
 *
 * This drives the REAL Rust core through the real web session. Swap
 * `resolveRate` back to `getRate` in `batch-import-executor.ts` and the
 * unpriceable case flips from `failed` to `ok` — three assertions below go red.
 *
 * The gap this file used to pin as KNOWN is now CLOSED. `Failed` blocks Apply:
 * the core's `auto_price_per_token` refuses an unknown (`None`) or invalid
 * (`<= 0`) rate instead of taking `tokenPriceInFiat`'s ported
 * `usdToFiatRate > 0 ? … : 1` fallback, so `rate_input` comes back EMPTY and
 * `can_apply` false. Owner ruling — a `5000 CNY` payroll line previewing as
 * 5000 USDT (worth ~698) with a green Apply button is ~7x the intended payout,
 * and the same "never silently assume" discipline the rest of the money path
 * already follows. The shared `fiat-convert.ts` helper is UNCHANGED: its
 * fallback is a display convenience, and the discrimination belongs at the
 * call site.
 */

const resolveRate = jest.fn<Promise<number | null>, [string]>();
const getRate = jest.fn<Promise<number>, [string]>();

jest.mock('@/services/currency', () => ({
  resolveRate: (code: string) => resolveRate(code),
  getRate: (code: string) => getRate(code),
}));

// Initialise the wasm module before the session constructs a core from it.
import '@/services/vela-core';
import { executeBatchOperation } from '@/services/wallet-state-core/batch-import-executor';
import { createBatchImportSession } from '@/services/wallet-state-core/batch-import-session';
import type { BatchImportEvent } from '@/services/wallet-state-core/generated/BatchImportEvent';
import type { BatchToken } from '@/services/wallet-state-core/generated/BatchToken';
import type { BatchView } from '@/services/wallet-state-core/generated/BatchView';

// 1 USDT = 1 USD, and the treasury holds plenty — so nothing but the fiat rate
// can decide what this payroll line pays out.
const USDT: BatchToken = { symbol: 'USDT', decimals: 6, balance: '100000', price_usd: 1 };
const PAYROLL = '0x1111111111111111111111111111111111111111,5000';
const CNY_PER_USD = 7.17; // what the source answers when it CAN price CNY

/** Run the sheet's opening sequence and return the settled view. */
async function openWith(text: string): Promise<BatchView> {
  let last: BatchView | null = null;
  const session = createBatchImportSession({
    onView: (view) => { last = view; },
    onError: (error) => { throw error; },
  });
  session.start({
    type: 'open', token: USDT, currency_code: 'CNY', max_recipients: 100,
  } as BatchImportEvent);
  session.dispatch({ type: 'set_raw_text', text });
  // Let the rate effect resolve and its result reach the core.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  session.dispose();
  if (!last) throw new Error('no view committed');
  return last;
}

beforeEach(() => {
  jest.clearAllMocks();
  getRate.mockResolvedValue(1);
});

describe('fetch_usd_fiat_rate reports the observation, not the display fallback', () => {
  test('an unpriceable currency reaches the core as null, never as 1', async () => {
    resolveRate.mockResolvedValue(null);
    const result = await executeBatchOperation({
      id: 1,
      operation: { type: 'fetch_usd_fiat_rate', code: 'CNY' },
    });
    expect(result).toEqual({ type: 'rate_resolved', code: 'CNY', rate: null });
    // The display helper must not be on this path at all: its `?? 1` is what
    // made `BatchRateStatus::Failed` unreachable without a thrown source.
    expect(getRate).not.toHaveBeenCalled();
  });

  test('a priced currency passes the real rate through', async () => {
    resolveRate.mockResolvedValue(CNY_PER_USD);
    await expect(
      executeBatchOperation({ id: 1, operation: { type: 'fetch_usd_fiat_rate', code: 'CNY' } }),
    ).resolves.toEqual({ type: 'rate_resolved', code: 'CNY', rate: CNY_PER_USD });
  });
});

describe('the core is told the truth about an unpriceable currency', () => {
  test('no source can price CNY → the sheet says so instead of pretending', async () => {
    resolveRate.mockResolvedValue(null);
    const view = await openWith(PAYROLL);

    // What this fix buys: `rate_status` is the flag `BatchImportSheet.tsx`
    // renders the "Rate unavailable — enter one manually" hint from. With
    // `getRate` it was `ok` and the user was never told.
    expect(view.rate_status).toBe('failed');

    // And it BLOCKS: an unknown rate quotes no price, so nothing converts and
    // Apply stays down. These three used to read '1' / true / 5000 — that was
    // the ported `?: 1` quirk, overturned by the owner, not a regression.
    expect(view.rate_input).toBe('');
    expect(view.can_apply).toBe(false);
    expect(view.recipients).toHaveLength(0);
    expect(view.preview[0].token_amount).toBe('');
  });

  test('a hand-typed rate is the way through — 5000 CNY at 7.17, not at 1', async () => {
    resolveRate.mockResolvedValue(null);
    let last: BatchView | null = null;
    const session = createBatchImportSession({
      onView: (view) => { last = view; },
      onError: (error) => { throw error; },
    });
    session.start({
      type: 'open', token: USDT, currency_code: 'CNY', max_recipients: 100,
    } as BatchImportEvent);
    session.dispatch({ type: 'set_raw_text', text: PAYROLL });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    session.dispatch({ type: 'edit_rate', text: String(CNY_PER_USD) });
    session.dispose();
    const view = last as unknown as BatchView;

    expect(view.rate_status).toBe('failed'); // still no source — the hint stands
    expect(view.can_apply).toBe(true);
    expect(Number(view.recipients[0].amount)).toBeCloseTo(697.35, 1);
  });

  test('CNY priced at 7.17 → 5000 CNY becomes ~697 USDT, not 5000', async () => {
    resolveRate.mockResolvedValue(CNY_PER_USD);
    const view = await openWith(PAYROLL);

    expect(view.rate_status).toBe('ok');
    expect(view.can_apply).toBe(true);
    expect(view.recipients).toHaveLength(1);
    const tokens = Number(view.recipients[0].amount);
    expect(tokens).toBeGreaterThan(690);
    expect(tokens).toBeLessThan(700);
    // The ~7x gap the rate carries: at rate 1 this line pays the fiat figure.
    expect(tokens).not.toBeCloseTo(5000, 0);
  });
});

/**
 * The adjacent door onto the identical overpayment: not an UNKNOWN rate, but a
 * KNOWN rate belonging to the currency the user just left. Through the real
 * core, over the real wasm boundary — a Rust-only change with no `build:wasm`
 * cannot make this file green.
 */
describe('a rate never outlives the currency it was fetched for', () => {
  test('USD → CNY: the retained rate of 1 prices nothing until CNY lands', async () => {
    resolveRate.mockImplementation(async (code: string) =>
      code === 'USD' ? 1 : CNY_PER_USD,
    );
    let last: BatchView | null = null;
    const session = createBatchImportSession({
      onView: (view) => { last = view; },
      onError: (error) => { throw error; },
    });
    session.start({
      type: 'open', token: USDT, currency_code: 'USD', max_recipients: 100,
    } as BatchImportEvent);
    session.dispatch({ type: 'set_raw_text', text: PAYROLL });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Priced in USD, 1 USDT = 1 USD: the payroll line is 5000 USDT, correctly.
    expect((last as unknown as BatchView).rate_input).toBe('1');
    expect((last as unknown as BatchView).can_apply).toBe(true);

    // Tap "Priced in" → CNY. The USD rate of 1 is still the only rate in hand.
    session.dispatch({ type: 'set_fiat_code', code: 'CNY' });
    const mid = last as unknown as BatchView;
    expect(mid.fiat_code).toBe('CNY');
    expect(mid.rate_status).toBe('loading');
    // Was '1' / true / '5000' before the rate carried its currency code — a
    // 5000 CNY salary line paid as 5000 USDT, ~7.2x, with Apply green for the
    // whole FX round-trip.
    expect(mid.rate_input).toBe('');
    expect(mid.can_apply).toBe(false);
    expect(mid.recipients).toHaveLength(0);
    expect(mid.preview[0].token_amount).toBe('');

    // Once CNY is actually priced, the same line is worth ~697 USDT.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    session.dispose();
    const done = last as unknown as BatchView;
    expect(done.rate_status).toBe('ok');
    expect(done.rate_input).toBe('7.17');
    expect(done.can_apply).toBe(true);
    expect(Number(done.recipients[0].amount)).toBeCloseTo(697.35, 1);
  });
});
