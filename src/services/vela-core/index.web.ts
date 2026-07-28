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
import { WASM_BASE64 } from '../../../rust/pkg-web/vela_core_bg.base64.js';

import {
  keccak256 as legacyKeccak256,
  keccak256Hex as legacyKeccak256Hex,
  functionSelector as legacyFunctionSelector,
  create2Address as legacyCreate2Address,
  checksumAddress as legacyChecksumAddress,
  abiEncodeAddress as legacyAbiEncodeAddress,
  abiEncodeUint256 as legacyAbiEncodeUint256,
  abiEncodeUint256Hex as legacyAbiEncodeUint256Hex,
  abiEncodeBytes32 as legacyAbiEncodeBytes32,
} from '@/services/eth-crypto';
import {
  toHex as legacyToHex,
  fromHex as legacyFromHex,
  addHexPrefix as legacyAddHexPrefix,
  stripHexPrefix as legacyStripHexPrefix,
  toQuantity as legacyToQuantity,
  concatBytes as legacyConcatBytes,
  toBase64Url as legacyToBase64Url,
  fromBase64Url as legacyFromBase64Url,
} from '@/services/hex';
import { sha256 as legacySha256 } from '@/services/sha256';
import {
  parseSignature as legacyParseSignature,
  canonicalize as legacyCanonicalize,
  computeSelector as legacyComputeSelector,
  decodeCalldata as legacyDecodeCalldata,
  matchSelector as legacyMatchSelector,
  type DecodedValue,
} from '@/services/abi-decode';
import { hashTypedData as legacyHashTypedData, type TypedData } from '@/services/eip712';
import {
  computeAddress as legacyComputeAddress,
  parsePublicKey as legacyParsePublicKey,
  calculateSaltNonce as legacyCalculateSaltNonce,
  encodeSetupData as legacyEncodeSetupData,
  computeSplitterAddress as legacyComputeSplitterAddress,
  encodeSplitterDeployCall as legacyEncodeSplitterDeployCall,
} from '@/services/safe-address';
import {
  extractPublicKey as legacyExtractPublicKey,
  derSignatureToRaw as legacyDerSignatureToRaw,
} from '@/services/attestation-parser';
import {
  verifySafeWebAuthn as legacyVerifySafeWebAuthn,
  type VerifyResult,
} from '@/services/webauthn-verify';
import {
  recoverPublicKeyFromAssertions as legacyRecoverPublicKeyFromAssertions,
  type RecoverableAssertion,
} from '@/services/p256-recovery';
import type { PasskeyAssertionResult } from '@/modules/passkey';

import { abiTreeToLegacyRecord, bytesFromHex } from './convert';
import { compared } from './diff-harness';

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
  // T1 candidate (safe-transaction kernels): still TS on both platforms, but
  // routed through the facade so it has a single import site like everything else.
  encodeMultiSendTx,
} from '@/services/safe-address';
export { setDiffEnabled, isDiffEnabled, getMismatches, clearMismatches } from './diff-harness';

// ---------------------------------------------------------------------------
// Initialization (synchronous, fail-loud)
// ---------------------------------------------------------------------------

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

try {
  initSync({ module: decodeBase64(WASM_BASE64) });
} catch (e) {
  // A core that fails to load must never degrade into "computes nothing":
  // addresses, signatures and decoded calldata all flow through it.
  throw new Error(
    `vela-core: WebAssembly module failed to initialize (${
      e instanceof Error ? e.message : String(e)
    }). The wallet cannot compute addresses or signatures without it.`,
  );
}

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
  return compared('keccak256', [data], () => wasm.keccak256(data), () => legacyKeccak256(data));
}

export function sha256(data: Uint8Array): Uint8Array {
  return compared('sha256', [data], () => wasm.sha256(data), () => legacySha256(data));
}

export function toHex(data: Uint8Array): string {
  return compared('toHex', [data], () => wasm.toHex(data, false), () => legacyToHex(data));
}

export function fromHex(hex: string): Uint8Array {
  return compared('fromHex', [hex], () => translated(() => wasm.fromHex(hex)), () => legacyFromHex(hex));
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
  return compared(
    'toQuantity',
    [asString],
    () => translated(() => wasm.toQuantity(asString)),
    () => legacyToQuantity(value),
  );
}

