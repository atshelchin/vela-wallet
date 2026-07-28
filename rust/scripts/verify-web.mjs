#!/usr/bin/env node
/**
 * Replay the conformance corpus through the SHIPPED web artifact.
 *
 * `cargo test` proves the Rust crate matches the corpus; this proves the thing
 * that actually reaches a browser does too — the base64-embedded module, the
 * patched glue, the wasm-bindgen boundary and its JS type conversions. A green
 * `cargo test` with a red run here would mean the build pipeline, not the core,
 * broke (spec SC-001 covers web as its own surface).
 *
 * Usage: node rust/scripts/verify-web.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUST_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VECTORS_DIR = join(RUST_DIR, 'crates', 'vela-core', 'tests', 'vectors');

const { initSync, ...wasm } = await import(join(RUST_DIR, 'pkg-web', 'vela_core.js'));
const { WASM_BASE64 } = await import(join(RUST_DIR, 'pkg-web', 'vela_core_bg.base64.js'));

initSync({ module: Buffer.from(WASM_BASE64, 'base64') });

const hex = (bytes) => '0x' + Buffer.from(bytes).toString('hex');
const bytes = (s) => Buffer.from(s.startsWith('0x') ? s.slice(2) : s, 'hex');

/** One arm per contracts/core-api.md function — mirrors conformance.rs. */
const DISPATCH = {
  keccak256: (i) => hex(wasm.keccak256(bytes(i.data))),
  sha256: (i) => hex(wasm.sha256(bytes(i.data))),
  to_hex: (i) => wasm.toHex(bytes(i.data), i.prefixed),
  from_hex: (i) => hex(wasm.fromHex(i.s)),
  to_quantity: (i) => wasm.toQuantity(i.value),
  checksum_address: (i) => wasm.checksumAddress(i.address_hex),
  function_selector: (i) => hex(wasm.functionSelector(i.signature)),
  create2_address: (i) => wasm.create2Address(i.deployer_hex, bytes(i.salt), bytes(i.init_code_hash)),
  to_base64url: (i) => wasm.toBase64Url(bytes(i.data)),
  from_base64url: (i) => hex(wasm.fromBase64Url(i.s)),
  abi_encode_address: (i) => hex(wasm.abiEncodeAddress(i.address_hex)),
  abi_encode_uint256: (i) => hex(wasm.abiEncodeUint256(i.value_hex)),
  abi_encode_bytes32: (i) => hex(wasm.abiEncodeBytes32(bytes(i.data))),
  canonicalize_signature: (i) => wasm.canonicalizeSignature(i.sig),
  compute_selector: (i) => wasm.computeSelector(i.sig),
  match_selector: (i) => wasm.matchSelector(i.sig, bytes(i.calldata)),
  decode_calldata: (i) => wasm.decodeCalldata(i.sig, bytes(i.calldata)),
  hash_typed_data: (i) => hex(wasm.hashTypedData(i.typed_data_json)),
  encode_type: (i) => wasm.encodeType(i.typed_data_json),
  parse_public_key: (i) => wasm.parsePublicKey(i.hex),
  compute_safe_address: (i) => wasm.computeSafeAddress(bytes(i.x), bytes(i.y)),
  compute_splitter_address: (i) => wasm.computeSplitterAddress(i.treasury_hex),
  encode_splitter_deploy_call: (i) => hex(wasm.encodeSplitterDeployCall(i.treasury_hex)),
  safe_proxy_runtime_code: () => wasm.safeProxyRuntimeCode(),
  extract_attestation_public_key: (i) => wasm.extractAttestationPublicKey(bytes(i.attestation_object)),
  der_signature_to_raw_low_s: (i) => hex(wasm.derSignatureToRawLowS(bytes(i.der))),
  validate_client_data: (i) => {
    wasm.validateClientData(i.kind.toLowerCase(), bytes(i.client_data_json), bytes(i.authenticator_data));
    return true;
  },
  webauthn_signing_hash: (i) => hex(wasm.webauthnSigningHash(bytes(i.authenticator_data), bytes(i.client_data_json))),
  recover_public_key_from_assertions: (i) => {
    const key = wasm.recoverPublicKeyFromAssertions(
      bytes(i.a.authenticator_data), bytes(i.a.client_data_json), bytes(i.a.signature_der),
      bytes(i.b.authenticator_data), bytes(i.b.client_data_json), bytes(i.b.signature_der),
    );
    return key ? `04${key.x.slice(2)}${key.y.slice(2)}` : null;
  },
};

/** Compare an actual value against the vector's `expect`, matching conformance.rs. */
function check(expect, actual) {
  if ('value' in expect) {
    const want = expect.value;
    const got = typeof actual === 'object' && actual !== null && !Array.isArray(actual)
      ? actual
      : actual;
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      return `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
    }
    return null;
  }
  // Field-wise object expectation (parse_public_key, compute_safe_address).
  for (const [key, want] of Object.entries(expect)) {
    if (key === 'error') continue;
    const got = actual?.[key];
    if (want !== got) return `field \`${key}\`: expected ${want}, got ${got}`;
  }
  return null;
}

let total = 0;
const failures = [];

for (const file of readdirSync(VECTORS_DIR).sort()) {
  if (!file.endsWith('.json')) continue;
  const suite = JSON.parse(readFileSync(join(VECTORS_DIR, file), 'utf8'));
  for (const c of suite.cases) {
    total++;
    const run = DISPATCH[c.fn];
    if (!run) {
      failures.push(`${suite.suite}::${c.name} — no dispatch arm for \`${c.fn}\``);
      continue;
    }
    let actual;
    let thrown = null;
    try {
      actual = run(c.input);
    } catch (e) {
      thrown = e;
    }
    const expectedError = c.expect.error;
    if (expectedError) {
      if (!thrown) {
        failures.push(`${suite.suite}::${c.name} — expected error ${expectedError}, got ${JSON.stringify(actual)}`);
      } else if (thrown.code !== expectedError) {
        failures.push(`${suite.suite}::${c.name} — expected error ${expectedError}, got ${thrown.code ?? thrown}`);
      }
      continue;
    }
    if (thrown) {
      failures.push(`${suite.suite}::${c.name} — expected success, threw ${thrown.code ?? thrown}`);
      continue;
    }
    const problem = check(c.expect, actual);
    if (problem) failures.push(`${suite.suite}::${c.name} — ${problem}`);
  }
}

if (failures.length) {
  console.error(`verify-web: ${failures.length} of ${total} cases FAILED:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`verify-web: ${total} conformance cases green through the shipped web artifact`);
