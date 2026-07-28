/**
 * The HAND-MAINTAINED list of intentional behavior divergences between the
 * legacy TS implementations and vela-core (FR-004 enumeration).
 *
 * Contract: specs/001-rust-core-bindings/contracts/core-api.md §"Enumerated divergences".
 * The dump scripts may only READ from this list — they must never invent a
 * divergence, and every entry here must have a matching call-site audit (T029)
 * before the web path switches over.
 */

import { computeSelector } from '@/services/abi-decode';
import { VectorCase } from './writer';

export const DIVERGENCES: VectorCase[] = [
  {
    name: 'fromHex/junk-input',
    fn: 'from_hex',
    input: { s: 'zz' },
    expect: { error: 'InvalidHex' },
    divergence: {
      ts_behavior: "parseInt('zz',16)=NaN coerces to a single 0x00 byte — silent junk acceptance",
      reason: 'FR-004: parse failure must never yield a default value',
    },
  },
  {
    name: 'toQuantity/negative-input',
    fn: 'to_quantity',
    input: { value: '-5' },
    expect: { error: 'InvalidQuantity' },
    divergence: {
      ts_behavior: "negative values silently clamp to '0x0'",
      reason: 'FR-004: a negative quantity forwarded from a dApp is malformed, not zero',
    },
  },
  {
    name: 'toQuantity/garbage-input',
    fn: 'to_quantity',
    input: { value: 'not-a-number' },
    expect: { error: 'InvalidQuantity' },
    divergence: {
      ts_behavior: "BigInt() throws internally and the catch returns '0x0'",
      reason: 'FR-004: parse failure must never yield a default value',
    },
  },
  {
    name: 'fromBase64Url/embedded-whitespace',
    fn: 'from_base64url',
    input: { s: 'AA\n' },
    expect: { error: 'InvalidBase64Url' },
    divergence: {
      ts_behavior: "Node's atob silently ignores ASCII whitespace, decoding 'AA\\n' to one byte",
      reason: 'credential IDs and challenges are never whitespace-padded; silent stripping hides malformed input',
    },
  },
  {
    name: 'fromBase64Url/standard-alphabet-input',
    fn: 'from_base64url',
    input: { s: 'a+b/' },
    expect: { error: 'InvalidBase64Url' },
    divergence: {
      ts_behavior: "atob() accepts standard-alphabet '+'/'/' after the url-safe replace, silently decoding mixed-alphabet input",
      reason: 'FR-004: a base64url decoder must only accept the url-safe alphabet; credential IDs are always url-safe',
    },
  },
  {
    name: 'decodeCalldata/truncated-zero-pad',
    fn: 'decode_calldata',
    input: { sig: 'transfer(address _to, uint256 _value)', calldata: '0xa9059cbb' },
    expect: { error: 'AbiDecode' },
    divergence: {
      ts_behavior: 'pads missing calldata words with zeros "by design" — selector-only transfer decodes to address(0)/value 0',
      reason: 'FR-004: fabricated zero values on the signing sheet are worse than falling back to raw-calldata display',
    },
  },
  {
    name: 'decodeCalldata/empty-string-param',
    fn: 'decode_calldata',
    // greet(string name) with offset word + zero length: a well-formed empty string
    input: {
      sig: 'greet(string name)',
      calldata:
        '0x' +
        computeSelector('greet(string name)') +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000000',
    },
    expect: {
      value: {
        kind: 'tuple',
        name: '',
        value: '',
        children: [{ kind: 'string', name: 'name', value: '', children: [] }],
      },
    },
    divergence: {
      ts_behavior: "empty string hits a null-regex-match catch and renders as '0x' instead of ''",
      reason: 'correct utf8 rendering of the empty string; TS behavior is an acknowledged bug',
    },
  },
  {
    name: 'canonicalize/uint-alias',
    fn: 'canonicalize_signature',
    input: { sig: 'transfer(address to, uint value)' },
    expect: { value: 'transfer(address,uint256)' },
    divergence: {
      ts_behavior: "keeps the 'uint' alias verbatim, so the derived selector differs from Solidity's canonical one",
      reason: "Solidity grammar: 'uint'/'int' are aliases for uint256/int256; the selector preimage must be canonical",
    },
  },
  {
    name: 'computeSelector/uint-alias',
    fn: 'compute_selector',
    input: { sig: 'transfer(address to, uint value)' },
    expect: { value: '0xa9059cbb' },
    divergence: {
      ts_behavior: 'hashes the unnormalized string → wrong selector for aliased signatures',
      reason: 'same alias normalization as canonicalize_signature',
    },
  },
  {
    name: 'hashTypedData/custom-domain-field',
    fn: 'hash_typed_data',
    input: {
      typed_data_json: JSON.stringify({
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chain', type: 'string' },
          ],
          M: [{ name: 'v', type: 'uint256' }],
        },
        primaryType: 'M',
        domain: { name: 'T', chain: 'base' },
        message: { v: 1 },
      }),
    },
    expect: { error: 'Eip712NonCanonicalDomain' },
    divergence: {
      ts_behavior: 'hashes the custom domain type as provided (self-consistent but nonstandard)',
      reason: 'alloy computes the separator from the fixed five-field struct and would silently DROP the custom field, producing a signature the dApp verifier rejects — refusing loudly is the only safe option',
    },
  },
  {
    name: 'hashTypedData/reordered-domain-fields',
    fn: 'hash_typed_data',
    input: {
      typed_data_json: JSON.stringify({
        types: {
          EIP712Domain: [
            { name: 'chainId', type: 'uint256' },
            { name: 'name', type: 'string' },
          ],
          M: [{ name: 'v', type: 'uint256' }],
        },
        primaryType: 'M',
        domain: { name: 'T', chainId: 1 },
        message: { v: 1 },
      }),
    },
    expect: { error: 'Eip712NonCanonicalDomain' },
    divergence: {
      ts_behavior: 'hashes fields in the provided (non-canonical) order',
      reason: 'same as custom-domain-field: alloy would reorder to canonical and silently diverge from the dApp verifier',
    },
  },
  {
    name: 'hashTypedData/wrong-domain-field-type',
    fn: 'hash_typed_data',
    input: {
      typed_data_json: JSON.stringify({
        types: {
          EIP712Domain: [{ name: 'chainId', type: 'uint32' }],
          M: [{ name: 'v', type: 'uint256' }],
        },
        primaryType: 'M',
        domain: { chainId: 1 },
        message: { v: 1 },
      }),
    },
    expect: { error: 'Eip712NonCanonicalDomain' },
    divergence: {
      ts_behavior: 'encodes chainId as the declared uint32 (nonstandard separator)',
      reason: 'canonical EIP712Domain mandates uint256 chainId',
    },
  },
  {
    name: 'parsePublicKey/invalid-input',
    fn: 'parse_public_key',
    input: { hex: '0xdeadbeef' },
    expect: { error: 'InvalidPublicKey' },
    divergence: {
      ts_behavior: 'returns empty x/y arrays instead of erroring (safe-address.ts parsePublicKey)',
      reason: 'FR-004: an unparseable passkey public key must be a loud failure — it derives the wallet identity',
    },
  },
];

export function divergencesFor(fn: string): VectorCase[] {
  return DIVERGENCES.filter((d) => d.fn === fn);
}
