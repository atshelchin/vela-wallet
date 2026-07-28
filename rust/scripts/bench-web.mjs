#!/usr/bin/env node
/**
 * SC-004 evidence: is the shared core at least as fast as the TypeScript it
 * replaces on the signing path, and measurably faster on the hot spot the spec
 * names (P-256 recovery, currently BigInt elliptic-curve math)?
 *
 * Measures the SHIPPED wasm artifact, then compares against the legacy timings
 * written by `npm run bench:legacy` (which must run first — the legacy modules
 * are TypeScript and jest is the repo's only TS runner). Both halves use the
 * same measurement method on the same machine.
 *
 * Usage:
 *   npm run bench:legacy && node rust/scripts/bench-web.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUST_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const LEGACY_FILE = join(RUST_DIR, 'target', 'bench-legacy.json');

if (!existsSync(LEGACY_FILE)) {
  console.error(
    `bench-web: no legacy timings at ${LEGACY_FILE}.\nRun \`npm run bench:legacy\` first.`,
  );
  process.exit(1);
}
const legacy = JSON.parse(readFileSync(LEGACY_FILE, 'utf8'));

const { initSync, ...wasm } = await import(join(RUST_DIR, 'pkg-web', 'vela_core.js'));
const { WASM_BASE64 } = await import(join(RUST_DIR, 'pkg-web', 'vela_core_bg.base64.js'));
initSync({ module: Buffer.from(WASM_BASE64, 'base64') });

const bytes = (s) => Buffer.from(s.startsWith('0x') ? s.slice(2) : s, 'hex');

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Median ms per operation over 5 rounds, after a warm-up. Mirrors the legacy half. */
function bench(fn, iterations) {
  for (let i = 0; i < Math.min(20, iterations); i++) fn();
  const samples = [];
  for (let round = 0; round < 5; round++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1e6 / iterations);
  }
  return median(samples);
}

const core = {};

// keccak256 — 1 KiB payload
{
  const payload = new Uint8Array(1024).map((_, i) => (i * 7) & 0xff);
  core.keccak256 = bench(() => wasm.keccak256(payload), 2000);
}

// decodeCalldata — the signing-sheet trust root
{
  const sig = 'transfer(address _to, uint256 _value)';
  const calldata = bytes(
    'a9059cbb' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
      '000000000000000000000000000000000000000000000000000000003b9aca00',
  );
  core.decodeCalldata = bench(() => wasm.decodeCalldata(sig, calldata), 2000);
}

// computeSafeAddress — the wallet identity
{
  const pubKey =
    'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90' +
    'b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6';
  const x = bytes(pubKey.slice(0, 64));
  const y = bytes(pubKey.slice(64));
  core.computeSafeAddress = bench(() => wasm.computeSafeAddress(x, y), 500);
}

// P-256 recovery — same fixtures the legacy half measured
{
  const [a, b] = legacy.fixtures.map((f) => ({
    authData: bytes(f.authData),
    clientData: bytes(f.clientData),
    der: bytes(f.der),
  }));
  core.recovery = bench(
    () =>
      wasm.recoverPublicKeyFromAssertions(
        a.authData, a.clientData, a.der,
        b.authData, b.clientData, b.der,
      ),
    20,
  );
}

console.log('vela-core vs legacy TypeScript — median of 5 rounds, ms per operation\n');
const LABELS = {
  keccak256: 'keccak256 (1 KiB)',
  decodeCalldata: 'decodeCalldata (ERC-20 transfer)',
  computeSafeAddress: 'computeAddress (Safe identity)',
  recovery: 'recoverPublicKey (2 assertions)',
};

const regressions = [];
for (const [key, label] of Object.entries(LABELS)) {
  const c = core[key];
  const l = legacy.results[key];
  const ratio = l / c;
  const verdict = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`;
  console.log(
    `${label.padEnd(34)} core ${c.toFixed(4)} ms   legacy ${l.toFixed(4)} ms   → ${verdict}`,
  );
  // 10% tolerance: this is a wall-clock measurement on a shared machine, not a
  // controlled benchmark, and the claim is "no slower", not "always faster".
  if (ratio < 0.9) regressions.push(label);
}

console.log('');
if (regressions.length) {
  console.error(`bench-web: SC-004 NOT met — slower than legacy on: ${regressions.join(', ')}`);
  process.exit(1);
}
console.log('bench-web: SC-004 met — no signing-path operation is slower than the legacy TypeScript');
