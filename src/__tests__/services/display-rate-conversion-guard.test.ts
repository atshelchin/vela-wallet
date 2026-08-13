/**
 * The display currency's rate: safe to SHOW, refused to CONVERT.
 *
 * `useDisplayCurrency` used to hand out `getRate(code)`, i.e. `resolveRate(code)
 * ?? 1`, and the core did the same with `commit(model, &code, rate.unwrap_or(1.0))`.
 * A currency no source can price therefore reached every consumer as
 * `{code: 'CNY', symbol: '¥', rate: 1}` — a claim that 1 USD is 1 CNY, wearing
 * the label of the currency the user picked.
 *
 * That number is not decoration. It is the multiplier
 * `useSendController`'s `tokenUnitsFor(token)` divides
 * a fiat-denominated send amount by (`useSendController.ts`), and the one
 * `display: { rate: dc.rate }` carries into the Rust send core
 * (`useSendController.ts`). Typing "5000" with the amount field in CNY
 * bought 5000 whole USDT instead of ~698: the batch importer's ~7x payout, one
 * screen over, with the confirm slider armed.
 *
 * The owner's ruling for the importer applies here unchanged — when the number
 * that moves money is unknown, stop — but NARROWLY. Sending is not blocked;
 * fiat-DENOMINATED input is. Token mode never touches the rate, and the fiat
 * figures on screen degrade to the honest USD amount rather than disappearing.
 *
 * Three things are pinned below, each with its own mutation:
 *   - `convertibleRate` — the shared unwrap. Delete the `code !== forCode` test
 *     and the mislabelled cases return a number.
 *   - the send resolution — put a defaulted `rate = 1` back into
 *     `TokenPrice.of`, and 5000 CNY converts to 5000 tokens again.
 *   - the `display_currency` core, through the SHIPPED wasm — restore
 *     `rate.unwrap_or(1.0)` and the unpriceable view reports 1 instead of null.
 */
import { convertibleRate } from '@/services/fiat-rate-quote';
import { DenominatedAmount, TokenPrice, tokenPriceInFiat } from '@/services/fiat-convert';

/**
 * The send screen's resolution, with the currency named on both halves — which
 * is the only shape it comes in now. `resolveTokenAmount(amount, inFiat, …)`
 * used to stand here; it had no code parameter, so it labelled the figure and
 * the price with the same `const ANY = ''` and its currency check was
 * `'' === ''`. The rate refusals this file pins were real; the currency one was
 * not, at any of the nine call sites that used it.
 */
const resolve = (
  amount: string,
  code: string | null,
  priceUsd: number | null,
  decimals: number,
  rate: number | null,
) =>
  (code === null ? DenominatedAmount.token(amount) : DenominatedAmount.fiat(amount, code))
    .toTokenUnits(TokenPrice.of(priceUsd, rate, 'CNY'), decimals);

const resolveRate = jest.fn<Promise<number | null>, [string]>();
const mockStorage = new Map<string, string>();

