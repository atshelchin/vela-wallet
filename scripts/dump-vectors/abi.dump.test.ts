/**
 * Dump the `abi` conformance suite from the TS oracle (src/services/abi-decode.ts)
 * → rust vectors/abi.json.
 *
 * The TS decoder returns named JS records; the contract's FFI shape is the
 * recursive AbiValue tree. `toAbiValue` maps TS VALUES into contract RENDERING
 * (checksummed addresses, minimal 0x-hex, "true"/"false") — the values come
 * from the oracle, the rendering rules from contracts/core-api.md.
 */

import {
  AbiParam,
  parseSignature,
  canonicalize,
  computeSelector,
  decodeCalldata,
  matchSelector,
  DecodedValue,
} from '@/services/abi-decode';
import { checksumAddress } from '@/services/eth-crypto';
import { VectorCase, writeSuite } from './writer';
import { divergencesFor } from './divergences';

interface AbiValueJson {
  kind: string;
  name: string;
  value: string;
  children: AbiValueJson[];
}

function leaf(kind: string, name: string, value: string): AbiValueJson {
  return { kind, name, value, children: [] };
}

function bigHex(v: bigint): string {
  if (v === 0n) return '0x0';
  return v < 0n ? '-0x' + (-v).toString(16) : '0x' + v.toString(16);
}

function toAbiValue(param: AbiParam, v: DecodedValue): AbiValueJson {
  const t = param.type;
  const arrayMatch = t.match(/^(.*)\[(\d*)\]$/);
  if (arrayMatch) {
    const elemParam: AbiParam = { type: arrayMatch[1], name: '', components: param.components };
    const items = v as DecodedValue[];
    return {
      kind: t,
      name: param.name,
      value: '',
      children: items.map((item) => toAbiValue(elemParam, item)),
    };
  }
  if (t.startsWith('tuple')) {
    const comps = param.components ?? [];
    const rec = v as Record<string, DecodedValue>;
    return {
      kind: 'tuple',
      name: param.name,
      value: '',
      children: comps.map((c, i) => toAbiValue(c, rec[c.name || `_${i}`])),
    };
  }
  if (t === 'address') return leaf(t, param.name, checksumAddress(v as string));
  if (t === 'bool') return leaf(t, param.name, v ? 'true' : 'false');
  if (t.startsWith('uint') || t.startsWith('int')) return leaf(t, param.name, bigHex(v as bigint));
  // string / bytes / bytesN pass through as the oracle rendered them
  return leaf(t, param.name, v as string);
}

function decodedTree(sig: string, calldata: string): AbiValueJson {
  const rec = decodeCalldata(calldata, sig);
  if (rec === null) throw new Error(`oracle failed to decode ${sig}`);
  const { params } = parseSignature(sig);
  return {
    kind: 'tuple',
    name: '',
    value: '',
    children: params.map((p, i) => toAbiValue(p, rec[p.name || `_${i}`])),
  };
}

// Word builders mirroring src/__tests__/services/abi-decode.test.ts
const wNum = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const wAddr = (a: string) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const wBytes = (hexNo0x: string) =>
  wNum(hexNo0x.length / 2) + hexNo0x.padEnd(Math.ceil(hexNo0x.length / 64) * 64, '0');
const sel = (sig: string) => '0x' + computeSelector(sig);
const A = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const B = '0x1111111111111111111111111111111111111111';

