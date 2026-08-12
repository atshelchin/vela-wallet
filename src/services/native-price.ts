/**
 * Native-coin price selection — NATIVE (iOS/Android).
 *
 * The rules live in `rust/crates/vela-core/src/app/balance_dashboard.rs`
 * (`best_group_price`, `best_native_dex_price`, `choose_native_price`). Web
 * executes THOSE (`native-price.web.ts` calls them through wasm); Hermes has
 * no WebAssembly, so this file is the iOS/Android copy of the same rules and
 * cannot be deleted.
 *
 * Neither copy can be deleted, so the defence is a drift gate rather than
 * de-duplication: `src/__tests__/services/native-price-parity.test.ts` drives
 * the REAL core and this module over the same scenarios and compares the
 * verdicts. A red test there means one platform would price the user's whole
 * wallet differently from the other.
 *
 * What is NOT here: the multicall, the ABI decode, the quote-token discovery
 * and the price log line all stay in `wallet-api.ts`. This module is handed
 * decoded numbers and answers with a price.
 */

/** Quote-token decimals when the `decimals()` read failed — USDC's 6. */
export const DEFAULT_QUOTE_DECIMALS = 6;

/**
 * One stable's DEX quotes for 1 native coin, as the shell decodes them out of
 * the multicall. Each stable is its OWN group so its own decimals normalise
 * the amount — USDC (6) and DAI (18) must never be compared under one shared
 * scale.
 */
export interface NativeQuoteGroup {
  /**
   * Successful quote outputs in THIS stable's base units, as decimal strings
   * (failed calls are simply absent). Strings, not `bigint`, because that is
   * the shape that crosses the wasm boundary losslessly.
   */
  amountsOut: string[];
  /** This stable's `decimals()` read; `null` = it failed → {@link DEFAULT_QUOTE_DECIMALS}. */
  quoteDecimals: number | null;
}

/** Where the chosen native price came from — surfaced in the price log. */
export type NativePriceSource =
  | 'none'
  | 'DEX'
  | 'Chainlink(sanity)'
  | 'Chainlink(local)'
  | 'Chainlink(ETH)';

export interface NativePrice {
  price: number | null;
  source: NativePriceSource;
}

/** What `f64::from_str` accepts, minus the `inf`/`nan` words the gates drop anyway. */
const DECIMAL_F64 = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * `best_group_price` — the deepest-pool price within ONE quote token. For a
 * fixed input a more-liquid pool returns more output (less slippage), so the
 * max is the least-distorted price and it routes around a broken/near-empty
 * pool quoting garbage. Non-positive and unparseable outputs are skipped.
 */
function bestGroupPrice(group: NativeQuoteGroup): number | null {
  const decimals = group.quoteDecimals ?? DEFAULT_QUOTE_DECIMALS;
  const scale = 10 ** decimals;
  let best: number | null = null;
  for (const amount of group.amountsOut) {
    const text = amount.trim();
    // Rust's `f64::from_str` reads sign / digits / dot / exponent and nothing
    // else; bare `Number()` would additionally read `0x…`, `0b…` and
    // `Infinity`. Real inputs are `bigint.toString()`, so the difference is
    // unreachable — but the two copies must not disagree on ANY input the
    // caller could hand them, which is exactly what the drift gate asserts.
    if (!DECIMAL_F64.test(text)) continue;
    const value = Number(text);
    if (!(value > 0) || !Number.isFinite(value)) continue;
    const price = value / scale;
    if (best == null || price > best) best = price;
  }
  return best;
}

/**
 * `best_native_dex_price` — the cross-stable max. X Layer's WOKB/USDC pool is
 * near-empty and quotes OKB at ~$5 while WOKB/USD₮0 holds the liquid one at
 * ~$81; taking the first group that answered would lock in the junk.
 */
export function bestNativeDexPrice(groups: NativeQuoteGroup[]): number | null {
  let best: number | null = null;
  for (const group of groups) {
    const price = bestGroupPrice(group);
    if (price != null && (best == null || price > best)) best = price;
  }
  return best;
}

/**
 * `choose_native_price` — the source ladder and its sanity band. DEX is
 * preferred, but a DEX price that deviates beyond ratio (0.5, 2.0) against the
 * best Chainlink read means the pool is too thin to trust, so Chainlink wins.
 *
 * `onChainClPrice` carries the core's `is_finite && > 0` decode gate with it,
 * so a feed that decoded to 0 falls through to the Ethereum-mainnet read
 * instead of dividing by it (`ratio = Infinity` fails the band and would
 * otherwise publish $0 as the price of the chain's native coin). The
 * Ethereum-mainnet fallback is deliberately ungated, verbatim with the core.
 */
export function chooseNativePrice(
  dexPrice: number | null,
  onChainClPrice: number | null,
  ethClPrice: number | null,
): NativePrice {
  const localCl =
    onChainClPrice != null && Number.isFinite(onChainClPrice) && onChainClPrice > 0
      ? onChainClPrice
      : null;
  const clBestPrice = localCl ?? ethClPrice;
  if (dexPrice != null && clBestPrice != null) {
    const ratio = dexPrice / clBestPrice;
    return ratio > 0.5 && ratio < 2.0
      ? { price: dexPrice, source: 'DEX' }
      : { price: clBestPrice, source: 'Chainlink(sanity)' };
  }
  if (dexPrice != null) return { price: dexPrice, source: 'DEX' };
  if (localCl != null) return { price: localCl, source: 'Chainlink(local)' };
  if (ethClPrice != null) return { price: ethClPrice, source: 'Chainlink(ETH)' };
  return { price: null, source: 'none' };
}