// The web session's executor barrel reaches `services/platform`, which imports
// react-native (untransformed here). Nothing on this path uses it.
jest.mock('react-native', () => ({}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
  },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('@/services/currency', () => ({
  resolveRate: (code: string) => resolveRate(code),
  getRate: async (code: string) => (await resolveRate(code)) ?? 1,
}));

// The redirect that used to live here pointed the native module at the real
// web session. There is one module now, so mocking it to itself is what a
// stack overflow looks like — the import below already gets the real thing.

// Initialise the wasm module before the resident session constructs a core.
import '@/services/vela-core';
import {
  ensureDisplayCurrency,
  subscribeDisplayCurrency,
  type DisplayCurrencyPair,
} from '@/services/wallet-state-core/display-currency-resident';

const CNY_PER_USD = 7.17;
const USDT_PRICE_USD = 1;

// ---------------------------------------------------------------------------
// The shared unwrap
// ---------------------------------------------------------------------------

describe('convertibleRate answers null for every rate it cannot vouch for', () => {
  test('unknown', () => {
    expect(convertibleRate(null, 'CNY')).toBeNull();
    expect(convertibleRate(undefined, 'CNY')).toBeNull();
  });

  test('invalid — a source answering something that is not a rate', () => {
    expect(convertibleRate({ code: 'CNY', rate: 0 }, 'CNY')).toBeNull();
    expect(convertibleRate({ code: 'CNY', rate: -7.17 }, 'CNY')).toBeNull();
    expect(convertibleRate({ code: 'CNY', rate: NaN }, 'CNY')).toBeNull();
    expect(convertibleRate({ code: 'CNY', rate: Infinity }, 'CNY')).toBeNull();
  });

  test('mislabelled — a real rate, about another currency', () => {
    expect(convertibleRate({ code: 'CNY', rate: CNY_PER_USD }, 'EUR')).toBeNull();
    // The switch that starts it: USD is priced 1:1 against itself, and that 1
    // is exactly what a screen mid-switch is still holding.
    expect(convertibleRate({ code: 'USD', rate: 1 }, 'CNY')).toBeNull();
  });

  test('known — the only case that yields a multiplier', () => {
    expect(convertibleRate({ code: 'CNY', rate: CNY_PER_USD }, 'CNY')).toBe(CNY_PER_USD);
    expect(convertibleRate({ code: 'USD', rate: 1 }, 'USD')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The conversion itself
// ---------------------------------------------------------------------------

describe('the send resolution refuses an unknown display rate — and only that', () => {
  test('5000 typed in an unpriceable CNY converts to nothing', () => {
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, null)).toBe('0');
    // A source answering nonsense is no better than one that failed.
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, 0)).toBe('0');
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, -7.17)).toBe('0');
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, NaN)).toBe('0');
  });

  test('what the old fallback paid, and what the line is actually worth', () => {
    // The defaulted 1 — one token per yuan. This is the number the send screen
    // put in front of the confirm slider.
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, 1)).toBe('5000');
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, CNY_PER_USD)).toBe('697.35007');
    // ~7x, in one expression, so the size of the failure is not a claim in a
    // comment: 5000 USDT out the door for a 5000 CNY intent.
    expect(5000 / Number(resolve('5000', 'CNY', USDT_PRICE_USD, 6, CNY_PER_USD)))
      .toBeCloseTo(CNY_PER_USD, 4);
  });

  test('TOKEN mode is untouched — the send screen still works with no rate at all', () => {
    expect(resolve('5', null, USDT_PRICE_USD, 6, null)).toBe('5');
    expect(resolve('0.25', null, 2000, 18, null)).toBe('0.25');
    // An unpriced TOKEN in token mode also passes through, rate or no rate —
    // token units need no conversion at all.
    expect(resolve('7', null, null, 18, null)).toBe('7');
    // But in FIAT mode it is the same missing factor as a missing rate, and it
    // gets the same refusal (it used to return '7').
    expect(resolve('7', 'CNY', null, 18, null)).toBe('0');
    expect(resolve('7', 'CNY', null, 18, 7.17)).toBe('0');
  });

  test('the shared display helper keeps its own fallback — the guard is at the call site', () => {
    // `tokenPriceInFiat`'s `usdToFiatRate > 0 ? … : 1` is why a balance card
    // renders the USD figure instead of a blank. Changing THAT would have been
    // the wrong fix; the send resolution simply stops reaching it.
    expect(tokenPriceInFiat(USDT_PRICE_USD, 0)).toBe(1);
    expect(tokenPriceInFiat(2000, 0)).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// The core, through the shipped wasm
// ---------------------------------------------------------------------------

describe('display_currency commits an unpriceable currency as unpriceable', () => {
  /** Refresh the resident session and return the pair it settles on. */
  async function settledPair(): Promise<DisplayCurrencyPair> {
    let pair: DisplayCurrencyPair | null = null;
    const unsubscribe = subscribeDisplayCurrency((next) => { pair = next; });
    ensureDisplayCurrency();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    unsubscribe();
    if (pair == null) throw new Error('no pair committed');
    return pair;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
  });

  test('a priced CNY commits its real rate', async () => {
    mockStorage.set('vela.displayCurrency', 'CNY');
    resolveRate.mockResolvedValue(CNY_PER_USD);
    expect(await settledPair()).toEqual({ code: 'CNY', rate: CNY_PER_USD });
  });

  test('an unpriceable CNY commits rate null — it still SHOWS, it just does not convert', async () => {
    mockStorage.set('vela.displayCurrency', 'CNY');
    resolveRate.mockResolvedValue(null);
    const pair = await settledPair();
    // `rate: 1` here is the whole bug: the resolution above, given 1, pays
    // 5000 tokens for a 5000 CNY line.
    expect(pair).toEqual({ code: 'CNY', rate: null });
    expect(resolve('5000', 'CNY', USDT_PRICE_USD, 6, pair.rate)).toBe('0');
  });

  test('a source answering 0 is not a rate either', async () => {
    mockStorage.set('vela.displayCurrency', 'CNY');
    resolveRate.mockResolvedValue(0);
    expect((await settledPair()).rate).toBeNull();
  });
});
