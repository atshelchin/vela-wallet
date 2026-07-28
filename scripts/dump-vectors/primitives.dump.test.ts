/**
 * Dump the `primitives` conformance suite from the TS oracle
 * (src/services/{hex,sha256,eth-crypto}.ts) → rust vectors/primitives.json.
 */

import {
  toHex,
  fromHex,
  toQuantity,
  toBase64Url,
  fromBase64Url,
} from '@/services/hex';
import { sha256 } from '@/services/sha256';
import {
  keccak256,
  functionSelector,
  create2Address,
  checksumAddress,
  abiEncodeAddress,
  abiEncodeUint256Hex,
  abiEncodeBytes32,
} from '@/services/eth-crypto';
import { VectorCase, hex0x, utf8, patternedBytes, expectOracleThrow, writeSuite } from './writer';
import { divergencesFor } from './divergences';

test('dump primitives vectors', () => {
  const cases: VectorCase[] = [];

  // --- keccak256 -----------------------------------------------------------
  const keccakInputs: Array<[string, Uint8Array]> = [
    ['empty', utf8('')],
    ['hello', utf8('hello')],
    ['fox', utf8('The quick brown fox jumps over the lazy dog')],
    ['abc', utf8('abc')],
    ['single-zero-byte', new Uint8Array([0x00])],
    // Sponge-rate boundaries (rate = 136 bytes for Keccak-256)
    ['rate-minus-1', patternedBytes(135)],
    ['rate-exact', patternedBytes(136)],
    ['rate-plus-1', patternedBytes(137)],
    ['two-blocks', patternedBytes(272)],
  ];
  for (const [name, data] of keccakInputs) {
    cases.push({
      name: `keccak256/${name}`,
      fn: 'keccak256',
      input: { data: hex0x(data) },
      expect: { value: hex0x(keccak256(data)) },
    });
  }

  // --- sha256 --------------------------------------------------------------
  cases.push(
    {
      name: 'sha256/empty',
      fn: 'sha256',
      input: { data: hex0x(utf8('')) },
      expect: { value: hex0x(sha256(utf8(''))) },
    },
    {
      name: 'sha256/abc',
      fn: 'sha256',
      input: { data: hex0x(utf8('abc')) },
      expect: { value: hex0x(sha256(utf8('abc'))) },
    },
  );
  // Size sweep mirroring the existing p256-recovery.test.ts sha256 suite
  // (covers the 55/56/64 padding boundaries of FIPS 180-4).
  for (const size of [1, 31, 55, 56, 63, 64, 65, 127, 128, 1000]) {
    const data = patternedBytes(size);
    cases.push({
      name: `sha256/size-${size}`,
      fn: 'sha256',
      input: { data: hex0x(data) },
      expect: { value: hex0x(sha256(data)) },
    });
  }

  // --- checksum_address ----------------------------------------------------
  const checksumInputs: Array<[string, string]> = [
    ['known-vector', '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'],
    ['eip55-spec-1', '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'],
    ['eip55-spec-2', '0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb'],
    ['eip55-spec-3', '0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb'],
    ['all-caps-input', '0x52908400098527886E0F7030069857D2E4169EE7'],
    ['no-prefix', '5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'],
    ['already-checksummed', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'],
  ];
  for (const [name, addr] of checksumInputs) {
    cases.push({
      name: `checksumAddress/${name}`,
      fn: 'checksum_address',
      input: { address_hex: addr },
      expect: { value: checksumAddress(addr) },
    });
  }
  cases.push({
    name: 'checksumAddress/wrong-length',
    fn: 'checksum_address',
    input: { address_hex: '0x1234' },
    expect: expectOracleThrow('checksumAddress wrong length', 'InvalidAddress', () =>
      checksumAddress('0x1234'),
    ),
  });

  // --- function_selector (canonical signatures only: the TS oracle hashes
  // the raw string; named-param canonicalization vectors live in the abi suite)
  for (const sig of [
    'transfer(address,uint256)',
    'approve(address,uint256)',
    'setup(address[],uint256,address,bytes,address,address,uint256,address)',
    'multiSend(bytes)',
    'balanceOf(address)',
    'enableModules(address[])',
  ]) {
    cases.push({
      name: `functionSelector/${sig.split('(')[0]}`,
      fn: 'function_selector',
      input: { signature: sig },
      expect: { value: hex0x(functionSelector(sig)) },
    });
  }

  // --- create2_address -----------------------------------------------------
  const create2Fixtures: Array<[string, string, Uint8Array, Uint8Array]> = [
    [
      'arachnid-factory',
      '0x4e59b44847b379578588920cA78FbF26c0B4956C',
      keccak256(utf8('vela test salt')),
      keccak256(utf8('some init code')),
    ],
    [
      'safe-proxy-factory',
      '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
      new Uint8Array(32),
      keccak256(utf8('proxy creation code')),
    ],
    [
      'zero-salt-zero-hash',
      '0x0000000000000000000000000000000000000001',
      new Uint8Array(32),
      new Uint8Array(32),
    ],
  ];
  for (const [name, factory, salt, hash] of create2Fixtures) {
    cases.push({
      name: `create2Address/${name}`,
      fn: 'create2_address',
      input: { deployer_hex: factory, salt: hex0x(salt), init_code_hash: hex0x(hash) },
      expect: { value: create2Address(factory, salt, hash) },
    });
  }
  cases.push({
    name: 'create2Address/short-salt',
    fn: 'create2_address',
    input: {
      deployer_hex: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
      salt: hex0x(new Uint8Array(31)),
      init_code_hash: hex0x(new Uint8Array(32)),
    },
    expect: expectOracleThrow('create2 short salt', 'InvalidAddress', () =>
      create2Address('0x4e59b44847b379578588920cA78FbF26c0B4956C', new Uint8Array(31), new Uint8Array(32)),
    ),
  });

  // --- to_hex / from_hex ---------------------------------------------------
  const bytesSamples: Array<[string, Uint8Array]> = [
    ['empty', new Uint8Array(0)],
    ['deadbeef', new Uint8Array([0xde, 0xad, 0xbe, 0xef])],
    ['leading-zero', new Uint8Array([0x00, 0x01])],
    ['all-values-run', patternedBytes(64)],
  ];
  for (const [name, data] of bytesSamples) {
    cases.push(
      {
        name: `toHex/${name}-unprefixed`,
        fn: 'to_hex',
        input: { data: hex0x(data), prefixed: false },
        expect: { value: toHex(data) },
      },
      {
        name: `toHex/${name}-prefixed`,
        fn: 'to_hex',
        input: { data: hex0x(data), prefixed: true },
        expect: { value: '0x' + toHex(data) },
      },
    );
  }
  for (const [name, s] of [
    ['prefixed', '0xdeadbeef'],
    ['bare', 'deadbeef'],
    ['mixed-case', 'DeAdBeEf'],
    ['empty', ''],
    ['bare-0x', '0x'],
  ] as Array<[string, string]>) {
    cases.push({
      name: `fromHex/${name}`,
      fn: 'from_hex',
      input: { s },
      expect: { value: hex0x(fromHex(s)) },
    });
  }
  cases.push({
    name: 'fromHex/odd-length',
    fn: 'from_hex',
    input: { s: 'abc' },
    expect: expectOracleThrow('fromHex odd length', 'InvalidHex', () => fromHex('abc')),
  });

  // --- to_quantity (agreement set; strictness divergences appended below) ---
  const quantityInputs: Array<[string, string]> = [
    ['ethers-v5-padded', '0x0de0b6b3a7640000'],
    ['already-canonical', '0xde0b6b3a7640000'],
    ['zero-hex', '0x0'],
    ['zero-padded', '0x000'],
    ['empty-string', ''],
    ['bare-0x', '0x'],
    ['decimal', '123'],
    ['decimal-zero', '0'],
    ['uppercase-hex', '0xABC'],
    ['u256-max', '115792089237316195423570985008687907853269984665640564039457584007913129639935'],
    // BigInt lenience classes the tx value/gas path actually receives from dApps.
    ['uppercase-0x-prefix', '0X1F'],
    ['surrounding-whitespace', ' 12 '],
    ['leading-plus', '+5'],
    ['binary-prefix', '0b101'],
    ['octal-prefix', '0o17'],
  ];
  for (const [name, value] of quantityInputs) {
    cases.push({
      name: `toQuantity/${name}`,
      fn: 'to_quantity',
      input: { value },
      expect: { value: toQuantity(value) },
    });
  }

  // --- base64url -----------------------------------------------------------
  const b64Samples: Array<[string, Uint8Array]> = [
    ['empty', new Uint8Array(0)],
    ['one-byte', new Uint8Array([0])],
    ['two-bytes', new Uint8Array([255, 254])],
    ['three-bytes', new Uint8Array([255, 254, 253])],
    ['hello-world', utf8('hello world')],
    ['credential-id-shaped', patternedBytes(32)],
    ['url-unsafe-chars', new Uint8Array([0xfb, 0xff, 0xbf, 0x3e, 0x3f])],
  ];
  for (const [name, data] of b64Samples) {
    const encoded = toBase64Url(data);
    cases.push(
      {
        name: `toBase64Url/${name}`,
        fn: 'to_base64url',
        input: { data: hex0x(data) },
        expect: { value: encoded },
      },
      {
        name: `fromBase64Url/${name}`,
        fn: 'from_base64url',
        input: { s: encoded },
        expect: { value: hex0x(fromBase64Url(encoded)) },
      },
    );
  }
  cases.push(
    {
      name: 'fromBase64Url/padded-input-tolerated',
      fn: 'from_base64url',
      input: { s: 'AA==' },
      expect: { value: hex0x(fromBase64Url('AA==')) },
    },
    {
      // Both sides reject: TS re-pads to 'AA======' and atob throws.
      name: 'fromBase64Url/excess-padding',
      fn: 'from_base64url',
      input: { s: 'AA====' },
      expect: expectOracleThrow('base64url excess padding', 'InvalidBase64Url', () =>
        fromBase64Url('AA===='),
      ),
    },
  );

  // --- abi word encoders ---------------------------------------------------
  cases.push(
    {
      name: 'abiEncodeAddress/checksummed',
      fn: 'abi_encode_address',
      input: { address_hex: '0x4e59b44847b379578588920cA78FbF26c0B4956C' },
      expect: { value: hex0x(abiEncodeAddress('0x4e59b44847b379578588920cA78FbF26c0B4956C')) },
    },
    {
      name: 'abiEncodeAddress/short',
      fn: 'abi_encode_address',
      input: { address_hex: '0x1234' },
      expect: expectOracleThrow('abiEncodeAddress short', 'InvalidAddress', () =>
        abiEncodeAddress('0x1234'),
      ),
    },
    {
      name: 'abiEncodeUint256/one',
      fn: 'abi_encode_uint256',
      input: { value_hex: '0x1' },
      expect: { value: hex0x(abiEncodeUint256Hex('0x1')) },
    },
    {
      name: 'abiEncodeUint256/wei-amount',
      fn: 'abi_encode_uint256',
      input: { value_hex: '0xde0b6b3a7640000' },
      expect: { value: hex0x(abiEncodeUint256Hex('0xde0b6b3a7640000')) },
    },
    {
      name: 'abiEncodeUint256/max',
      fn: 'abi_encode_uint256',
      input: { value_hex: '0x' + 'ff'.repeat(32) },
      expect: { value: hex0x(abiEncodeUint256Hex('0x' + 'ff'.repeat(32))) },
    },
    {
      name: 'abiEncodeBytes32/short-payload',
      fn: 'abi_encode_bytes32',
      input: { data: hex0x(utf8('vela')) },
      expect: { value: hex0x(abiEncodeBytes32(utf8('vela'))) },
    },
    {
      name: 'abiEncodeBytes32/full-width',
      fn: 'abi_encode_bytes32',
      input: { data: hex0x(patternedBytes(32)) },
      expect: { value: hex0x(abiEncodeBytes32(patternedBytes(32))) },
    },
    {
      name: 'abiEncodeBytes32/too-long',
      fn: 'abi_encode_bytes32',
      input: { data: hex0x(patternedBytes(33)) },
      expect: expectOracleThrow('abiEncodeBytes32 too long', 'InvalidHex', () =>
        abiEncodeBytes32(patternedBytes(33)),
      ),
    },
  );

  // --- enumerated divergences (hand-maintained; never computed from TS) ----
  cases.push(
    ...divergencesFor('from_hex'),
    ...divergencesFor('to_quantity'),
    ...divergencesFor('from_base64url'),
  );

  writeSuite('primitives', cases);
});
