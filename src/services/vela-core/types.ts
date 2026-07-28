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

/** Legacy re-exports so call sites need only one import site. */
export type { AbiParam } from '@/services/abi-decode';
export type { TypedData, TypedDataField } from '@/services/eip712';
export type { VerifyResult } from '@/services/webauthn-verify';
