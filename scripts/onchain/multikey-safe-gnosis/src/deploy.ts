/**
 * Step 3: deploy the multi-passkey Safe through vela-relay with in-band gas.
 *
 * Flow: quote (vela_getInBandGasQuote) → build executeUserOp(MultiSend[fee
 * leg]) → estimate → size the fee (3× gas cost, 0.00001 xDAI floor) → sign
 * the SafeOp EIP-712 hash with SIGNER_INDEX's key (default 1 — a NON-first
 * key, proving the embedded createSigner design: the signer proxy only comes
 * into existence inside this very transaction's setup) → submit → poll.
 */
import { awaitReceipt, hexToBytes, loadState, relayCall, rpc, wasm, CHAIN_ID } from './core';
import {
  ENTRY_POINT,
  WEBAUTHN_SIGNER,
  buildExecuteCallData,
  buildInitCode,
  dummySignature,
  safeOpHash,
  signAsOwner,
  toWireDict,
  toHex0x,
  type Leg,
  type UserOpFields,
} from './userop';

const SIGNER_INDEX = Number(process.env.SIGNER_INDEX ?? 1);
const FEE_FLOOR = 10n ** 13n; // 0.00001 xDAI — relay admission minimum

const state = loadState();
const key = state.keys[SIGNER_INDEX];
if (!key) throw new Error(`no key at SIGNER_INDEX=${SIGNER_INDEX}`);
const owner =
  SIGNER_INDEX === 0
    ? WEBAUTHN_SIGNER
    : wasm.computeWebauthnSignerAddress(hexToBytes(key.x), hexToBytes(key.y));

console.log(`Safe:   ${state.safeAddress}`);
console.log(`signer: key ${SIGNER_INDEX} → owner ${owner}`);

const code = (await rpc('eth_getCode', [state.safeAddress, 'latest'])) as string;
if (code !== '0x') throw new Error('Safe already deployed — nothing to do');
const balance = BigInt((await rpc('eth_getBalance', [state.safeAddress, 'latest'])) as string);
if (balance === 0n) throw new Error('Safe is unfunded — send xDAI first');

// 1. In-band gas quote → settlement recipient for the native fee leg.
const quote = (await relayCall('vela_getInBandGasQuote', [
  { safeAddress: state.safeAddress },
])) as Array<{ recipient: string; asset: string }>;
const native = quote.find((q) => q.asset === 'native');
if (!native) throw new Error(`no native quote row: ${JSON.stringify(quote)}`);
console.log(`fee →   ${native.recipient} (in-band native)`);

const initCode = buildInitCode(hexToBytes(state.setupData), hexToBytes(state.saltNonce));
const buildOp = (fee: bigint, gas: Pick<UserOpFields, 'verificationGasLimit' | 'callGasLimit' | 'preVerificationGas'>): UserOpFields => {
  const legs: Leg[] = [{ to: native.recipient, value: fee, data: new Uint8Array(0) }];
  return {
    sender: state.safeAddress,
    nonce: 0n,
    initCode,
    callData: buildExecuteCallData(legs),
    ...gas,
  };
};

// 2. Ground truth first: simulate the factory deployment itself (the
// initCode-phase work) and derive verificationGasLimit from it with margin
// for 4337 validation + the WebAuthn signature check. The relay both
// SIMULATES WITH the limits you pass (a low provisional OOGs the estimate
// for large wallets) and bottoms its verification estimate out at a floor,
// so its number is never used for verification.
const deployGas = BigInt(
  (await rpc('eth_estimateGas', [
    { to: toHex0x(initCode.slice(0, 20)), data: toHex0x(initCode.slice(20)) },
  ])) as string,
);
const verificationGasLimit = bigMax((deployGas * 12n) / 10n + 300_000n, 2_000_000n);

// 3. Relay estimate (for call/preVerification) with the real verification.
const provisional = buildOp(FEE_FLOOR, {
  verificationGasLimit,
  callGasLimit: 200_000n,
  preVerificationGas: 100_000n,
});
const est = (await relayCall('eth_estimateUserOperationGas', [
  toWireDict(provisional, dummySignature(key, owner)),
  ENTRY_POINT,
])) as Record<string, string>;
const gas = {
  verificationGasLimit,
  callGasLimit: bigMax((BigInt(est.callGasLimit) * 3n) / 2n, 200_000n),
  preVerificationGas: BigInt(est.preVerificationGas) + 10_000n,
};
console.log(
  `gas:    verification=${gas.verificationGasLimit} call=${gas.callGasLimit} preVerification=${gas.preVerificationGas}`,
);

// 3. Size the fee: 3× estimated cost at current gas price, floored.
const gasPrice = BigInt((await rpc('eth_gasPrice', [])) as string);
const totalGas = gas.verificationGasLimit + gas.callGasLimit + gas.preVerificationGas;
const fee = bigMax(totalGas * gasPrice * 3n, FEE_FLOOR);
console.log(`fee:    ${Number(fee) / 1e18} xDAI (gasPrice ${gasPrice})`);
if (fee > balance) throw new Error(`fee ${fee} exceeds balance ${balance}`);

// 4. Sign the SafeOp hash and submit.
const op = buildOp(fee, gas);
const hash = safeOpHash(op, CHAIN_ID);
const { signature } = signAsOwner(hash, key, owner);
const userOpHash = (await relayCall('eth_sendUserOperation', [
  toWireDict(op, signature),
  ENTRY_POINT,
])) as string;
console.log(`userOp: ${userOpHash}`);
await awaitReceipt(userOpHash);

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
