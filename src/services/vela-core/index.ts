/**
 * Shared computation core — WEB entry point (Rust via WebAssembly).
 *
 * Loading is synchronous: the module is base64-embedded by
 * `rust/scripts/build-web.mjs` and initialized with `initSync` at import time,
 * so callers need no async gate. A failed init throws here — the app fails
 * loudly at startup rather than half-initialized with a core that silently
 * computes nothing (spec US2 scenario 2).
 *
 * Every export keeps the LEGACY TypeScript signature so re-pointing an import
 * is mechanical; conversions between the core's FFI shapes and those legacy
 * shapes live in `convert.ts` (unit-tested under jest). With the diff harness
 * on, each call also runs the legacy implementation and reports divergence.
 */

// `initSync` is the NAMED export; the default export is the async loader
// (`__wbg_init`), which resolves a module path we deliberately removed.
import { initSync } from '../../../rust/pkg-web/vela_core.js';
import * as wasm from '../../../rust/pkg-web/vela_core.js';
import { WASM_URL } from '../../../rust/pkg-web/vela_core_wasm_url.js';

import type { PasskeyAssertionResult } from '@/modules/passkey';

import type { DecodedValue, RecoverableAssertion, TypedData, VerifyResult } from './types';
import { concatBytes, stripHexPrefix } from './js-helpers';
import { abiTreeToLegacyRecord, bytesFromHex } from './convert';

export * from './types';
export {
  PROXY_CREATION_CODE,
  SAFE_PROXY_RUNTIME_CODE,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  FALLBACK_HANDLER,
  ENTRY_POINT,
  SAFE_4337_MODULE,
  SAFE_MODULE_SETUP,
  WEBAUTHN_SIGNER,
  MULTI_SEND,
  VELA_SPLITTER_FACTORY,
  VELA_SPLITTER_SALT,
  VELA_SPLITTER_CREATION_CODE,
} from './safe-constants';

// ---------------------------------------------------------------------------
// Initialization (spec 017 D7 route: async fetch in browsers, sync in Node)
// ---------------------------------------------------------------------------
//
// The module ships as a fingerprinted asset in `public/` (it outgrew the
// embedded-base64 budget at 2.9 MB). Two environments, two guarantees:
//
// - **Browser**: `coreReady` fetches and initializes the module; the app
//   entry (`index.js` → `src/boot-web.js`) awaits it BEFORE requiring
//   expo-router, so every module in the app graph — including ones that call
//   the core at import time — still sees an initialized core.
// - **Node** (jest, verify-web.mjs, expo export's static-render pass): the
//   harness reads the asset from disk and plants the bytes on
//   `globalThis.__VELA_WASM_BYTES__` before this module loads; init stays
//   synchronous at import, exactly the old guarantee.

function failLoud(e: unknown): never {
  // A core that fails to load must never degrade into "computes nothing":
  // addresses, signatures and decoded calldata all flow through it.
  throw new Error(
    `vela-core: WebAssembly module failed to initialize (${
      e instanceof Error ? e.message : String(e)
    }). The wallet cannot compute addresses or signatures without it.`,
  );
}

/**
 * The module bytes, for a Node runtime evaluating this web bundle.
 *
 * Two such runtimes exist and both are load-bearing: jest (which plants the
 * bytes in `jest.setup.js`) and Expo's static-render pass, which executes the
 * web bundle in Node — with `output: "static"` that happens on every dev-server
 * request and during `expo export`. The render pass plants nothing, so we read
 * the asset ourselves.
 *
 * `process.getBuiltinModule` rather than `require('node:fs')`: metro resolves
 * static requires at build time and would fail the browser bundle on a Node
 * builtin. This is a runtime lookup that simply does not exist in a browser.
 */
