/**
 * Drift gates for the tables and constants that exist TWICE — once in the Rust
 * core and once in TypeScript that survives from the retired native path with
 * live callers of its own.
 *
 * Until the TS copies retire, the only defence against a one-sided edit is
 * an assertion that reads both. Same shape as the `SUPPORTED_LANGUAGES` gate in
 * `i18n/web-adapter.test.ts`: the Rust file is parsed as text (a table literal
 * is exactly what a regex is good at), and the values — never the formatting —
 * are compared.
 *
 * A red test here means the two platforms would disagree about money:
 *
 *   - `STABLE_SYMBOLS` decides the `usd` string written into a received record
 *     (`activity.ts`) AND the ≈$1 fallback applied when that record is rendered
 *     (`activity_feed.rs::tx_usd_value`). Out of step, one received USDT is
 *     stored at $1 and displayed at $0.00.
 *   - `KNOWN_TOKENS` is the curated symbol/decimals table. A wrong decimals
 *     mis-scales every amount shown for that token.
 *   - `DEFAULT_MONITOR_CHAINS` is which chains a brand-new wallet watches for
 *     its first receipt. A chain in only one list is unwatched on one platform.
 *   - The native-price sanity band is what stops a near-empty pool from pricing
 *     the user's whole wallet.
 */
