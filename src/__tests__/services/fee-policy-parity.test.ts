/**
 * Fee-policy DRIFT GATE — the TypeScript half.
 *
 * Five fee decisions exist twice on purpose and cannot be de-duplicated: iOS and
 * Android run Hermes, which has no WebAssembly, so THIS copy is what native
 * actually executes, while web executes the Rust core
 * (`rust/crates/vela-core/src/app/fee_policy.rs`). Neither copy may be deleted —
 * so instead both replay one shared oracle, and a change to either side that the
 * other does not follow turns exactly one of the two suites red:
 *
 *   1. the gas-tier multiplier table          (`safe-transaction.ts` GAS_TIER_MULTIPLIERS)
 *   2. the in-band reimbursement formula      (`calculateInBandFeeAmount`)
 *   3. the Tempo stablecoin reimbursement     (`tempoReimbursement`)
 *   4. the fee-row balance<fee selectability  (`feeRowInsufficient`)
 *   5. the Tempo realistic-gas model            (`tempoExpectedGas`)
 *
 * (5) is the one that produces the `expected_gas` (3) merely consumes: before it
 * existed, `TEMPO_PER_SUBCALL_GAS_EST` could be edited on the TypeScript side
 * alone and every suite in the repo stayed green while web and native quoted
 * different Tempo fees.
 *
 * The corpus lives with the core so a Rust-only change cannot forget it; the Rust
 * replay is `rust/crates/vela-core/tests/app_fee_policy_parity.rs`.
 *
 * Following the identicon corpus precedent (`identicon.test.ts`), the numbers are
 * decimal STRINGS — never JSON numbers — so nothing past 2^53 can be mangled on
 * the way in.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  calculateInBandFeeAmount,
  feeRowInsufficient,
  GAS_TIER_MULTIPLIERS,
  type GasTier,
} from '@/services/safe-transaction';
import { tempoExpectedGas, tempoReimbursement } from '@/services/tempo';

interface AssetInput {
  is_native: boolean;
  decimals: number;
  usd_price: string | null;
}

interface VectorCase {
  name: string;
  fn: string;
  input: Record<string, unknown>;
  expect: Record<string, unknown>;
}

const corpus: { suite: string; cases: VectorCase[] } = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../rust/crates/vela-core/tests/vectors-fee-policy/fee-policy.json'),
    'utf8',
  ),
);

const casesFor = (fn: string) => corpus.cases.filter((c) => c.fn === fn);

/** The corpus's asset shape → the argument `calculateInBandFeeAmount` takes. */
const asset = (raw: AssetInput) => ({
  asset: (raw.is_native ? 'native' : 'erc20') as 'native' | 'erc20',
  decimals: raw.decimals,
  usdPrice: raw.usd_price,
});

const big = (v: unknown) => BigInt(v as string);
const optBig = (v: unknown) => (v === null || v === undefined ? null : BigInt(v as string));

describe('fee policy parity — TypeScript (native) vs the Rust core (web)', () => {
  it('has the whole corpus to check against', () => {
    // Guards the failure mode where a moved/renamed/shrunken corpus turns this
    // entire suite into a green no-op.
    expect(corpus.suite).toBe('fee-policy');
    expect(casesFor('tier_multiplier').length).toBe(4);
    expect(casesFor('in_band_fee').length).toBeGreaterThanOrEqual(23);
    expect(casesFor('tempo_reimbursement').length).toBeGreaterThanOrEqual(7);
    expect(casesFor('fee_row_insufficient').length).toBeGreaterThanOrEqual(4);
    expect(casesFor('tempo_expected_gas').length).toBeGreaterThanOrEqual(5);
  });

  it('covers fee-token precisions other than 6 decimals', () => {
    // The structural hole that let a 12,600x undercharge ship green: EVERY
    // in-band vector and EVERY quote scenario used a 6-decimal stablecoin, so
    // the conversion's `nativeAmount x usdPrice x 10^decimals` numerator never
    // came near the 128-bit ceiling and the Rust half's clamped-then-divided
    // result stayed plausible. DAI is 18; USDT and USDC on BNB Chain are 18;
    // WBTC is 8. A count alone would not have caught it — the PRECISIONS are
    // the coverage.
    const erc20Decimals = new Set(
      casesFor('in_band_fee')
        .filter((c) => !(c.input.fee_asset as AssetInput).is_native)
        .map((c) => (c.input.fee_asset as AssetInput).decimals),
    );
    for (const d of [0, 6, 8, 18]) expect([...erc20Decimals]).toContain(d);

    const tempoDecimals = new Set(casesFor('tempo_reimbursement').map((c) => c.input.decimals as number));
    for (const d of [0, 6, 18]) expect([...tempoDecimals]).toContain(d);
  });

  it.each(casesFor('tier_multiplier').map((c) => [c.name, c] as const))(
    'gas tier: %s',
    (_name, c) => {
      const m = GAS_TIER_MULTIPLIERS[c.input.tier as GasTier];
      expect({ num: m.num.toString(), den: m.den.toString() }).toEqual(c.expect);
    },
  );

  it.each(casesFor('in_band_fee').map((c) => [c.name, c] as const))(
    'in-band fee: %s',
    (_name, c) => {
      const amount = calculateInBandFeeAmount(
        big(c.input.total_gas),
        big(c.input.gas_price),
        asset(c.input.fee_asset as AssetInput),
        asset(c.input.native_asset as AssetInput),
      );
      expect({ amount: amount === null ? null : amount.toString() }).toEqual(c.expect);
    },
  );

  it.each(casesFor('tempo_reimbursement').map((c) => [c.name, c] as const))(
    'tempo reimbursement: %s',
    (_name, c) => {
      const amount = tempoReimbursement(
        big(c.input.expected_gas),
        big(c.input.gas_price_atto),
        c.input.decimals as number,
      );
      expect({ amount: amount.toString() }).toEqual(c.expect);
    },
  );

  it.each(casesFor('fee_row_insufficient').map((c) => [c.name, c] as const))(
    'fee-row selectability: %s',
    (_name, c) => {
      expect({ value: feeRowInsufficient(big(c.input.balance), optBig(c.input.amount)) })
        .toEqual(c.expect);
    },
  );

  it.each(casesFor('tempo_expected_gas').map((c) => [c.name, c] as const))(
    'tempo expected gas: %s',
    (_name, c) => {
      const gas = tempoExpectedGas(c.input.deployed as boolean, c.input.sub_calls as number);
      expect({ gas: gas.toString() }).toEqual(c.expect);
    },
  );
});
