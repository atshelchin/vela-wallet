/**
 * Tests for the shared-core shape conversions (specs/001-rust-core-bindings).
 *
 * The web facade turns the Rust core's `AbiValue` tree into the legacy
 * `Record<param, DecodedValue>` the app consumes. That mapping is the one place
 * the swap could change what the signing sheet displays, and it is not covered
 * by the Rust conformance corpus (which pins the tree, not the legacy shape).
 */
import { abiTreeToLegacyRecord, bytesFromHex, type DecodedValue } from '@/services/vela-core/convert';
import type { AbiValue } from '@/services/vela-core/types';

const leaf = (kind: string, name: string, value: string): AbiValue => ({
  kind,
  name,
  value,
  children: [],
});
const node = (kind: string, name: string, children: AbiValue[]): AbiValue => ({
  kind,
  name,
  value: '',
  children,
});

describe('abiTreeToLegacyRecord', () => {
  it('renders an ERC-20 transfer the way the legacy decoder did', () => {
    const tree = node('tuple', '', [
      leaf('address', '_to', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
      leaf('uint256', '_value', '0x3b9aca00'),
    ]);
    const result = abiTreeToLegacyRecord(tree);
    // Addresses were lowercase in the legacy output (raw word slice).
    expect(result._to).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
    expect(result._value).toBe(1000000000n);
  });

  it('maps bools and zero values', () => {
    const tree = node('tuple', '', [
      leaf('bool', 'approved', 'true'),
      leaf('bool', 'revoked', 'false'),
      leaf('uint256', 'amount', '0x0'),
    ]);
    const result = abiTreeToLegacyRecord(tree);
    expect(result.approved).toBe(true);
    expect(result.revoked).toBe(false);
    expect(result.amount).toBe(0n);
  });

  it('maps max uint256 without precision loss', () => {
    const tree = node('tuple', '', [leaf('uint256', 'v', `0x${'f'.repeat(64)}`)]);
    expect(abiTreeToLegacyRecord(tree).v).toBe(2n ** 256n - 1n);
  });

  it('maps negative signed integers', () => {
    const tree = node('tuple', '', [leaf('int256', 'delta', '-0x1')]);
    expect(abiTreeToLegacyRecord(tree).delta).toBe(-1n);
  });

  it('falls back to positional keys for unnamed params', () => {
    const tree = node('tuple', '', [
      leaf('address', '', '0x0000000000000000000000000000000000000001'),
      leaf('uint256', '', '0x2'),
    ]);
    const result = abiTreeToLegacyRecord(tree);
    expect(result._0).toBe('0x0000000000000000000000000000000000000001');
    expect(result._1).toBe(2n);
  });

  it('maps arrays element-wise, preserving order', () => {
    const tree = node('tuple', '', [
      node('address[]', 'hops', [
        leaf('address', '', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
        leaf('address', '', '0x1111111111111111111111111111111111111111'),
      ]),
    ]);
    expect(abiTreeToLegacyRecord(tree).hops).toEqual([
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      '0x1111111111111111111111111111111111111111',
    ]);
  });

  it('maps an empty array to an empty list, not undefined', () => {
    const tree = node('tuple', '', [node('address[]', 'hops', [])]);
    expect(abiTreeToLegacyRecord(tree).hops).toEqual([]);
  });

  it('maps nested tuples to nested records (Uniswap exactInput shape)', () => {
    const tree = node('tuple', '', [
      node('tuple', 'params', [
        leaf('bytes', 'path', '0xaabbccddeeff'),
        leaf('address', 'recipient', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
        leaf('uint256', 'amountIn', '0xf4240'),
        leaf('uint256', 'amountOutMinimum', '0x3e7'),
      ]),
    ]);
    const params = abiTreeToLegacyRecord(tree).params as Record<string, DecodedValue>;
    expect(params.path).toBe('0xaabbccddeeff');
    expect(params.recipient).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
    expect(params.amountIn).toBe(1000000n);
    expect(params.amountOutMinimum).toBe(999n);
  });

  it('passes strings and byte payloads through verbatim', () => {
    const tree = node('tuple', '', [
      leaf('string', 'memo', 'hello'),
      leaf('bytes32', 'hash', `0x${'ab'.repeat(32)}`),
    ]);
    const result = abiTreeToLegacyRecord(tree);
    expect(result.memo).toBe('hello');
    expect(result.hash).toBe(`0x${'ab'.repeat(32)}`);
  });
});

describe('bytesFromHex', () => {
  it('accepts prefixed and bare hex', () => {
    expect(Array.from(bytesFromHex('0xdeadbeef'))).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(Array.from(bytesFromHex('deadbeef'))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('maps the empty string to an empty array', () => {
    expect(bytesFromHex('0x')).toHaveLength(0);
  });
});
