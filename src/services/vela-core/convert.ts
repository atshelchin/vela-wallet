/**
 * Shape conversions between the Rust core's FFI types and the legacy TypeScript
 * API the app already calls.
 *
 * Platform-neutral on purpose: `index.web.ts` (wasm) is only bundled for web,
 * so this is where the conversion logic can be unit-tested under jest/node.
 * Every function here is pure.
 */

import type { AbiValue } from './types';

/** Legacy decoded value union (mirrors abi-decode.ts DecodedValue). */
export type DecodedValue =
  | string
  | bigint
  | boolean
  | Array<string | bigint | boolean | Record<string, unknown>>
  | Record<string, unknown>;

/**
 * Hex → bytes for values crossing INTO the core.
 *
 * Strict on purpose: the legacy `parseInt` loop turned junk into 0x00 bytes,
 * and if this stayed lenient the facade would re-introduce that silence one
 * layer below the strict core (e.g. a garbled `clientDataJSONHex` would
 * "verify" as empty instead of erroring). Callers that must not throw already
 * wrap these conversions in the try/catch that reproduces the legacy `null`.
 */
export function bytesFromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`vela-core: odd-length hex string (${clean.length} chars)`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const pair = clean.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
      throw new Error(`vela-core: invalid hex pair \`${pair}\``);
    }
    out[i] = parseInt(pair, 16);
  }
  return out;
}

/**
 * Render one decoded node in the legacy `DecodedValue` shape.
 *
 * The core renders every leaf as a display string (see contracts/core-api.md);
 * the legacy decoder returned native JS values — bigint for integers, boolean
 * for bools, lowercase hex for addresses. Reproduce that exactly so call sites
 * (SigningSheet, clear-signing, approval-guard) are unaffected by the swap.
 */
function nodeToLegacy(node: AbiValue): DecodedValue {
  if (node.kind === 'tuple') {
    return tupleToRecord(node);
  }
  if (node.kind.endsWith(']')) {
    return node.children.map((child) => nodeToLegacy(child)) as DecodedValue;
  }
  if (node.kind === 'address') {
    // Legacy rendered addresses lowercase (raw word slice, no checksum).
    return node.value.toLowerCase();
  }
  if (node.kind === 'bool') {
    return node.value === 'true';
  }
  if (node.kind.startsWith('uint') || node.kind.startsWith('int')) {
    return node.value.startsWith('-') ? -BigInt(node.value.slice(1)) : BigInt(node.value);
  }
  // bytes / bytesN / string / function pass through as the core rendered them.
  return node.value;
}

function tupleToRecord(node: AbiValue): Record<string, DecodedValue> {
  const out: Record<string, DecodedValue> = {};
  node.children.forEach((child, index) => {
    out[child.name || `_${index}`] = nodeToLegacy(child);
  });
  return out;
}

/**
 * Convert the core's decoded-calldata tree into the legacy
 * `Record<paramName, DecodedValue>` the app consumes.
 */
export function abiTreeToLegacyRecord(tree: AbiValue): Record<string, DecodedValue> {
  return tupleToRecord(tree);
}
