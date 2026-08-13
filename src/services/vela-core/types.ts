/**
 * Public types of the shared core facade.
 *
 * `AbiValue` mirrors the Rust record 1:1 (recursive; identical on the wasm and
 * Kotlin/Swift bindings). The legacy-compatible aliases keep call sites that
 * import from here free of platform details.
 */

/** Decoded-calldata tree node — see specs/001-rust-core-bindings/data-model.md. */
export interface AbiValue {
  /** Canonical solidity type: "address" | "uint256" | "tuple" | "uint256[]" | … */
  kind: string;
  /** Param/component name from the signature ("" when unnamed or an array element). */
  name: string;
  /** Leaf payload; "" on non-leaves. */
  value: string;
  children: AbiValue[];
}

/** Error shape thrown across the wasm boundary. */
export interface CoreErrorShape {
  code: string;
  message: string;
}

export type { DecodedValue } from './convert';

/** Parsed Solidity signature parameter — "address _to", tuple components nested. */
export interface AbiParam {
  type: string;
  name: string;
  components?: AbiParam[];
}

/** EIP-712 typed data as received from dApps. */
export interface TypedData {
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  domain: Record<string, any>;
  message: Record<string, any>;
}

export interface TypedDataField {
  name: string;
  type: string;
}

/** Outcome of checking a WebAuthn assertion against the Safe signer contract. */
export interface VerifyResult {
  ok: boolean;
  /** Human-readable reason on failure */
  reason?: string;
}

/** The subset of WebAuthn assertion fields public-key recovery needs (hex-encoded). */
export interface RecoverableAssertion {
  signatureHex: string;
  authenticatorDataHex: string;
  clientDataJSONHex: string;
}