// `activity.ts` pulls the i18n singleton in for its label strings, which reaches
// expo-localization (ESM, untransformed here). Nothing below is a localized
// string — these are tables and numbers.
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k, language: 'en' } }));
jest.mock('react-native', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { STABLE_SYMBOLS, DEFAULT_MONITOR_CHAINS } from '@/services/activity';
import { NATIVE_TRANSFER_SENTINEL, TRANSFER_TOPIC as SIM_TRANSFER_TOPIC } from '@/services/sim-assets';
import { KNOWN_TOKENS } from '@/services/tokens';
import {
  LIVE_SCAN_BLOCKS,
  NATIVE_LOG_ADDRESSES,
  TRANSFER_TOPIC,
} from '@/services/transfer-monitor';
import { chooseNativePrice, DEFAULT_QUOTE_DECIMALS } from '@/services/wallet-api';

const REPO = resolve(__dirname, '../../..');
const rust = (path: string) => readFileSync(resolve(REPO, 'rust/crates/vela-core/src', path), 'utf8');

const ACTIVITY_FEED_RS = rust('app/activity_feed.rs');
const TOKEN_TRUST_RS = rust('app/token_trust.rs');
const BALANCE_DASHBOARD_RS = rust('app/balance_dashboard.rs');

/** The `[...]` body of a `pub const NAME: ... = [ ... ];` item. */
function constArrayBody(source: string, name: string): string {
  const match = new RegExp(`pub const ${name}\\s*:[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(source);
  expect(match).not.toBeNull();
  return match![1];
}

describe('stablecoin ≈$1 table (activity.ts ⇄ activity_feed.rs)', () => {
  it('lists exactly the same symbols on both sides', () => {
    const body = constArrayBody(ACTIVITY_FEED_RS, 'STABLE_SYMBOLS');
    const rustSymbols = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    // Guards the failure mode where a rename turns this whole gate into a
    // green no-op.
    expect(rustSymbols.length).toBeGreaterThan(0);
    expect([...rustSymbols].sort()).toEqual([...STABLE_SYMBOLS].sort());
  });

  it('declares the same entry count in the Rust array type', () => {
    const declared = /pub const STABLE_SYMBOLS:\s*\[&str;\s*(\d+)\]/.exec(ACTIVITY_FEED_RS);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(STABLE_SYMBOLS.size);
  });
});

describe('curated known-token table (tokens.ts ⇄ token_trust.rs)', () => {
  it('agrees on every address, symbol and decimals', () => {
    const body = constArrayBody(TOKEN_TRUST_RS, 'KNOWN_TOKENS');
    const rows = [...body.matchAll(/\(\s*"(0x[0-9a-fA-F]+)"\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*\)/g)];
    expect(rows.length).toBeGreaterThan(0);

    const fromRust = rows.map((m) => [m[1], m[2], Number(m[3])] as const);
    const fromTs = Object.entries(KNOWN_TOKENS).map(
      ([addr, meta]) => [addr, meta.symbol, meta.decimals] as const,
    );

    const key = (row: readonly [string, string, number]) => `${row[0]}|${row[1]}|${row[2]}`;
    expect(fromRust.map(key).sort()).toEqual(fromTs.map(key).sort());
  });

  it('declares the same entry count in the Rust array type', () => {
    const declared = /pub const KNOWN_TOKENS:\s*\[\(&str,\s*&str,\s*u32\);\s*(\d+)\]/.exec(TOKEN_TRUST_RS);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(Object.keys(KNOWN_TOKENS).length);
  });
});

describe('default monitor chains (activity.ts ⇄ token_trust.rs)', () => {
  it('watches the same chains for a wallet with no balances yet', () => {
    const body = constArrayBody(TOKEN_TRUST_RS, 'DEFAULT_MONITOR_CHAINS');
    // Rust writes them with digit separators (`42_161`).
    const rustChains = [...body.matchAll(/(\d[\d_]*)/g)].map((m) => Number(m[1].replace(/_/g, '')));
    expect(rustChains.length).toBeGreaterThan(0);
    expect(rustChains).toEqual(DEFAULT_MONITOR_CHAINS);
  });
});

describe('transfer-log decoding (transfer-monitor.ts + sim-assets.ts ⇄ token_trust.rs)', () => {
  it('agrees on the Transfer topic across all three copies', () => {
    const declared = /pub const TRANSFER_TOPIC: &str =\s*\n?\s*"(0x[0-9a-f]+)"/.exec(TOKEN_TRUST_RS);
    expect(declared).not.toBeNull();
    expect(declared![1]).toBe(TRANSFER_TOPIC);
    expect(SIM_TRANSFER_TOPIC).toBe(TRANSFER_TOPIC);
  });

  it('agrees on which contract addresses mark a log as a NATIVE transfer', () => {
    const body = constArrayBody(TOKEN_TRUST_RS, 'NATIVE_LOG_ADDRESSES');
    const rustAddrs = [...body.matchAll(/"(0x[0-9a-fA-F]+)"/g)].map((m) => m[1]);
    expect(rustAddrs.length).toBeGreaterThan(0);
    expect([...rustAddrs].sort()).toEqual([...NATIVE_LOG_ADDRESSES].sort());

    // The simulation engines net deltas with a SINGLE sentinel (a sim log never
    // carries the others). It still has to be one the core would call native —
    // otherwise the same receipt reads as an ERC-20 on one path and the native
    // coin on the other.
    expect(rustAddrs).toContain(NATIVE_TRANSFER_SENTINEL);
  });

  it('scans the same incremental window', () => {
    const declared = /pub const LIVE_SCAN_BLOCKS:\s*u64\s*=\s*(\d[\d_]*)/.exec(TOKEN_TRUST_RS);
    expect(declared).not.toBeNull();
    expect(Number(declared![1].replace(/_/g, ''))).toBe(LIVE_SCAN_BLOCKS);
  });
});

describe('native-coin price selection (wallet-api.ts ⇄ balance_dashboard.rs)', () => {
  /** The `ratio > LOW && ratio < HIGH` band, read out of the Rust source. */
  const band = (() => {
    const match = /ratio > ([\d.]+) && ratio < ([\d.]+)/.exec(BALANCE_DASHBOARD_RS);
    expect(match).not.toBeNull();
    return { low: Number(match![1]), high: Number(match![2]) };
  })();

  it('defaults the quote decimals to the same value', () => {
    const declared = /pub const DEFAULT_QUOTE_DECIMALS:\s*u32\s*=\s*(\d+)/.exec(BALANCE_DASHBOARD_RS);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(DEFAULT_QUOTE_DECIMALS);
  });

  it('keeps a DEX price only strictly inside the band Rust declares', () => {
    const cl = 100;
    // Comfortably inside → DEX wins.
    const inside = cl * ((band.low + band.high) / 2);
    expect(chooseNativePrice(inside, cl, null)).toEqual({ price: inside, source: 'DEX' });

    // The bounds themselves are exclusive on both sides…
    expect(chooseNativePrice(cl * band.low, cl, null)).toEqual({ price: cl, source: 'Chainlink(sanity)' });
    expect(chooseNativePrice(cl * band.high, cl, null)).toEqual({ price: cl, source: 'Chainlink(sanity)' });

    // …and a hair INSIDE them is still DEX. Without this pair the gate would
    // sleep through a band tightened on only one side (0.5 → 0.6 keeps every
    // exclusivity assertion above green).
    expect(chooseNativePrice(cl * band.low * 1.001, cl, null).source).toBe('DEX');
    expect(chooseNativePrice(cl * band.high * 0.999, cl, null).source).toBe('DEX');

    // Outside → the thin pool is discarded in favour of the oracle.
    expect(chooseNativePrice(cl * band.low * 0.5, cl, null).source).toBe('Chainlink(sanity)');
    expect(chooseNativePrice(cl * band.high * 2, cl, null).source).toBe('Chainlink(sanity)');
  });

  it('walks the same source ladder Rust enumerates', () => {
    // The enum's variant order IS the ladder: DEX, then the sanity override,
    // then the local feed, then the Ethereum-mainnet fallback.
    const variants = /pub enum NativePriceSource \{([\s\S]*?)\n\}/.exec(BALANCE_DASHBOARD_RS);
    expect(variants).not.toBeNull();
    const names = [...variants![1].matchAll(/^\s*([A-Z]\w*),/gm)].map((m) => m[1]);
    expect(names).toEqual(['Dex', 'ChainlinkSanity', 'ChainlinkLocal', 'ChainlinkEth']);

    expect(chooseNativePrice(81, null, null)).toEqual({ price: 81, source: 'DEX' });
    expect(chooseNativePrice(null, 80, 79)).toEqual({ price: 80, source: 'Chainlink(local)' });
    expect(chooseNativePrice(null, null, 79)).toEqual({ price: 79, source: 'Chainlink(ETH)' });
    expect(chooseNativePrice(null, null, null)).toEqual({ price: null, source: 'none' });
  });
});
