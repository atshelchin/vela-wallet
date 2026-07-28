/**
 * Dump the `safe` conformance suite from the TS oracle (src/services/safe-address.ts)
 * → rust vectors/safe.json. The computeAddress identity vector is cross-referenced
 * with iOS SafeAddressTests.swift and Android SafeAddressComputerTest.kt — a
 * mismatch here means existing users' wallet addresses would change (release blocker).
 */

import {
  computeAddress,
  parsePublicKey,
  calculateSaltNonce,
  encodeSetupData,
  computeSplitterAddress,
  encodeSplitterDeployCall,
  SAFE_PROXY_RUNTIME_CODE,
  PROXY_CREATION_CODE,
  SAFE_SINGLETON,
} from '@/services/safe-address';
import { keccak256, abiEncodeAddress } from '@/services/eth-crypto';
import { fromHex, concatBytes } from '@/services/hex';
import { VectorCase, hex0x, writeSuite } from './writer';
import { divergencesFor } from './divergences';

const TEST_PUBLIC_KEY =
  '04a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6';
const EXPECTED_ADDRESS = '0x762EdA60D3B68755c271D608644650278f88329F';

function safeAddressCase(name: string, publicKeyHex: string): VectorCase {
  const { x, y } = parsePublicKey(publicKeyHex);
  if (x.length !== 32 || y.length !== 32) throw new Error(`bad fixture key for ${name}`);
  const saltNonce = calculateSaltNonce(x, y);
  const setupData = encodeSetupData(x, y);
  const initCodeHash = keccak256(
    concatBytes(fromHex(PROXY_CREATION_CODE), abiEncodeAddress(SAFE_SINGLETON)),
  );
  return {
    name: `computeSafeAddress/${name}`,
    fn: 'compute_safe_address',
    input: { x: hex0x(x), y: hex0x(y) },
    expect: {
      address: computeAddress(publicKeyHex),
      salt_nonce: hex0x(saltNonce),
      setup_data: hex0x(setupData),
      init_code_hash: hex0x(initCodeHash),
    },
  };
}

test('dump safe vectors', () => {
  const cases: VectorCase[] = [];

  // --- parse_public_key ----------------------------------------------------
  for (const [name, input] of [
    ['with-04-prefix', TEST_PUBLIC_KEY],
    ['with-0x04-prefix', '0x' + TEST_PUBLIC_KEY],
    ['bare-xy', TEST_PUBLIC_KEY.slice(2)],
  ] as Array<[string, string]>) {
    const { x, y } = parsePublicKey(input);
    cases.push({
      name: `parsePublicKey/${name}`,
      fn: 'parse_public_key',
      input: { hex: input },
      expect: { x: hex0x(x), y: hex0x(y) },
    });
  }

  // --- compute_safe_address ------------------------------------------------
  const identity = safeAddressCase('identity-vector', TEST_PUBLIC_KEY);
  if (identity.expect.address !== EXPECTED_ADDRESS) {
    throw new Error(`oracle drift: identity address is ${identity.expect.address}`);
  }
  if (
    identity.expect.salt_nonce !==
    '0xff558186314810b914e7a54ec8f9dee960ff493364c68ba36e07dd89f547787a'
  ) {
    throw new Error('oracle drift: identity saltNonce changed');
  }
  cases.push(identity);
  cases.push(safeAddressCase('ff-00-key', '04' + 'ff'.repeat(32) + '00'.repeat(32)));
  cases.push(
    safeAddressCase(
      'patterned-key',
      '04' +
        Array.from({ length: 64 }, (_, i) => ((i * 7 + 13) & 0xff).toString(16).padStart(2, '0')).join(''),
    ),
  );

  // Wrong-length coordinates must error (strict input validation).
  cases.push({
    name: 'computeSafeAddress/short-coordinate',
    fn: 'compute_safe_address',
    input: { x: '0x' + 'aa'.repeat(31), y: '0x' + 'bb'.repeat(32) },
    expect: { error: 'InvalidPublicKey' },
  });

  // --- splitter ------------------------------------------------------------
  for (const [name, treasury] of [
    ['treasury-a', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'],
    ['treasury-b', '0x1111111111111111111111111111111111111111'],
  ] as Array<[string, string]>) {
    cases.push(
      {
        name: `computeSplitterAddress/${name}`,
        fn: 'compute_splitter_address',
        input: { treasury_hex: treasury },
        expect: { value: computeSplitterAddress(treasury) },
      },
      {
        name: `encodeSplitterDeployCall/${name}`,
        fn: 'encode_splitter_deploy_call',
        input: { treasury_hex: treasury },
        expect: { value: hex0x(encodeSplitterDeployCall(treasury)) },
      },
    );
  }

  // --- derived proxy runtime code -----------------------------------------
  cases.push({
    name: 'safeProxyRuntimeCode/derived',
    fn: 'safe_proxy_runtime_code',
    input: {},
    expect: { value: SAFE_PROXY_RUNTIME_CODE },
  });

  cases.push(...divergencesFor('parse_public_key'));

  writeSuite('safe', cases);
});