function nodeWasmBytes(): Uint8Array | undefined {
  const planted = (globalThis as { __VELA_WASM_BYTES__?: Uint8Array }).__VELA_WASM_BYTES__;
  if (planted) return planted;

  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown; cwd?: () => string } })
    .process;
  const getBuiltin = proc?.getBuiltinModule;
  if (typeof getBuiltin !== 'function' || typeof proc?.cwd !== 'function') return undefined;
  try {
    const fs = getBuiltin('node:fs') as { readFileSync(p: string): Uint8Array };
    const path = getBuiltin('node:path') as { join(...parts: string[]): string };
    return fs.readFileSync(path.join(proc.cwd(), 'public', WASM_URL.replace(/^\//, '')));
  } catch {
    // Falls through to the loud failure below — a Node runtime that cannot
    // read the asset must not proceed with an uninitialized core.
    return undefined;
  }
}

const plantedBytes = typeof document === 'undefined' ? nodeWasmBytes() : undefined;

let initialized = false;

/**
 * Throw unless the module is initialized.
 *
 * For the other web modules that reach the wasm directly (`src/i18n/index.ts`
 * builds its own `I18n` engine). They are only ever evaluated inside the app
 * graph, which the entry gates behind `coreReady` — so this is an assertion,
 * not a race: if it ever fires, something imported the app graph without the
 * gate, and a clear message beats wasm-bindgen's null-pointer panic.
 */
export function assertCoreInitialized(): void {
  if (!initialized) {
    throw new Error(
      'vela-core: the WebAssembly module is not initialized yet. The web entry (index.web.js) must await `coreReady` before loading the app graph.',
    );
  }
}

/** Resolves once the core is initialized. The web entry awaits this. */
export const coreReady: Promise<void> = (() => {
  if (plantedBytes) {
    try {
      initSync({ module: plantedBytes });
      initialized = true;
    } catch (e) {
      failLoud(e);
    }
    return Promise.resolve();
  }
  if (typeof document === 'undefined') {
    // Node, and `nodeWasmBytes()` found nothing: no relative URL can be
    // fetched here, and a silently unready core would surface later as a
    // wasm-bindgen null-pointer panic far from the cause.
    failLoud(
      new Error(
        `could not read public${WASM_URL} from ${String(
          (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? 'the working directory',
        )}. Run \`npm run build:wasm\`, or plant the bytes on globalThis.__VELA_WASM_BYTES__.`,
      ),
    );
  }
  return fetch(WASM_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`fetch ${WASM_URL} → ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((bytes) => {
      initSync({ module: bytes });
      initialized = true;
    })
    .catch((e) => failLoud(e));
})();

export const CORE_BACKEND: 'rust-wasm' | 'legacy-ts' = 'rust-wasm';

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

/**
 * Turn a thrown `{ code, message }` from the core into an Error whose message
 * makes sense to a person.
 *
 * This matters most for the payload classes the core refuses on purpose: the
 * raw text ("non-canonical EIP712Domain: field `chain` is not a canonical
 * EIP712Domain field") reads like a wallet crash, when what actually happened
 * is that the site sent a request we cannot sign safely. The original text is
 * preserved on `.cause` for triage.
 */
const USER_FACING: Record<string, string> = {
  Eip712NonCanonicalDomain:
    "This site's signature request uses a non-standard EIP-712 domain, so the signature it produced could not be verified by the site itself. Vela declined to sign it.",
  Eip712Parse: "This site's signature request is malformed and cannot be signed.",
  AbiParse: 'The function signature for this call could not be parsed.',
  AbiDecode: 'This transaction data does not match the function it claims to call.',
  InvalidClientData: 'Your passkey provider returned a response Safe contracts cannot verify.',
  InvalidPublicKey: 'The passkey public key could not be read.',
};

function translateCoreError(e: unknown): unknown {
  if (typeof e !== 'object' || e === null || !('code' in e)) return e;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (typeof code !== 'string') return e;
  const friendly = USER_FACING[code];
  const error = new Error(friendly ?? (typeof message === 'string' ? message : code), {
    cause: e,
  });
  (error as Error & { coreCode?: string }).coreCode = code;
  return error;
}

/** Run a core call, translating its error shape on the way out. */
function translated<T>(run: () => T): T {
  try {
    return run();
  } catch (e) {
    throw translateCoreError(e);
  }
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

export function keccak256(data: Uint8Array): Uint8Array {
  return wasm.keccak256(data);
}

export function sha256(data: Uint8Array): Uint8Array {
  return wasm.sha256(data);
}

export function toHex(data: Uint8Array): string {
  return wasm.toHex(data, false);
}

export function fromHex(hex: string): Uint8Array {
  return translated(() => wasm.fromHex(hex));
}

export function toQuantity(value: string | number | bigint | undefined | null): string {
  // The legacy signature accepts non-strings; the core takes the canonical
  // string form, and null/undefined keep their legacy `0x0` meaning.
  // Numerics MUST go through BigInt, not String(): `String(1e21)` is '1e+21',
  // which the core rightly rejects even though the value itself is fine.
  let asString: string;
  if (value === undefined || value === null) {
    asString = '';
  } else if (typeof value === 'bigint') {
    asString = value.toString();
  } else if (typeof value === 'number') {
    // Non-integers were never valid quantities; let the core reject them.
    asString = Number.isInteger(value) ? BigInt(value).toString() : String(value);
  } else {
    asString = value;
  }
  return translated(() => wasm.toQuantity(asString));
}

export function toBase64Url(data: Uint8Array): string {
  return wasm.toBase64Url(data);
}

export function fromBase64Url(s: string): Uint8Array {
  return translated(() => wasm.fromBase64Url(s));
}

export function checksumAddress(address: string): string {
  return translated(() => wasm.checksumAddress(address));
}

export function functionSelector(signature: string): Uint8Array {
  return translated(() => wasm.functionSelector(signature));
}

export function create2Address(
  factory: string,
  salt: Uint8Array,
  initCodeHash: Uint8Array,
): string {
  return translated(() => wasm.create2Address(factory, salt, initCodeHash));
}

export function abiEncodeAddress(address: string): Uint8Array {
  return translated(() => wasm.abiEncodeAddress(address));
}

export function abiEncodeUint256(value: bigint | number): Uint8Array {
  const hex = `0x${BigInt(value).toString(16)}`;
  return wasm.abiEncodeUint256(hex);
}

export function abiEncodeUint256Hex(hex: string): Uint8Array {
  return wasm.abiEncodeUint256(hex);
}

export function abiEncodeBytes32(data: Uint8Array): Uint8Array {
  return translated(() => wasm.abiEncodeBytes32(data));
}

// Trivial JS helpers with no FFI value — see js-helpers.ts for why they stay
// in TypeScript. They are no longer a second implementation of anything.
export { addHexPrefix, stripHexPrefix, concatBytes, parseSignature } from './js-helpers';

/** keccak256 over hex input — the two facade calls it composes. */
export function keccak256Hex(hex: string): Uint8Array {
  return keccak256(fromHex(hex));
}

/**
 * Encode one MultiSend sub-transaction:
 * operation(1) ++ to(20) ++ value(32, zero) ++ dataLength(32) ++ data.
 *
 * Assembly, not computation — the Rust core has no counterpart, so this is the
 * single implementation rather than one of two.
 */
export function encodeMultiSendTx(to: string, data: Uint8Array, operation: number): Uint8Array {
  const toBytes = fromHex(stripHexPrefix(to)); // 20 bytes
  const operationByte = new Uint8Array([operation]); // 1 byte
  const value = new Uint8Array(32); // 32 bytes of zero
  // `abiEncodeUint256` rather than a manual shift: JS `>>>` wraps at 32 bits,
  // so `(len >>> 32)` yields `len` instead of 0.
  const lenBytes = abiEncodeUint256(data.length);
  return concatBytes(operationByte, toBytes, value, lenBytes, data);
}

// ---------------------------------------------------------------------------
// abi
// ---------------------------------------------------------------------------

export function canonicalize(sig: string): string {
  return translated(() => wasm.canonicalizeSignature(sig));
}

/** Legacy contract: bare hex, NO 0x prefix. */
export function computeSelector(sig: string): string {
  return translated(() => wasm.computeSelector(sig).slice(2));
}

/**
 * Legacy contract: `null` on any failure (unknown selector, malformed
 * signature, truncated calldata) so the signing sheet falls back to raw
 * calldata rather than showing fabricated values.
 */
export function decodeCalldata(
  calldata: string,
  sig: string,
): Record<string, DecodedValue> | null {
  try {
    return abiTreeToLegacyRecord(wasm.decodeCalldata(sig, bytesFromHex(calldata)));
  } catch {
    return null;
  }
}

/** Legacy contract: the matching signature string, or null. */
export function matchSelector(calldata: string, signatures: string[]): string | null {
  const bytes = bytesFromHex(calldata);
  for (const sig of signatures) {
    try {
      if (wasm.matchSelector(sig, bytes)) return sig;
    } catch {
      // An unparseable candidate signature simply cannot match.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// eip712
// ---------------------------------------------------------------------------

export function hashTypedData(typedData: TypedData): Uint8Array {
  return translated(() => wasm.hashTypedData(JSON.stringify(typedData)));
}

// ---------------------------------------------------------------------------
// safe
// ---------------------------------------------------------------------------

export function computeAddress(publicKeyHex: string): string {
  return translated(() => {
        const key = wasm.parsePublicKey(publicKeyHex);
        return wasm.computeSafeAddress(bytesFromHex(key.x), bytesFromHex(key.y)).address;
      });
}

export function parsePublicKey(hex: string): { x: Uint8Array; y: Uint8Array } {
  return translated(() => {
        const key = wasm.parsePublicKey(hex);
        return { x: bytesFromHex(key.x), y: bytesFromHex(key.y) };
      });
}

export function calculateSaltNonce(x: Uint8Array, y: Uint8Array): Uint8Array {
  return translated(() => bytesFromHex(wasm.computeSafeAddress(x, y).salt_nonce));
}

export function encodeSetupData(x: Uint8Array, y: Uint8Array): Uint8Array {
  return translated(() => bytesFromHex(wasm.computeSafeAddress(x, y).setup_data));
}

export function computeSplitterAddress(treasury: string): string {
  return translated(() => wasm.computeSplitterAddress(treasury));
}

export function encodeSplitterDeployCall(treasury: string): Uint8Array {
  return translated(() => wasm.encodeSplitterDeployCall(treasury));
}

// ---------------------------------------------------------------------------
// webauthn
// ---------------------------------------------------------------------------

/** Legacy contract: `null` when the attestation cannot be parsed. */
export function extractPublicKey(
  attestationObject: Uint8Array,
): { x: Uint8Array; y: Uint8Array } | null {
  try {
    const key = wasm.extractAttestationPublicKey(attestationObject);
    return { x: bytesFromHex(key.x), y: bytesFromHex(key.y) };
  } catch {
    return null;
  }
}

/** Legacy contract: `null` on malformed DER. */
export function derSignatureToRaw(derSig: Uint8Array): Uint8Array | null {
  try {
    return wasm.derSignatureToRawLowS(derSig);
  } catch {
    return null;
  }
}

export function verifySafeWebAuthn(assertion: PasskeyAssertionResult): VerifyResult {
  try {
    wasm.validateClientData(
      'get',
      bytesFromHex(assertion.clientDataJSONHex),
      bytesFromHex(assertion.authenticatorDataHex),
    );
    return { ok: true };
  } catch (e) {
    const message =
      typeof e === 'object' && e !== null && 'message' in e
        ? String((e as { message: unknown }).message)
        : String(e);
    return { ok: false, reason: message };
  }
}

/** Legacy contract: uncompressed `04||x||y` hex, or null when not unique. */
export function recoverPublicKeyFromAssertions(
  first: RecoverableAssertion,
  second: RecoverableAssertion,
): string | null {
  try {
    const key = wasm.recoverPublicKeyFromAssertions(
      bytesFromHex(first.authenticatorDataHex),
      bytesFromHex(first.clientDataJSONHex),
      bytesFromHex(first.signatureHex),
      bytesFromHex(second.authenticatorDataHex),
      bytesFromHex(second.clientDataJSONHex),
      bytesFromHex(second.signatureHex),
    );
    if (!key) return null;
    return `04${key.x.slice(2)}${key.y.slice(2)}`;
  } catch {
    return null;
  }
}

// --- identicon --------------------------------------------------------------
// specs/003-rust-identicon. The core is byte-identical to the JS library it
// replaces — 200,478 seeds verified by scripts/verify-identicon-parity.mjs — so
// no existing account's avatar changes. The diff harness keeps checking that at
// runtime, on real accounts, for as long as the legacy path is still linked.

export function identiconSvgCircular(seed: string): string {
  return translated(() => wasm.identiconSvgCircular(seed));
}

export function normalizeIdenticonSeed(seed: string): string {
  return wasm.identiconNormalizeSeed(seed);
}