test('dump abi vectors', () => {
  const cases: VectorCase[] = [];

  // --- canonicalize_signature ---------------------------------------------
  for (const [name, sig] of [
    ['strip-names', 'transfer(address _to, uint256 _value)'],
    ['tuple', 'swap(address executor, (address srcToken, address dstToken) desc)'],
    ['no-params', 'totalSupply()'],
    ['nested-dynamic-tuple', 'exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)'],
    ['arrays', 'batchTransfer(address[] recipients, uint256[] amounts)'],
    ['fixed-array', 'lock(uint256[2] amounts)'],
  ] as Array<[string, string]>) {
    cases.push({
      name: `canonicalize/${name}`,
      fn: 'canonicalize_signature',
      input: { sig },
      expect: { value: canonicalize(sig) },
    });
  }

  // --- compute_selector ----------------------------------------------------
  for (const [name, sig] of [
    ['transfer', 'transfer(address _to, uint256 _value)'],
    ['approve', 'approve(address _spender, uint256 _value)'],
    ['transferFrom', 'transferFrom(address _from, address _to, uint256 _tokenId)'],
    ['setApprovalForAll', 'setApprovalForAll(address _operator, bool _approved)'],
    ['tuple-sig', 'exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)'],
  ] as Array<[string, string]>) {
    cases.push({
      name: `computeSelector/${name}`,
      fn: 'compute_selector',
      input: { sig },
      expect: { value: '0x' + computeSelector(sig) },
    });
  }

  // --- match_selector ------------------------------------------------------
  const transferSig = 'transfer(address _to, uint256 _value)';
  const approveSig = 'approve(address _spender, uint256 _value)';
  const transferData = '0xa9059cbb' + '0'.repeat(128);
  const matchCases: Array<[string, string, string]> = [
    ['hit', transferSig, transferData],
    ['miss', approveSig, transferData],
    ['unknown-selector', transferSig, '0xdeadbeef' + '0'.repeat(128)],
    ['short-data', transferSig, '0xab'],
  ];
  for (const [name, sig, calldata] of matchCases) {
    const tsMatched = matchSelector(calldata, [sig]) !== null;
    cases.push({
      name: `matchSelector/${name}`,
      fn: 'match_selector',
      input: { sig, calldata },
      expect: { value: tsMatched },
    });
  }

  // --- decode_calldata: success set (expectation = oracle values in contract rendering)
  const decodeFixtures: Array<[string, string, string]> = [
    [
      'erc20-transfer',
      transferSig,
      '0xa9059cbb' +
        '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
        '000000000000000000000000000000000000000000000000000000003b9aca00',
    ],
    [
      'erc20-approve-max',
      approveSig,
      '0x095ea7b3' +
        '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' +
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    ],
    [
      'transferFrom-3-params',
      'transferFrom(address _from, address _to, uint256 _tokenId)',
      '0x23b872dd' +
        '000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' +
        '000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' +
        '0000000000000000000000000000000000000000000000000000000000000064',
    ],
    [
      'bool-param',
      'setApprovalForAll(address _operator, bool _approved)',
      '0xa22cb465' +
        '0000000000000000000000001e0049783f008a0085193e00003d00cd54003c71' +
        '0000000000000000000000000000000000000000000000000000000000000001',
    ],
    [
      'zero-value',
      transferSig,
      '0xa9059cbb' +
        '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
        '0000000000000000000000000000000000000000000000000000000000000000',
    ],
    ['static-tuple-in-place', 'register((address owner,uint256 id) info)', sel('register((address owner,uint256 id) info)') + wAddr(A) + wNum(7n)],
    [
      'exactInput-nested-dynamic-tuple',
      'exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)',
      sel('exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)') +
        wNum(0x20n) +
        wNum(0x80n) +
        wAddr(A) +
        wNum(1_000_000n) +
        wNum(999n) +
        wBytes('aabbccddeeff'),
    ],
    ['dynamic-address-array', 'route(address[] hops)', sel('route(address[] hops)') + wNum(0x20n) + wNum(2n) + wAddr(A) + wAddr(B)],
    ['empty-dynamic-array', 'route(address[] hops)', sel('route(address[] hops)') + wNum(0x20n) + wNum(0n)],
    ['string-param', 'greet(string name)', sel('greet(string name)') + wNum(0x20n) + wBytes(Buffer.from('hello', 'utf8').toString('hex'))],
    ['bytes-param', 'execute(bytes data)', sel('execute(bytes data)') + wNum(0x20n) + wBytes('deadbeef00112233')],
    ['bytes32-param', 'foo(bytes32 hash)', sel('foo(bytes32 hash)') + 'ab'.repeat(32)],
    ['int256-negative', 'adjust(int256 delta)', sel('adjust(int256 delta)') + 'f'.repeat(64)],
    ['fixed-array', 'lock(uint256[2] amounts)', sel('lock(uint256[2] amounts)') + wNum(5n) + wNum(9n)],
    [
      'uint-array',
      'setAmounts(uint256[] amounts)',
      sel('setAmounts(uint256[] amounts)') + wNum(0x20n) + wNum(3n) + wNum(1n) + wNum(0n) + wNum(115792089237316195423570985008687907853269984665640564039457584007913129639935n),
    ],
  ];
  for (const [name, sig, calldata] of decodeFixtures) {
    cases.push({
      name: `decodeCalldata/${name}`,
      fn: 'decode_calldata',
      input: { sig, calldata },
      expect: { value: decodedTree(sig, calldata) },
    });
  }

  // --- decode_calldata: agreed error cases (TS null ↔ Rust Err) ------------
  cases.push(
    {
      name: 'decodeCalldata/wrong-selector',
      fn: 'decode_calldata',
      input: { sig: transferSig, calldata: '0xdeadbeef' + '0'.repeat(128) },
      expect: { error: 'AbiDecode' },
    },
    {
      name: 'decodeCalldata/empty-calldata',
      fn: 'decode_calldata',
      input: { sig: 'transfer(address,uint256)', calldata: '0x' },
      expect: { error: 'AbiDecode' },
    },
    {
      name: 'decodeCalldata/bad-signature',
      fn: 'decode_calldata',
      input: { sig: 'not a signature ((', calldata: '0xa9059cbb' },
      expect: { error: 'AbiParse' },
    },
  );

  // Oracle sanity: TS returns null for the two null-cases above
  if (decodeCalldata('0xdeadbeef' + '0'.repeat(128), transferSig) !== null) {
    throw new Error('oracle drift: wrong-selector no longer null');
  }
  if (decodeCalldata('0x', 'transfer(address,uint256)') !== null) {
    throw new Error('oracle drift: empty calldata no longer null');
  }

  // --- enumerated divergences ---------------------------------------------
  cases.push(
    ...divergencesFor('decode_calldata'),
    ...divergencesFor('canonicalize_signature'),
    ...divergencesFor('compute_selector'),
  );

  writeSuite('abi', cases);
});
