/**
 * Backward-compat regression: the single-key surface must be byte-identical
 * to what production shipped before the multi-key addition. Anchors:
 * (1) the parallel-space fixture keys → frozen golden addresses (the first
 *     is a REAL deployed Safe on Gnosis: 0xD400866e…), via BOTH
 *     computeSafeAddress and computeSafeAddressMulti with one key;
 * (2) every compute_safe_address conformance vector (dumped from the
 *     production TypeScript) — address, setup_data and salt_nonce.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { p256 } from '@noble/curves/p256';
import { hexToBytes, wasm, REPO } from './core';

let fail = 0;
const check = (label: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ' (want ' + want + ')'}`);
};

const goldens: [string, string][] = [
  ['d80133c59ce0943689a9c1ff6006242c27b19412439fbc88f94feb5ca1e802d5', '0xD400866e00B055B20752a826CD5C89b811de130b'],
  ['6e1ebe95f2f14d70b193aedbfe87c3d495943c19fb04a81c163cf92ae384c59f', '0x031d7D57c99CAF891e1C250554691Fd12D84772b'],
  ['e66f17e63e4b6e1a6c8a31086d86bcb3172816bec70a5221576c1e2a2ae1f336', '0x58cd0ce6A27099220543b31710d7860d75Ba1d3d'],
];
for (const [i, [priv, want]] of goldens.entries()) {
  const pub = p256.getPublicKey(hexToBytes(priv), false);
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  check(`fixture ${i} single`, wasm.computeSafeAddress(x, y).address, want);
  const flat = new Uint8Array(64);
  flat.set(x, 0);
  flat.set(y, 32);
  check(`fixture ${i} multi1 `, wasm.computeSafeAddressMulti(flat).address, want);
}

// Multi-key golden: the triple-verified 3-key anchor (foundry cast,
// independent probe, and the deployed-wallet code path) plus the wasm
// flat-bytes error shape.
{
  const anchor = [
    ['8f9b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff0', '7a8b9cadbecfd0e1f20314253647586970818293a4b5c6d7e8f9010203040506'],
    ['0000000000000000000000000000000000000000000000000000000000000001', '0000000000000000000000000000000000000000000000000000000000000002'],
    ['04d2163f5c2c9a5a3f0e1d2c3b4a59687766554433221100ffeeddccbbaa9988', '1122334455667788990a0b0c0d0e0f102132435465768798a9bacbdcedfe0f21'],
  ];
  const flat = new Uint8Array(anchor.length * 64);
  anchor.forEach(([x, y], i) => {
    flat.set(hexToBytes(x), i * 64);
    flat.set(hexToBytes(y), i * 64 + 32);
  });
  check('three-key anchor', wasm.computeSafeAddressMulti(flat).address, '0x5AF6Cd8689C013192e157826f7C4574d7C2f9446');
  let errCode = 'no error';
  try {
    wasm.computeSafeAddressMulti(new Uint8Array(65));
  } catch (e) {
    errCode = (e as { code?: string }).code ?? 'unshaped';
  }
  check('flat-bytes error shape', errCode, 'InvalidPublicKey');
}

const vectors = JSON.parse(
  readFileSync(join(REPO, 'rust/crates/vela-core/tests/vectors/safe.json'), 'utf8'),
) as { cases: Array<{ fn: string; name: string; input: { x: string; y: string }; expect: Record<string, string> }> };
for (const c of vectors.cases) {
  if (c.fn !== 'compute_safe_address' || c.expect.error) continue;
  const info = wasm.computeSafeAddress(hexToBytes(c.input.x), hexToBytes(c.input.y));
  check(`vector ${c.name} addr `, info.address, c.expect.address);
  check(`vector ${c.name} setup`, info.setup_data, c.expect.setup_data);
  check(`vector ${c.name} salt `, info.salt_nonce, c.expect.salt_nonce);
}
process.exit(fail ? 1 : 0);
