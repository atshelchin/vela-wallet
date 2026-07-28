/**
 * Measure the LEGACY TypeScript implementations on the signing-path operations.
 *
 * Half of the SC-004 evidence: this runs under jest (the only TS runner in the
 * repo) and writes timings to JSON; `rust/scripts/bench-web.mjs` measures the
 * shipped wasm the same way and compares. Two processes, same machine, same V8.
 *
 * Not a correctness test — it asserts nothing about values, only that each
 * operation ran. Regenerate with `npm run bench:legacy`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { webcrypto } from 'node:crypto';
import { keccak256 } from '@/services/eth-crypto';
import { sha256 } from '@/services/sha256';
import { decodeCalldata } from '@/services/abi-decode';
import { computeAddress } from '@/services/safe-address';
import { recoverPublicKeyFromAssertions } from '@/services/p256-recovery';
import { toHex } from '@/services/hex';

const OUT = path.join(__dirname, '..', '..', 'rust', 'target', 'bench-legacy.json');

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Median ms per operation over 5 rounds, after a warm-up. */
function bench(fn: () => unknown, iterations: number): number {
  for (let i = 0; i < Math.min(20, iterations); i++) fn();
  const samples: number[] = [];
  for (let round = 0; round < 5; round++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1e6 / iterations);
  }
  return median(samples);
}

/** Minimal DER encoding of a raw r‖s signature. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const derInt = (b: Uint8Array): number[] => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let body = Array.from(b.slice(i));
    if (body[0] & 0x80) body = [0, ...body];
    return [0x02, body.length, ...body];
  };
  const r = derInt(raw.slice(0, 32));
  const s = derInt(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

jest.setTimeout(300_000);

test('bench legacy implementations', async () => {
  const results: Record<string, number> = {};

  const payload = new Uint8Array(1024).map((_, i) => (i * 7) & 0xff);
  results.keccak256 = bench(() => keccak256(payload), 2000);

  const sig = 'transfer(address _to, uint256 _value)';
  const calldata =
    '0xa9059cbb' +
    '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
    '000000000000000000000000000000000000000000000000000000003b9aca00';
  results.decodeCalldata = bench(() => decodeCalldata(calldata, sig), 2000);

  const pubKey =
    '04a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9' +
    '0b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6';
  results.computeSafeAddress = bench(() => computeAddress(pubKey), 500);

  // P-256 recovery — the hot spot SC-004 names (BigInt elliptic-curve math).
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const fixtures: { authData: Uint8Array; clientData: Uint8Array; der: Uint8Array }[] = [];
  for (const challenge of ['Y2hhbGxlbmdlLTE', 'Y2hhbGxlbmdlLTI']) {
    const authData = new Uint8Array(37);
    authData.set(sha256(new TextEncoder().encode('getvela.app')), 0);
    authData[32] = 0x05;
    authData[36] = 1;
    const clientData = new TextEncoder().encode(
      `{"type":"webauthn.get","challenge":"${challenge}","origin":"https://getvela.app"}`,
    );
    const message = new Uint8Array(authData.length + 32);
    message.set(authData);
    message.set(sha256(clientData), authData.length);
    const rawSig = new Uint8Array(
      await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, message),
    );
    fixtures.push({ authData, clientData, der: rawToDer(rawSig) });
  }
  const asRecoverable = (f: (typeof fixtures)[number]) => ({
    signatureHex: toHex(f.der),
    authenticatorDataHex: toHex(f.authData),
    clientDataJSONHex: toHex(f.clientData),
  });
  const [a, b] = fixtures;
  results.recovery = bench(
    () => recoverPublicKeyFromAssertions(asRecoverable(a), asRecoverable(b)),
    20,
  );

  // Hand the wasm-side benchmark the exact same recovery inputs, so the two
  // processes measure the same work rather than two different key pairs.
  const fixturesOut = fixtures.map((f) => ({
    authData: toHex(f.authData),
    clientData: toHex(f.clientData),
    der: toHex(f.der),
  }));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ results, fixtures: fixturesOut }, null, 1) + '\n');
  console.log(`legacy bench → ${OUT}`);
  expect(Object.keys(results)).toHaveLength(4);
});
