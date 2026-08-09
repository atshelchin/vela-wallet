/**
 * Shared computation core — NATIVE entry point.
 *
 * The React Native layer runs on Hermes, which has no WebAssembly, so on
 * iOS/Android this facade delegates to the quarantined legacy TypeScript
 * implementations until the native rewrite adopts the Kotlin/Swift bindings
 * (specs/001-rust-core-bindings/spec.md, amended 2026-07-28).
 *
 * `index.web.ts` is the web counterpart and serves the same API from the Rust
 * core via wasm. Every app import must go through this directory — the
 * `no-restricted-imports` rule in eslint.config.js enforces it — so the
 * eventual deletion of the legacy files is a facade re-point, not a sweep.
 */

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
  identiconSvgCircular as legacyIdenticonSvgCircular,
  normalizeIdenticonSeed as legacyNormalizeIdenticonSeed,
} from '@/services/identicon';
import {
  parseSignature as legacyParseSignature,
  canonicalize as legacyCanonicalize,
  computeSelector as legacyComputeSelector,
  decodeCalldata as legacyDecodeCalldata,
  matchSelector as legacyMatchSelector,
} from '@/services/abi-decode';
import { hashTypedData as legacyHashTypedData } from '@/services/eip712';
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
import { verifySafeWebAuthn as legacyVerifySafeWebAuthn } from '@/services/webauthn-verify';
import { recoverPublicKeyFromAssertions as legacyRecoverPublicKeyFromAssertions } from '@/services/p256-recovery';

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

/** Which implementation this bundle is serving — surfaced in dev diagnostics. */
export const CORE_BACKEND: 'rust-wasm' | 'legacy-ts' = 'legacy-ts';

// --- primitives -------------------------------------------------------------
export const keccak256 = legacyKeccak256;
export const keccak256Hex = legacyKeccak256Hex;
export const sha256 = legacySha256;
export const toHex = legacyToHex;
export const fromHex = legacyFromHex;
export const addHexPrefix = legacyAddHexPrefix;
export const stripHexPrefix = legacyStripHexPrefix;
export const toQuantity = legacyToQuantity;
export const concatBytes = legacyConcatBytes;
export const toBase64Url = legacyToBase64Url;
export const fromBase64Url = legacyFromBase64Url;
export const checksumAddress = legacyChecksumAddress;
export const functionSelector = legacyFunctionSelector;
export const create2Address = legacyCreate2Address;
export const abiEncodeAddress = legacyAbiEncodeAddress;
export const abiEncodeUint256 = legacyAbiEncodeUint256;
export const abiEncodeUint256Hex = legacyAbiEncodeUint256Hex;
export const abiEncodeBytes32 = legacyAbiEncodeBytes32;

// --- abi --------------------------------------------------------------------
export const parseSignature = legacyParseSignature;
export const canonicalize = legacyCanonicalize;
export const computeSelector = legacyComputeSelector;
export const decodeCalldata = legacyDecodeCalldata;
export const matchSelector = legacyMatchSelector;

// --- eip712 -----------------------------------------------------------------
export const hashTypedData = legacyHashTypedData;

// --- safe -------------------------------------------------------------------
export const computeAddress = legacyComputeAddress;
export const parsePublicKey = legacyParsePublicKey;
export const calculateSaltNonce = legacyCalculateSaltNonce;
export const encodeSetupData = legacyEncodeSetupData;
export const computeSplitterAddress = legacyComputeSplitterAddress;
export const encodeSplitterDeployCall = legacyEncodeSplitterDeployCall;

// --- webauthn ---------------------------------------------------------------
export const extractPublicKey = legacyExtractPublicKey;
export const derSignatureToRaw = legacyDerSignatureToRaw;
export const verifySafeWebAuthn = legacyVerifySafeWebAuthn;
export const recoverPublicKeyFromAssertions = legacyRecoverPublicKeyFromAssertions;

// --- identicon --------------------------------------------------------------
// specs/003-rust-identicon. On native (Hermes, no wasm) the JS library still runs;
// `index.web.ts` serves the same two functions from the Rust core, and
// `scripts/verify-identicon-parity.mjs` proves the two are byte-identical.
export const identiconSvgCircular = legacyIdenticonSvgCircular;
export const normalizeIdenticonSeed = legacyNormalizeIdenticonSeed;

/**
 * Resolves once the core is usable. Native has no wasm to load — the legacy
 * TypeScript implementations are ready at import — so this is already
 * resolved. It exists so the platform pair exposes matching export names:
 * `tsc` resolves `.web.ts` imports to this base file.
 */
export const coreReady: Promise<void> = Promise.resolve();

/**
 * No-op on native: the legacy TypeScript implementations need no module load.
 * Present so the platform pair exposes matching export names.
 */
export function assertCoreInitialized(): void {}
