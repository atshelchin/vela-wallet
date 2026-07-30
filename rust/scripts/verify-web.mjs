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

/**
 * Identicon params expectations carry section INDICES, but the binding returns the
 * artwork itself. Build the fragment -> index map out of the corpus's own
 * `section-table` group (all 84 artworks, pinned by full text against the package)
 * rather than importing identicons-esm here — that keeps this script checking the
 * SHIPPED artifact against the SAME committed truth `cargo test` uses.
 */
const fragmentIndex = new Map();
{
  const doc = JSON.parse(readFileSync(join(VECTORS_DIR, 'identicon.json'), 'utf8'));
  for (const c of doc.cases) {
    const m = /^section-table\/(\w+)_(\d+)$/.exec(c.name);
    if (m) fragmentIndex.set(`${m[1]}:${c.expect.value}`, Number(m[2]));
  }
  if (fragmentIndex.size !== 84) {
    console.error(`verify-web: expected 84 section-table cases, found ${fragmentIndex.size}`);
    process.exit(1);
  }
}
const indexOf = (section, svg) => fragmentIndex.get(`${section}:${svg}`) ?? null;

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
  make_hash: (i) => wasm.identiconMakeHash(i.seed),
  identicon_svg: (i) => wasm.identiconSvg(i.seed),
  identicon_svg_circular: (i) => wasm.identiconSvgCircular(i.seed),
  identicon_data_uri: (i) => wasm.identiconDataUri(i.seed),
  normalize_seed: (i) => wasm.identiconNormalizeSeed(i.seed),
  identicon_params: (i) => {
    const p = wasm.identiconParams(i.seed);
    return {
      main: p.main,
      background: p.background,
      accent: p.accent,
      face: indexOf('face', p.face),
      top: indexOf('top', p.top),
      sides: indexOf('sides', p.sides),
      bottom: indexOf('bottom', p.bottom),
    };
  },
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
  // An expectation with no fields would pass over ANY result.
  const fields = Object.entries(expect).filter(([k]) => k !== 'error');
  if (fields.length === 0) return 'expectation has no fields to check';
  for (const [key, want] of fields) {
    const got = actual?.[key];
    if (want !== got) return `field \`${key}\`: expected ${want}, got ${got}`;
  }
  return null;
}

// The corpus is seven suites, discovered by scanning the directory. Every runner
// asserts that exact set is present: without it, a vector file lost to a bad merge
// or a partial checkout would make all four surfaces report "green" over a corpus
// that had silently shrunk — the precise false confidence this feature exists to
// prevent.
const REQUIRED_SUITES = [
  'abi',
  'eip712',
  'identicon',
  'identicon-bulk',
  'primitives',
  'safe',
  'webauthn',
];

// Functions that exist in vela-core but are deliberately NOT on any binding
// surface (contracts/identicon-api.md §"Binding surfaces"): a test-only parity
// device, plus helpers with no caller on any Vela platform. Skipping is reported,
// never silent — an unreported skip is how a corpus quietly stops covering things.
const CORE_ONLY_FNS = new Set([
  'identicon_params_js_compat',
  'section_svg',
  'create_identicon',
  'nimiq_is_valid_address',
  'constants',
]);

let total = 0;
let skipped = 0;
const failures = [];
const seenSuites = [];

for (const file of readdirSync(VECTORS_DIR).sort()) {
  if (!file.endsWith('.json')) continue;
  const suite = JSON.parse(readFileSync(join(VECTORS_DIR, file), 'utf8'));
  seenSuites.push(suite.suite);

  // The bulk identicon suite uses a compact `pairs` schema and its own runner.
  if (Array.isArray(suite.pairs)) {
    for (const [seed, expected] of suite.pairs) {
      total++;
      const got = wasm.identiconMakeHash(seed);
      if (got !== expected) {
        if (failures.length < 10) {
          failures.push(`${suite.suite}::makeHash(${JSON.stringify(seed)}) — expected ${expected}, got ${got}`);
        }
      }
    }
    continue;
  }

  for (const c of suite.cases ?? []) {
    if (CORE_ONLY_FNS.has(c.fn)) {
      skipped++;
      continue;
    }
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

if (seenSuites.sort().join(',') !== REQUIRED_SUITES.join(',')) {
  console.error(
    `verify-web: corpus is not the expected suite set — got [${seenSuites}], want [${REQUIRED_SUITES}]`,
  );
  process.exit(1);
}
if (failures.length) {
  console.error(`verify-web: ${failures.length} of ${total} cases FAILED:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(
  `verify-web: ${total} conformance cases green through the shipped web artifact` +
    ` (${skipped} skipped — core-only functions with no binding surface: ${[...CORE_ONLY_FNS].join(', ')})`,
);
