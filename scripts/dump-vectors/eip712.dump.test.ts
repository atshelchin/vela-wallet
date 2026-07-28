/**
 * Dump the `eip712` conformance suite from the TS oracle (src/services/eip712.ts)
 * → rust vectors/eip712.json. Upgrades the legacy shape-only asserts
 * (`hash.length === 32`) to captured golden hashes.
 */

import { hashTypedData, type TypedData } from '@/services/eip712';
import { VectorCase, hex0x, expectOracleThrow, writeSuite } from './writer';
import { divergencesFor } from './divergences';

const mail: TypedData = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  message: {
    from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!',
  },
};

test('dump eip712 vectors', () => {
  const cases: VectorCase[] = [];

  const hashCase = (name: string, td: TypedData) => {
    cases.push({
      name: `hashTypedData/${name}`,
      fn: 'hash_typed_data',
      input: { typed_data_json: JSON.stringify(td) },
      expect: { value: hex0x(hashTypedData(td)) },
    });
  };

  // Spec Mail example — must equal the canonical be609aee… hash.
  hashCase('mail-spec-example', mail);
  const specHash = hex0x(hashTypedData(mail));
  if (specHash !== '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2') {
    throw new Error(`oracle drift: Mail spec hash is ${specHash}`);
  }

  // Same payload with EIP712Domain omitted from types (viem/ethers/MetaMask
  // convention — issue #83): identical digest.
  const { EIP712Domain: _omitted, ...typesWithoutDomain } = mail.types;
  hashCase('mail-derived-domain', { ...mail, types: typesWithoutDomain });

  // Derived-domain with a partial domain (no verifyingContract/salt).
  hashCase('derived-partial-domain', {
    types: { Mail: [{ name: 'contents', type: 'string' }] },
    primaryType: 'Mail',
    domain: { name: 'biubiu', version: '1', chainId: 8453 },
    message: { contents: 'gm' },
  });

  // MetaMask-style stringified payload — same digest as the direct object.
  cases.push({
    name: 'hashTypedData/stringified-payload',
    fn: 'hash_typed_data',
    input: { typed_data_json: JSON.stringify(JSON.stringify(mail)) },
    expect: { value: specHash },
  });

  // chainId representations must agree (number / hex string / decimal string).
  hashCase('chainid-as-number', { ...mail, domain: { ...mail.domain, chainId: 137 } });
  hashCase('chainid-as-hex-string', { ...mail, domain: { ...mail.domain, chainId: '0x89' } });
  hashCase('chainid-as-decimal-string', { ...mail, domain: { ...mail.domain, chainId: '137' } });
  {
    const a = hashTypedData({ ...mail, domain: { ...mail.domain, chainId: 137 } });
    const b = hashTypedData({ ...mail, domain: { ...mail.domain, chainId: '0x89' } });
    const c = hashTypedData({ ...mail, domain: { ...mail.domain, chainId: '137' } });
    if (hex0x(a) !== hex0x(b) || hex0x(a) !== hex0x(c)) {
      throw new Error('oracle drift: chainId representations disagree');
    }
  }

  // Value-type coverage (previously shape-only asserts, now golden hashes).
  hashCase('bool-bytes32-address', {
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Test: [
        { name: 'active', type: 'bool' },
        { name: 'hash', type: 'bytes32' },
        { name: 'addr', type: 'address' },
      ],
    },
    primaryType: 'Test',
    domain: { name: 'Test' },
    message: {
      active: true,
      hash: '0x0000000000000000000000000000000000000000000000000000000000000001',
      addr: '0x0000000000000000000000000000000000000001',
    },
  });
  hashCase('bytes-and-string', {
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Doc: [
        { name: 'title', type: 'string' },
        { name: 'content', type: 'bytes' },
      ],
    },
    primaryType: 'Doc',
    domain: { name: 'Test' },
    message: { title: 'Hello', content: '0xdeadbeef' },
  });
  hashCase('uint-array', {
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Batch: [{ name: 'values', type: 'uint256[]' }],
    },
    primaryType: 'Batch',
    domain: { name: 'Test' },
    message: { values: [1, 2, 3] },
  });
  hashCase('nested-structs-sorted-deps', {
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Order: [
        { name: 'maker', type: 'Identity' },
        { name: 'amount', type: 'uint256' },
      ],
      Identity: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
    },
    primaryType: 'Order',
    domain: { name: 'Exchange' },
    message: {
      maker: { name: 'Alice', wallet: '0x0000000000000000000000000000000000000001' },
      amount: 100,
    },
  });
  hashCase('int256-negative', {
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Signed: [{ name: 'val', type: 'int256' }],
    },
    primaryType: 'Signed',
    domain: { name: 'Test' },
    message: { val: -1 },
  });
  hashCase('permit2-single', {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' },
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
    },
    primaryType: 'PermitSingle',
    domain: {
      name: 'Permit2',
      chainId: 1,
      verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    },
    message: {
      details: {
        token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '1461501637330902918203684832716283019655932542975',
        expiration: 1717200000,
        nonce: 0,
      },
      spender: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      sigDeadline: 1717200000,
    },
  });

  // Agreed rejections (TS throws ↔ Rust errors).
  const unknownType: TypedData = {
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Bad: [{ name: 'val', type: 'tuple' }],
    },
    primaryType: 'Bad',
    domain: { name: 'Test' },
    message: { val: 'something' },
  };
  cases.push({
    name: 'hashTypedData/unsupported-type',
    fn: 'hash_typed_data',
    input: { typed_data_json: JSON.stringify(unknownType) },
    expect: expectOracleThrow('eip712 unsupported type', 'Eip712Parse', () =>
      hashTypedData(unknownType),
    ),
  });
  cases.push({
    name: 'hashTypedData/not-json',
    fn: 'hash_typed_data',
    input: { typed_data_json: 'not json at all {{' },
    expect: { error: 'Eip712Parse' },
  });

  // encode_type: display string of the primary type (hand-pinned to the
  // EIP-712 spec's own example — the TS oracle never exposed this helper).
  cases.push({
    name: 'encodeType/mail-spec-example',
    fn: 'encode_type',
    input: { typed_data_json: JSON.stringify(mail) },
    expect: {
      value: 'Mail(Person from,Person to,string contents)Person(string name,address wallet)',
    },
  });

  cases.push(...divergencesFor('hash_typed_data'));

  writeSuite('eip712', cases);
});
