/**
 * What ONE open of the payroll importer resets — native, and its Rust twin.
 *
 * The native controller used to reset with a list of `setX(...)` calls, and the
 * list had drifted from the state it was supposed to cover. Two separate bugs
 * came out of that one shape:
 *
 *   1. The RATE was not in the list. Open in CNY, let 7.17 land, close, reopen:
 *      the status went back to "Fetching rate…" while the field still held
 *      "7.17" — and because the displayed string IS the applied rate, a payroll
 *      pasted in that window converted at the PREVIOUS session's number with
 *      Apply green. The Rust twin was never exposed: its `Open` assigns a whole
 *      `Model`, so `usd_fiat_rate` goes back to `None` and `rate_input` to ''.
 *   2. `priced` was in the reset effect's dependency array, so something that
 *      is not an open could fire it: a background price refresh turning an
 *      unpriced token into a priced one flipped `priced` false→true and wiped
 *      the operator's pasted table, silently, mid-edit. The core has no such
 *      trigger — there is no event for it, only `open`.
 *
 * Both fixes are the same shape, which is why they are tested together: every
 * per-open field lives in one `BatchOpenState` that an open REPLACES, and the
 * things that are not opens (the token, its price) reach the effect through
 * refs rather than through its dependency array.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { freshBatchOpen, type BatchOpenState } from '@/hooks/batch-import-controller-types';

const resolveRate = jest.fn<Promise<number | null>, [string]>();
jest.mock('@/services/currency', () => ({
  resolveRate: (code: string) => resolveRate(code),
  getRate: async () => 1,
}));

// Initialise the wasm module before the session constructs a core from it.
import '@/services/vela-core';
import { createBatchImportSession } from '@/services/wallet-state-core/batch-import-session.web';
import type { BatchToken } from '@/services/wallet-state-core/generated/BatchToken';
import type { BatchView } from '@/services/wallet-state-core/generated/BatchView';

const USDT: BatchToken = { symbol: 'USDT', decimals: 6, balance: '100000', price_usd: 1 };
const PAYROLL = '0x1111111111111111111111111111111111111111,5000';
const CNY_PER_USD = 7.17;

/** A mutable holder: `let last: BatchView | null` narrows to `never` after the
 *  callback assignment, which TypeScript cannot see through. */
const box: { view: BatchView | null } = { view: null };
/** The last committed view. */
const view = (): BatchView => {
  if (box.view == null) throw new Error('no view committed');
  return box.view;
};

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// The value that IS the reset
// ---------------------------------------------------------------------------

describe('freshBatchOpen carries NOTHING over from the previous open', () => {
  const fresh = freshBatchOpen(true, 'CNY');

  it('holds no rate, and says so — the two facts that must move together', () => {
    // The exact pair the old reset lost. A quote left behind prices a currency
    // this open has not confirmed; `rateStatus` reading "loading" over it is
    // what made the stale number look live.
    expect(fresh.rateQuote).toBeNull();
    expect(fresh.rateStatus).toBe('loading');
    expect(fresh.rateEdited).toBe(false);
    expect(fresh.typedRate).toBe('');
  });

  it('holds no paste, no file, and no template acknowledgement', () => {
    expect(fresh.rawText).toBe('');
    expect(fresh.fileParsed).toBeNull();
    expect(fresh.fileName).toBeNull();
    expect(fresh.busy).toBe(false);
    expect(fresh.templateSaved).toBe(false);
  });

  it('takes the currency it is given and the unit its token deserves', () => {
    expect(fresh.fiatCode).toBe('CNY');
    expect(fresh.unit).toBe('fiat');
    expect(freshBatchOpen(false, 'USD').unit).toBe('token');
  });

  it('covers every per-open field — the value IS the reset, not a subset of it', () => {
    // Enumerated on purpose. TypeScript catches a field `freshBatchOpen` forgot
    // to SET; nothing but this catches a per-open field added to the controller
    // and never added to `BatchOpenState` at all, which is the drift that cost
    // us the rate.
    const covered: (keyof BatchOpenState)[] = [
      'unit', 'fiatCode', 'rawText', 'fileParsed', 'fileName', 'busy',
      'templateSaved', 'rateQuote', 'rateStatus', 'typedRate', 'rateEdited',
    ];
    expect(Object.keys(fresh).sort()).toEqual([...covered].sort());
  });
});

