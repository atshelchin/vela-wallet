/**
 * The never-unlimited CAPS, checked against the Rust core byte for byte.
 *
 * Two numbers carry the whole "unlimited can never leave the wallet" invariant,
 * and they exist twice on purpose: the Rust core enforces the mandate on web,
 * while `services/approval-guard.ts` enforces it on iOS/Android (Hermes has no
 * WebAssembly, so the TypeScript copy is the only guard there). Neither copy can
 * be deleted — so the thing to remove is not the duplication but the *drift*.
 *
 * A red test here means one platform would now refuse an approval the other
 * waves through: raise the TS cap alone and native starts signing grants web
 * blocks; raise the Rust cap alone and web starts signing grants native blocks.
 * Same spirit as the identicon / conformance-vector parity suites — the Rust
 * source is the oracle, read at test time rather than transcribed into a
 * snapshot that can be updated without anyone looking at the other side.
 *
 * (`rust/crates/vela-core/tests/app_approval_guard.rs` pins the Rust side to the
 * same two exponents from within cargo, so a one-sided edit is red on both
 * toolchains rather than only this one.)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  UNLIMITED_CAP_256,
  UNLIMITED_CAP_160,
  capForBits,
} from '@/services/approval-guard';

const RUST_SOURCE = resolve(
  __dirname,
  '../../../rust/crates/vela-core/src/app/approval_guard.rs',
);

const rust = readFileSync(RUST_SOURCE, 'utf8');

/**
 * Evaluate ONE `U256::from_limbs` limb literal. Deliberately narrow: only the
 * forms the core actually uses (`0`, `1 << 8`, a plain or hex integer) parse, and
 * anything else throws rather than being silently read as zero. If someone
 * rewrites the constant in a shape this doesn't understand, the test fails loudly
 * and a human re-checks the parity instead of the gate quietly going green.
 */
function evalLimb(literal: string): bigint {
  const src = literal.trim().replace(/_/g, '').replace(/u(8|16|32|64|size)$/, '');
  const shift = /^(\d+|0x[0-9a-fA-F]+)\s*<<\s*(\d+)$/.exec(src);
  if (shift) return BigInt(shift[1]) << BigInt(shift[2]);
  if (/^(\d+|0x[0-9a-fA-F]+)$/.test(src)) return BigInt(src);
  throw new Error(`unparseable U256 limb literal: ${JSON.stringify(literal)}`);
}

/**
 * Read `pub const <name>: U256 = U256::from_limbs([l0, l1, l2, l3]);` out of the
 * core and rebuild the number. alloy's limbs are four little-endian u64 words.
 */
function rustCap(name: string): bigint {
  const re = new RegExp(
    `pub const ${name}\\s*:\\s*U256\\s*=\\s*U256::from_limbs\\(\\[([^\\]]*)\\]\\)\\s*;`,
  );
  const m = re.exec(rust);
  if (!m) throw new Error(`${name} not found in ${RUST_SOURCE} — did the core rename or restate it?`);
  const limbs = m[1].split(',').map(evalLimb);
  if (limbs.length !== 4) throw new Error(`${name}: expected 4 u64 limbs, got ${limbs.length}`);
  return limbs.reduce((acc, limb, i) => acc + (limb << BigInt(64 * i)), 0n);
}

describe('unlimited-approval caps: TypeScript ↔ Rust core parity', () => {
  it('finds both constants in the core (a moved file must not turn this suite into a no-op)', () => {
    expect(rust).toContain('pub const UNLIMITED_CAP_256');
    expect(rust).toContain('pub const UNLIMITED_CAP_160');
  });

  it('uint256 amount cap is identical on both sides', () => {
    expect(UNLIMITED_CAP_256).toBe(rustCap('UNLIMITED_CAP_256'));
  });

  it('Permit2 uint160 amount cap is identical on both sides', () => {
    expect(UNLIMITED_CAP_160).toBe(rustCap('UNLIMITED_CAP_160'));
  });

  it('both sides map field width → cap the same way (a swapped pair is as bad as a wrong value)', () => {
    expect(capForBits(256)).toBe(UNLIMITED_CAP_256);
    expect(capForBits(160)).toBe(UNLIMITED_CAP_160);
    const arms = /pub fn cap_for_bits\([^)]*\)\s*->\s*U256\s*\{([\s\S]*?)\n\}/.exec(rust);
    if (!arms) throw new Error(`cap_for_bits not found in ${RUST_SOURCE}`);
    expect(arms[1]).toMatch(/AmountBits::B160\s*=>\s*UNLIMITED_CAP_160/);
    expect(arms[1]).toMatch(/AmountBits::B256\s*=>\s*UNLIMITED_CAP_256/);
  });

  it('the caps still sit where the invariant needs them (well above real amounts, below the sentinels)', () => {
    // Documented in both files: legitimate approvals top out around 2^128, the
    // "unlimited" sentinels are 2^160-1 / 2^255 / 2^256-1. Pins the absolute
    // position too, so a coordinated edit that keeps both sides equal but moves
    // them into either neighbour is still caught.
    expect(UNLIMITED_CAP_256).toBe(1n << 200n);
    expect(UNLIMITED_CAP_160).toBe(1n << 152n);
  });
});
