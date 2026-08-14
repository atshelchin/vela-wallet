/**
 * ERC-4337 v0.7 userOp assembly for the vela-relay in-band flow, plus the
 * synthetic-WebAuthn owner signature. Byte layouts mirror the app's
 * src/services/safe-transaction.ts (SafeOp EIP-712, contract-signature
 * envelope) and src/services/dev/passkey-fixture.ts (assertion fabrication);
 * cross-repo shapes are pinned by the relay's rpc handler tests.
 */
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, wasm, type StoredKey } from './core';

// Safe v1.4.1 + passkey-module deployment set (chain-independent, mirrors
// rust/crates/vela-core/src/safe.rs).
export const SAFE_PROXY_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
export const SAFE_SINGLETON = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762';
export const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
export const SAFE_4337_MODULE = '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226';
export const MULTI_SEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
export const WEBAUTHN_SIGNER = '0x94a4F6affBd8975951142c3999aEAB7ecee555c2';

export const RP_ID = 'getvela.app';
export const ORIGIN = 'https://getvela.app';

const te = new TextEncoder();

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

export const word = (v: bigint): Uint8Array => {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0 && x > 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
};

export const addressWord = (addr: string): Uint8Array => word(BigInt(addr));

export const pad32 = (b: Uint8Array): Uint8Array => {
  const padded = new Uint8Array(Math.ceil(b.length / 32) * 32);
  padded.set(b);
  return padded;
};

export const selector = (sig: string): Uint8Array => hexToBytes(wasm.computeSelector(sig));
export const keccak = (b: Uint8Array): Uint8Array => Uint8Array.from(wasm.keccak256(b));
export const toHex0x = (b: Uint8Array): string => '0x' + Buffer.from(b).toString('hex');

// ---------------------------------------------------------------------------
// callData / initCode
// ---------------------------------------------------------------------------

export interface Leg {
  to: string;
  value: bigint;
  data: Uint8Array;
}

/** MultiSend packed sub-tx: op(1)=CALL ‖ to(20) ‖ value(32) ‖ dataLen(32) ‖ data. */
const packLeg = (leg: Leg): Uint8Array =>
  concat(
    Uint8Array.of(0),
    hexToBytes(leg.to),
    word(leg.value),
    word(BigInt(leg.data.length)),
    leg.data,
  );

/** `Safe4337Module.executeUserOp(MULTI_SEND, 0, multiSend(legs), 1)` — the
 * relay's in-band parser only credits fee legs inside this exact shape. */
export function buildExecuteCallData(legs: Leg[]): Uint8Array {
  const packed = concat(...legs.map(packLeg));
  const multiSendData = concat(
    selector('multiSend(bytes)'),
    word(0x20n),
    word(BigInt(packed.length)),
    pad32(packed),
  );
  return concat(
    selector('executeUserOp(address,uint256,bytes,uint8)'),
    addressWord(MULTI_SEND),
    word(0n),
    word(0x80n), // offset to bytes
    word(1n), // DELEGATECALL into MultiSend
    word(BigInt(multiSendData.length)),
    pad32(multiSendData),
  );
}

/** initCode = factory ‖ createProxyWithNonce(singleton, setupData, saltNonce). */
export function buildInitCode(setupData: Uint8Array, saltNonce: Uint8Array): Uint8Array {
  return concat(
    hexToBytes(SAFE_PROXY_FACTORY),
    selector('createProxyWithNonce(address,bytes,uint256)'),
    addressWord(SAFE_SINGLETON),
    word(0x60n), // offset to initializer
    saltNonce,
    word(BigInt(setupData.length)),
    pad32(setupData),
  );
}

// ---------------------------------------------------------------------------
// SafeOp EIP-712 hash (what the passkey signs — verifyingContract is the
// 4337 MODULE, not the Safe; validAfter/validUntil fixed 0)
// ---------------------------------------------------------------------------

export interface UserOpFields {
  sender: string;
  nonce: bigint;
  initCode: Uint8Array;
  callData: Uint8Array;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
}

const SAFE_OP_TYPE =
  'SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)';