export function toBase64Url(data: Uint8Array): string {
  return compared('toBase64Url', [data], () => wasm.toBase64Url(data), () => legacyToBase64Url(data));
}

export function fromBase64Url(s: string): Uint8Array {
  return compared('fromBase64Url', [s], () => translated(() => wasm.fromBase64Url(s)), () => legacyFromBase64Url(s));
}

export function checksumAddress(address: string): string {
  return compared(
    'checksumAddress',
    [address],
    () => translated(() => wasm.checksumAddress(address)),
    () => legacyChecksumAddress(address),
  );
}

export function functionSelector(signature: string): Uint8Array {
  return compared(
    'functionSelector',
    [signature],
    () => translated(() => wasm.functionSelector(signature)),
    () => legacyFunctionSelector(signature),
  );
}

export function create2Address(
  factory: string,
  salt: Uint8Array,
  initCodeHash: Uint8Array,
): string {
  return compared(
    'create2Address',
    [factory, salt, initCodeHash],
    () => translated(() => wasm.create2Address(factory, salt, initCodeHash)),
    () => legacyCreate2Address(factory, salt, initCodeHash),
  );
}

export function abiEncodeAddress(address: string): Uint8Array {
  return compared(
    'abiEncodeAddress',
    [address],
    () => translated(() => wasm.abiEncodeAddress(address)),
    () => legacyAbiEncodeAddress(address),
  );
}

export function abiEncodeUint256(value: bigint | number): Uint8Array {
  const hex = `0x${BigInt(value).toString(16)}`;
  return compared(
    'abiEncodeUint256',
    [hex],
    () => wasm.abiEncodeUint256(hex),
    () => legacyAbiEncodeUint256(value),
  );
}

export function abiEncodeUint256Hex(hex: string): Uint8Array {
  return compared(
    'abiEncodeUint256Hex',
    [hex],
    () => wasm.abiEncodeUint256(hex),
    () => legacyAbiEncodeUint256Hex(hex),
  );
}

export function abiEncodeBytes32(data: Uint8Array): Uint8Array {
  return compared(
    'abiEncodeBytes32',
    [data],
    () => translated(() => wasm.abiEncodeBytes32(data)),
    () => legacyAbiEncodeBytes32(data),
  );
}

// Trivial JS helpers with no FFI value — kept in TS on both platforms.
export const keccak256Hex = legacyKeccak256Hex;
export const addHexPrefix = legacyAddHexPrefix;
export const stripHexPrefix = legacyStripHexPrefix;
export const concatBytes = legacyConcatBytes;
export const parseSignature = legacyParseSignature;

// ---------------------------------------------------------------------------
// abi
// ---------------------------------------------------------------------------

export function canonicalize(sig: string): string {
  return compared(
    'canonicalize',
    [sig],
    () => translated(() => wasm.canonicalizeSignature(sig)),
    () => legacyCanonicalize(sig),
  );
}

/** Legacy contract: bare hex, NO 0x prefix. */
export function computeSelector(sig: string): string {
  return compared(
    'computeSelector',
    [sig],
    () => translated(() => wasm.computeSelector(sig).slice(2)),
    () => legacyComputeSelector(sig),
  );
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
  return compared(
    'decodeCalldata',
    [calldata, sig],
    () => {
      try {
        return abiTreeToLegacyRecord(wasm.decodeCalldata(sig, bytesFromHex(calldata)));
      } catch {
        return null;
      }
    },
    () => legacyDecodeCalldata(calldata, sig),
  );
}

/** Legacy contract: the matching signature string, or null. */
export function matchSelector(calldata: string, signatures: string[]): string | null {
  return compared(
    'matchSelector',
    [calldata, signatures],
    () => {
      const bytes = bytesFromHex(calldata);
      for (const sig of signatures) {
        try {
          if (wasm.matchSelector(sig, bytes)) return sig;
        } catch {
          // An unparseable candidate signature simply cannot match.
        }
      }
      return null;
    },
    () => legacyMatchSelector(calldata, signatures),
  );
}

