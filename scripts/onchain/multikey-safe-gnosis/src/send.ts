/**
 * Step 4: send a normal transaction from the DEPLOYED Safe, signed by any of
 * the keys (SIGNER_INDEX). Proves every owner can operate the wallet:
 * key 0 via the shared signer, later keys via their signer proxies.
 * Default: 0.0001 xDAI self-transfer (visible on-chain, balance unchanged
 * beyond the in-band fee).
 */
import { awaitReceipt, hexToBytes, loadState, relayCall, rpc, wasm, CHAIN_ID } from './core';
import {
  ENTRY_POINT,
  WEBAUTHN_SIGNER,
  addressWord,
  buildExecuteCallData,
  concat,
  dummySignature,
  safeOpHash,
  selector,
  signAsOwner,
  toHex0x,
  toWireDict,
  word,
  type Leg,
  type UserOpFields,
} from './userop';

const SIGNER_INDEX = Number(process.env.SIGNER_INDEX ?? 0);
const FEE_FLOOR = 10n ** 13n;

const state = loadState();
const key = state.keys[SIGNER_INDEX];
if (!key) throw new Error(`no key at SIGNER_INDEX=${SIGNER_INDEX}`);
const owner =
  SIGNER_INDEX === 0
    ? WEBAUTHN_SIGNER
    : wasm.computeWebauthnSignerAddress(hexToBytes(key.x), hexToBytes(key.y));
const to = process.env.TO ?? state.safeAddress;
// Decimal-string parse — float×1e18 corrupts amounts beyond ~2^53 wei.
const parseXDai = (s: string): bigint => {
  const [int = '0', frac = ''] = s.split('.');
  if (!/^\d*$/.test(int) || !/^\d*$/.test(frac) || frac.length > 18 || (!int && !frac)) {
    throw new Error(`bad VALUE_XDAI: ${s}`);
  }
  return BigInt(int || '0') * 10n ** 18n + BigInt(frac.padEnd(18, '0') || '0');
};
const value = parseXDai(process.env.VALUE_XDAI ?? '0.0001');

console.log(`Safe:   ${state.safeAddress}`);
console.log(`signer: key ${SIGNER_INDEX} → owner ${owner}`);
console.log(`send:   ${Number(value) / 1e18} xDAI → ${to}`);

if (((await rpc('eth_getCode', [state.safeAddress, 'latest'])) as string) === '0x') {
  throw new Error('Safe not deployed yet — run `bun run deploy` first');
}

// nonce from EntryPoint.getNonce(sender, key=0)
const nonceHex = (await rpc('eth_call', [
  {
    to: ENTRY_POINT,
    data: toHex0x(
      concat(selector('getNonce(address,uint192)'), addressWord(state.safeAddress), word(0n)),
    ),
  },
  'latest',
])) as string;
const nonce = BigInt(nonceHex);
console.log(`nonce:  ${nonce}`);

const quote = (await relayCall('vela_getInBandGasQuote', [
  { safeAddress: state.safeAddress },
])) as Array<{ recipient: string; asset: string }>;
const native = quote.find((q) => q.asset === 'native');
if (!native) throw new Error(`no native quote row: ${JSON.stringify(quote)}`);

const buildOp = (
  fee: bigint,
  gas: Pick<UserOpFields, 'verificationGasLimit' | 'callGasLimit' | 'preVerificationGas'>,
): UserOpFields => {
  const legs: Leg[] = [
    { to, value, data: new Uint8Array(0) },
    { to: native.recipient, value: fee, data: new Uint8Array(0) }, // fee leg last
  ];
  return {
    sender: state.safeAddress,
    nonce,
    initCode: new Uint8Array(0),
    callData: buildExecuteCallData(legs),
    ...gas,
  };
};

const provisional = buildOp(FEE_FLOOR, {
  verificationGasLimit: 300_000n,
  callGasLimit: 200_000n,
  preVerificationGas: 100_000n,
});
const est = (await relayCall('eth_estimateUserOperationGas', [
  toWireDict(provisional, dummySignature(key, owner)),
  ENTRY_POINT,
])) as Record<string, string>;
const gas = {
  verificationGasLimit: bigMax((BigInt(est.verificationGasLimit) * 3n) / 2n, 300_000n),
  callGasLimit: bigMax((BigInt(est.callGasLimit) * 3n) / 2n, 200_000n),
  preVerificationGas: BigInt(est.preVerificationGas) + 10_000n,
};

const gasPrice = BigInt((await rpc('eth_gasPrice', [])) as string);
const totalGas = gas.verificationGasLimit + gas.callGasLimit + gas.preVerificationGas;
const fee = bigMax(totalGas * gasPrice * 3n, FEE_FLOOR);
console.log(`fee:    ${Number(fee) / 1e18} xDAI`);

const op = buildOp(fee, gas);
const { signature } = signAsOwner(safeOpHash(op, CHAIN_ID), key, owner);
const userOpHash = (await relayCall('eth_sendUserOperation', [
  toWireDict(op, signature),
  ENTRY_POINT,
])) as string;
console.log(`userOp: ${userOpHash}`);
await awaitReceipt(userOpHash);

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
