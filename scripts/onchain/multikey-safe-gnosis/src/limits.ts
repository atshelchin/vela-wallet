/**
 * Probe: how many keys can a multi-passkey Safe carry through the production
 * relay? For each N, build an EPHEMERAL unfunded N-key wallet and run
 * eth_estimateUserOperationGas for its deployment userOp (zero-fee in-band
 * model needs no balance to simulate; nothing is submitted on-chain).
 */
import { generateKeys, hexToBytes, packKeys, relayCall, rpc, wasm } from './core';
import {
  ENTRY_POINT,
  buildExecuteCallData,
  buildInitCode,
  dummySignature,
  toHex0x,
  toWireDict,
  type UserOpFields,
} from './userop';

const NS = (process.env.N_LIST ?? '7').split(',').map(Number);

const quote = (await relayCall('vela_getInBandGasQuote', [
  { safeAddress: '0x' + '11'.repeat(20) },
])) as Array<{ recipient: string; asset: string }>;
const recipient = quote.find((q) => q.asset === 'native')!.recipient;

for (const n of NS) {
  const keys = generateKeys(n);
  let info: ReturnType<typeof wasm.computeSafeAddressMulti>;
  try {
    info = wasm.computeSafeAddressMulti(packKeys(keys));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.log(`N=${String(n).padStart(3)}  rejected by vela-core: [${err.code}] ${err.message}`);
    continue;
  }
  const op: UserOpFields = {
    sender: info.address,
    nonce: 0n,
    initCode: buildInitCode(hexToBytes(info.setup_data), hexToBytes(info.salt_nonce)),
    callData: buildExecuteCallData([{ to: recipient, value: 0n, data: new Uint8Array(0) }]),
    verificationGasLimit: 10_000_000n,
    callGasLimit: 200_000n,
    preVerificationGas: 100_000n,
  };
  const owner = wasm.computeWebauthnSignerAddress(hexToBytes(keys[1].x), hexToBytes(keys[1].y));
  const setupBytes = (info.setup_data.length - 2) / 2;

  // Ground truth: simulate the actual factory deployment on Gnosis. This is
  // the initCode-phase work the 4337 verificationGasLimit must cover.
  let deployGas = 'FAIL';
  try {
    const g = (await rpc('eth_estimateGas', [
      { to: op.initCode.slice(0, 20).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '0x'), data: toHex0x(op.initCode.slice(20)) },
    ])) as string;
    deployGas = BigInt(g).toString();
  } catch (e) {
    deployGas = `FAIL: ${(e as Error).message.slice(0, 60)}`;
  }

  try {
    const est = (await relayCall('eth_estimateUserOperationGas', [
      toWireDict(op, dummySignature(keys[1], owner)),
      ENTRY_POINT,
    ])) as Record<string, string>;
    console.log(
      `N=${String(n).padStart(3)}  setup=${setupBytes}B  factoryDeployGas=${deployGas}  relay: verification=${BigInt(est.verificationGasLimit)} call=${BigInt(est.callGasLimit)} preVerification=${BigInt(est.preVerificationGas)}  OK`,
    );
  } catch (e) {
    console.log(
      `N=${String(n).padStart(3)}  setup=${setupBytes}B  factoryDeployGas=${deployGas}  relay REJECTED: ${(e as Error).message}`,
    );
  }
}
