/**
 * The handful of helpers the Rust core deliberately does NOT own.
 *
 * `parseSignature` is string parsing with no cryptographic meaning, and the
 * other three are one-liners over data the core already produced — crossing the
 * FFI boundary for them would cost more than it buys. They lived in the
 * quarantined TypeScript oracle until it was deleted; they live here now, once,
 * behind the same facade as everything else, so there is still exactly one
 * implementation of each.
 */

import type { AbiParam } from './types';

export function addHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex : `0x${hex}`;
}

/** Remove 0x prefix if present. */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/** Concatenate multiple Uint8Arrays. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Parse a Solidity function signature into name + params.
 * Input: "transfer(address _to, uint256 _value)"
 * Output: { name: "transfer", params: [{type:"address",name:"_to"}, {type:"uint256",name:"_value"}] }
 */
export function parseSignature(sig: string): { name: string; params: AbiParam[] } {
  const parenIdx = sig.indexOf('(');
  if (parenIdx === -1) return { name: sig, params: [] };
  const name = sig.slice(0, parenIdx);
  const body = sig.slice(parenIdx + 1, sig.lastIndexOf(')'));
  return { name, params: parseParamList(body) };
}

function parseParamList(body: string): AbiParam[] {
  if (!body.trim()) return [];
  const params: AbiParam[] = [];
  let depth = 0;
  let current = '';

  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      params.push(parseOneParam(current.trim()));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(parseOneParam(current.trim()));
  return params;
}

function parseOneParam(raw: string): AbiParam {
  // Handle tuple: "(address recipient, uint256 amount) params"
  if (raw.startsWith('(')) {
    const closeIdx = findMatchingParen(raw, 0);
    const tupleBody = raw.slice(1, closeIdx);
    const rest = raw.slice(closeIdx + 1).trim();
    // rest could be "[] name" or " name" or "name"
    let arrayStr = '';
    let name = '';
    if (rest.startsWith('[')) {
      const bIdx = rest.indexOf(']');
      arrayStr = rest.slice(0, bIdx + 1);
      name = rest.slice(bIdx + 1).trim();
    } else {
      name = rest.replace(/^\s+/, '');
    }
    const components = parseParamList(tupleBody);
    return { type: 'tuple' + arrayStr, name, components };
  }

  // Regular: "uint256 _value" or "address" or "bytes[]"
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { type: parts[0], name: '' };
  return { type: parts[0], name: parts.slice(1).join(' ') };
}

function findMatchingParen(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return s.length - 1;
}