// ---------------------------------------------------------------------------
// The Rust twin, driven for real
// ---------------------------------------------------------------------------

describe('the core’s `open` clears the rate the same way', () => {
  it('a reopen quotes nothing while the new fetch is still out', async () => {
    // First open: CNY prices at 7.17. Second: the network is slow and the
    // answer never comes — the exact window the native sheet mispriced in.
    let pending = 0;
    resolveRate.mockImplementation(() =>
      pending++ === 0 ? Promise.resolve(CNY_PER_USD) : new Promise<number | null>(() => {}),
    );

    box.view = null;
    const session = createBatchImportSession({
      onView: (next) => { box.view = next; },
      onError: (error) => { throw error; },
    });
    session.start({ type: 'open', token: USDT, currency_code: 'CNY', max_recipients: 100 });
    await settle();
    // Guard against a vacuous test: the rate really did land the first time.
    expect(view().rate_input).toBe('7.17');

    session.dispatch({ type: 'open', token: USDT, currency_code: 'CNY', max_recipients: 100 });
    session.dispatch({ type: 'set_raw_text', text: PAYROLL });
    await settle();

    expect(view().rate_status).toBe('loading');
    // The field is EMPTY, so nothing converts and Apply is not offered. Native
    // reached `canApply: true` with `tokenAmount: '697.35007'` right here.
    expect(view().rate_input).toBe('');
    expect(view().preview[0]?.token_amount).toBe('');
    expect(view().can_apply).toBe(false);
    session.dispose();
  });

  it('and clears the paste with it', async () => {
    resolveRate.mockResolvedValue(CNY_PER_USD);
    box.view = null;
    const session = createBatchImportSession({
      onView: (next) => { box.view = next; },
      onError: (error) => { throw error; },
    });
    session.start({ type: 'open', token: USDT, currency_code: 'CNY', max_recipients: 100 });
    session.dispatch({ type: 'set_raw_text', text: PAYROLL });
    await settle();
    expect(view().preview).toHaveLength(1);

    session.dispatch({ type: 'open', token: USDT, currency_code: 'CNY', max_recipients: 100 });
    await settle();
    expect(view().raw_text).toBe('');
    expect(view().preview).toHaveLength(0);
    session.dispose();
  });
});

// ---------------------------------------------------------------------------
// What may TRIGGER a reset — a drift gate over the two controllers
// ---------------------------------------------------------------------------

/**
 * The dependency array of the reset effect in one controller file.
 *
 * Read from source because that array is the whole rule and there is no other
 * way to observe it: a value in it makes a reset happen, and the reset throws
 * the operator's work away. The core cannot be asked this question — it has no
 * event a price refresh could produce — so the property has to be pinned on
 * the shells, on both of them, together. Same technique as the other drift
 * gates in this suite (`network-admin-constants-parity`, the i18n language
 * gate): read the file, extract the literal, assert on it.
 */
function resetEffectDeps(file: string, marker: string): string[] {
  const source = readFileSync(join(__dirname, '../../hooks', file), 'utf8');
  const at = source.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const deps = /\}, \[([^\]]*)\]\);/.exec(source.slice(at));
  if (!deps) throw new Error(`no dependency array after ${marker} in ${file}`);
  return deps[1].split(',').map((d) => d.trim()).filter(Boolean);
}

describe('only an open resets — a price arriving is not an open', () => {
  it('native’s reset does not depend on the token or its price', () => {
    const deps = resetEffectDeps('use-batch-import.ts', 'setOpenState(freshBatchOpen(');
    // `priced` used to be here. A background refresh pricing the token flipped
    // it false→true, re-ran the effect, and emptied `rawText` mid-paste with no
    // message at all. It now reaches the effect through `pricedRef`.
    expect(deps).not.toContain('priced');
    expect(deps).not.toContain('token');
    expect(deps).toContain('visible');
  });

  it('web’s dispatch of `open` does not either — the twins agree', () => {
    const deps = resetEffectDeps('use-batch-import.web.ts', "type: 'open',");
    expect(deps).not.toContain('priced');
    expect(deps).not.toContain('token');
    expect(deps).toContain('visible');
  });
});