// ---------------------------------------------------------------------------
// eip712
// ---------------------------------------------------------------------------

export function hashTypedData(typedData: TypedData): Uint8Array {
  return compared(
    'hashTypedData',
    [typedData],
    () => translated(() => wasm.hashTypedData(JSON.stringify(typedData))),
    () => legacyHashTypedData(typedData),
  );
}

// ---------------------------------------------------------------------------
// safe
// ---------------------------------------------------------------------------

export function computeAddress(publicKeyHex: string): string {
  return compared(
    'computeAddress',
    [publicKeyHex],
    () =>
      translated(() => {
        const key = wasm.parsePublicKey(publicKeyHex);
        return wasm.computeSafeAddress(bytesFromHex(key.x), bytesFromHex(key.y)).address;
      }),
    () => legacyComputeAddress(publicKeyHex),
  );
}

export function parsePublicKey(hex: string): { x: Uint8Array; y: Uint8Array } {
  return compared(
    'parsePublicKey',
    [hex],
    () =>
      translated(() => {
        const key = wasm.parsePublicKey(hex);
        return { x: bytesFromHex(key.x), y: bytesFromHex(key.y) };
      }),
    () => legacyParsePublicKey(hex),
  );
}

export function calculateSaltNonce(x: Uint8Array, y: Uint8Array): Uint8Array {
  return compared(
    'calculateSaltNonce',
    [x, y],
    () => translated(() => bytesFromHex(wasm.computeSafeAddress(x, y).salt_nonce)),
    () => legacyCalculateSaltNonce(x, y),
  );
}

export function encodeSetupData(x: Uint8Array, y: Uint8Array): Uint8Array {
  return compared(
    'encodeSetupData',
    [x, y],
    () => translated(() => bytesFromHex(wasm.computeSafeAddress(x, y).setup_data)),
    () => legacyEncodeSetupData(x, y),
  );
}

export function computeSplitterAddress(treasury: string): string {
  return compared(
    'computeSplitterAddress',
    [treasury],
    () => translated(() => wasm.computeSplitterAddress(treasury)),
    () => legacyComputeSplitterAddress(treasury),
  );
}

export function encodeSplitterDeployCall(treasury: string): Uint8Array {
  return compared(
    'encodeSplitterDeployCall',
    [treasury],
    () => translated(() => wasm.encodeSplitterDeployCall(treasury)),
    () => legacyEncodeSplitterDeployCall(treasury),
  );
}

// ---------------------------------------------------------------------------
// webauthn
// ---------------------------------------------------------------------------

/** Legacy contract: `null` when the attestation cannot be parsed. */
export function extractPublicKey(
  attestationObject: Uint8Array,
): { x: Uint8Array; y: Uint8Array } | null {
  return compared(
    'extractPublicKey',
    [attestationObject],
    () => {
      try {
        const key = wasm.extractAttestationPublicKey(attestationObject);
        return { x: bytesFromHex(key.x), y: bytesFromHex(key.y) };
      } catch {
        return null;
      }
    },
    () => legacyExtractPublicKey(attestationObject),
  );
}

/** Legacy contract: `null` on malformed DER. */
export function derSignatureToRaw(derSig: Uint8Array): Uint8Array | null {
  return compared(
    'derSignatureToRaw',
    [derSig],
    () => {
      try {
        return wasm.derSignatureToRawLowS(derSig);
      } catch {
        return null;
      }
    },
    () => legacyDerSignatureToRaw(derSig),
  );
}

export function verifySafeWebAuthn(assertion: PasskeyAssertionResult): VerifyResult {
  return compared(
    'verifySafeWebAuthn',
    [assertion.clientDataJSONHex, assertion.authenticatorDataHex],
    () => {
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
    },
    () => legacyVerifySafeWebAuthn(assertion),
  );
}

/** Legacy contract: uncompressed `04||x||y` hex, or null when not unique. */
export function recoverPublicKeyFromAssertions(
  first: RecoverableAssertion,
  second: RecoverableAssertion,
): string | null {
  return compared(
    'recoverPublicKeyFromAssertions',
    [first, second],
    () => {
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
    },
    () => legacyRecoverPublicKeyFromAssertions(first, second),
  );
}