export function safeOpHash(op: UserOpFields, chainId: bigint): Uint8Array {
  const structHash = keccak(
    concat(
      keccak(te.encode(SAFE_OP_TYPE)),
      addressWord(op.sender),
      word(op.nonce),
      keccak(op.initCode),
      keccak(op.callData),
      word(op.verificationGasLimit),
      word(op.callGasLimit),
      word(op.preVerificationGas),
      word(0n), // maxPriorityFeePerGas — in-band ops are zero-fee
      word(0n), // maxFeePerGas
      keccak(new Uint8Array(0)), // paymasterAndData
      word(0n), // validAfter
      word(0n), // validUntil
      addressWord(ENTRY_POINT),
    ),
  );
  const domain = keccak(
    concat(
      keccak(te.encode('EIP712Domain(uint256 chainId,address verifyingContract)')),
      word(chainId),
      addressWord(SAFE_4337_MODULE),
    ),
  );
  return keccak(concat(Uint8Array.of(0x19, 0x01), domain, structHash));
}

// ---------------------------------------------------------------------------
// Synthetic WebAuthn assertion + contract-signature envelope
// ---------------------------------------------------------------------------

const b64url = (b: Uint8Array): string => Buffer.from(b).toString('base64url');

export interface OwnerSignature {
  owner: string;
  signature: Uint8Array;
}

/**
 * Sign `hash` with a raw P-256 key and wrap it as the Safe 4337 owner
 * signature. `owner` selects the verification route: the shared signer for
 * key 0, or the per-key SafeWebAuthnSignerProxy for later keys — the
 * envelope is byte-identical either way, only the owner word differs.
 * flags MUST carry UV (0x04): the on-chain verifier rejects UP-only.
 */
export function signAsOwner(hash: Uint8Array, key: StoredKey, owner: string): OwnerSignature {
  const clientDataFields = `"origin":"${ORIGIN}","crossOrigin":false`;
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${b64url(hash)}",${clientDataFields}}`;
  const authenticatorData = concat(
    sha256(te.encode(RP_ID)), // rpIdHash — feeds the digest, never checked on-chain
    Uint8Array.of(0x05), // UP | UV
    new Uint8Array(4), // signCount 0
  );
  const digest = sha256(concat(authenticatorData, sha256(te.encode(clientDataJSON))));
  const sig = p256.sign(digest, hexToBytes(key.privateKey), { lowS: true });

  // abi.encode(bytes authenticatorData, string clientDataFields, uint256 r, uint256 s)
  const fieldsBytes = te.encode(clientDataFields);
  const dynamicData = concat(
    word(0x80n),
    word(BigInt(0x80 + 32 + pad32(authenticatorData).length)),
    word(sig.r),
    word(sig.s),
    word(BigInt(authenticatorData.length)),
    pad32(authenticatorData),
    word(BigInt(fieldsBytes.length)),
    pad32(fieldsBytes),
  );
  const signature = concat(
    new Uint8Array(12), // validAfter(6) ‖ validUntil(6) = 0
    addressWord(owner), // r: contract-signature owner
    word(65n), // s: offset to dynamic part
    Uint8Array.of(0x00), // v: ERC-1271 marker
    word(BigInt(dynamicData.length)),
    dynamicData,
  );
  return { owner, signature };
}

/** Correctly sized but non-verifying signature for gas estimation: a real
 * envelope signed over a zero hash. */
export const dummySignature = (key: StoredKey, owner: string): Uint8Array =>
  signAsOwner(new Uint8Array(32), key, owner).signature;

// ---------------------------------------------------------------------------
// Wire format (v0.7 unpacked; relay uses deny_unknown_fields — no extras)
// ---------------------------------------------------------------------------

export function toWireDict(op: UserOpFields, signature: Uint8Array): Record<string, string> {
  const factory = toHex0x(op.initCode.slice(0, 20));
  const factoryData = toHex0x(op.initCode.slice(20));
  const dict: Record<string, string> = {
    sender: op.sender,
    nonce: '0x' + op.nonce.toString(16),
    callData: toHex0x(op.callData),
    callGasLimit: '0x' + op.callGasLimit.toString(16),
    verificationGasLimit: '0x' + op.verificationGasLimit.toString(16),
    preVerificationGas: '0x' + op.preVerificationGas.toString(16),
    maxFeePerGas: '0x0',
    maxPriorityFeePerGas: '0x0',
    signature: toHex0x(signature),
  };
  if (op.initCode.length > 0) {
    dict.factory = factory;
    dict.factoryData = factoryData;
  }
  return dict;
}
