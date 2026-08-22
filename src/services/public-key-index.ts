/**
 * Client for WebAuthn P256 Public Key Index API.
 *
 * The server stores public keys on Gnosis Chain. No signature/challenge
 * required — the server wallet signs transactions automatically.
 */

import { loadServiceEndpoints } from './storage';
import {
  abiEncodeUint256,
  concatBytes,
  fromHex,
  functionSelector,
  toHex,
} from '@/services/vela-core';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import { fetchWithTimeout, isTimeoutError, NET_TIMEOUTS } from './net';

const FALLBACK_URL = DEFAULT_SERVICE_ENDPOINTS.passkeyIndexURL;

/** Cached base URL — refreshed from storage on each call to avoid stale config. */
let _cachedUrl: string | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5_000; // 5s — re-read storage periodically in case user changes it

async function getBaseUrl(): Promise<string> {
  const now = Date.now();
  if (_cachedUrl && now - _cachedAt < CACHE_TTL) return _cachedUrl;
  try {
    const endpoints = await loadServiceEndpoints();
    _cachedUrl = endpoints.passkeyIndexURL?.trim().replace(/\/$/, '') || FALLBACK_URL;
  } catch {
    _cachedUrl = FALLBACK_URL;
  }
  _cachedAt = now;
  return _cachedUrl;
}

export interface PublicKeyRecord {
  rpId: string;
  credentialId: string;
  publicKey: string;
  name: string;
  initialCredentialId?: string;
  metadata?: string;
  createdAt: number;
}

interface CreateRequest {
  rpId: string;
  credentialId: string;
  publicKey: string;
  name: string;
  initialCredentialId?: string;
  metadata?: string;
}

/** Store a public key record. No signature needed — server signs on-chain tx. */
export async function createRecord(request: CreateRequest): Promise<PublicKeyRecord> {
  const baseUrl = await getBaseUrl();
  const response = await fetchWithTimeout(
    `${baseUrl}/api/create`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Best-effort idempotency: a backend that honours this header collapses a
        // timeout-then-retry into one record. The natural key is (rpId,
        // credentialId), so the same passkey never produces a second entry even
        // if the backend ignores the header. See uploadPublicKey's verify step.
        'Idempotency-Key': `${request.rpId}:${request.credentialId}`,
      },
      body: JSON.stringify(request),
    },
    { timeoutMs: NET_TIMEOUTS.keyIndexWrite },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create failed: ${response.status} ${text}`);
  }
  return response.json();
}

/**
 * The FROZEN v1 index CONTRACT on Gnosis — the permanent home of a v1-era
 * wallet's display name. `passkeyIndexURL` now points at the v2 registry
 * and the v1 Worker may one day be decommissioned, but the chain cannot
 * be: `getRecord(rpId, credentialId).name` is read straight from the
 * contract, through the wallet's own pooled RPC.
 */
export const LEGACY_INDEX_CONTRACT = '0xdd93420BD49baaBdFF4A363DdD300622Ae87E9c3';
export const LEGACY_INDEX_CHAIN_ID = 100; // Gnosis

/** ABI-encode one dynamic `string`/`bytes` tail: length word + padded data. */
function abiTail(data: Uint8Array): Uint8Array {
  const pad = (32 - (data.length % 32)) % 32;
  return concatBytes(abiEncodeUint256(BigInt(data.length)), data, new Uint8Array(pad));
}

/** Calldata for `getRecord(string rpId, string credentialId)`. */
function encodeGetRecord(rpId: string, credentialId: string): Uint8Array {
  const enc = new TextEncoder();
  const rpTail = abiTail(enc.encode(rpId));
  const head = concatBytes(
    abiEncodeUint256(64n), // offset of rpId (2 head slots)
    abiEncodeUint256(BigInt(64 + rpTail.length)), // offset of credentialId
  );
  return concatBytes(
    functionSelector('getRecord(string,string)'),
    head,
    rpTail,
    abiTail(enc.encode(credentialId)),
  );
}

/** Read a uint256 word at byte offset `at`. */
function word(data: Uint8Array, at: number): number {
  let out = 0;
  for (let i = at; i < at + 32; i++) out = out * 256 + data[i];
  return out;
}

/**
 * Decode `PublicKeyRecord.name` out of a `getRecord` return: one struct
 * (via a top-level offset) whose slot 4 is the offset of the dynamic
 * `name` field, relative to the struct start.
 */
function decodeRecordName(returnData: Uint8Array): string | null {
  try {
    const structStart = word(returnData, 0);
    const nameOffset = structStart + word(returnData, structStart + 4 * 32);
    const nameLength = word(returnData, nameOffset);
    const nameBytes = returnData.slice(nameOffset + 32, nameOffset + 32 + nameLength);
    if (nameBytes.length !== nameLength) return null;
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes).trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * The v1 record's display name for a credential, or null (no record —
 * `getRecord` reverts — a v2-era wallet, or the RPC being unreachable).
 * Never throws: a lost legacy name must degrade the label, not the login.
 */
export async function queryLegacyName(rpId: string, credentialId: string): Promise<string | null> {
  try {
    const { rpcCall } = await import('./rpc-adapter');
    const response = await rpcCall(
      'eth_call',
      [{ to: LEGACY_INDEX_CONTRACT, data: '0x' + toHex(encodeGetRecord(rpId, credentialId)) }, 'latest'],
      LEGACY_INDEX_CHAIN_ID,
    );
    const result = (response as { result?: string }).result;
    if (!result || result === '0x') return null; // reverted ⇒ no record
    return decodeRecordName(fromHex(result.slice(2)));
  } catch {
    return null;
  }
}

/** Query a public key by rpId and credentialId. */
export async function queryRecord(rpId: string, credentialId: string): Promise<PublicKeyRecord> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/query?rpId=${encodeURIComponent(rpId)}&credentialId=${encodeURIComponent(credentialId)}`;
  const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
  if (!response.ok) throw new Error(`Query failed: ${response.status}`);
  return response.json();
}

/** Convert a 20-byte address to a bytes32 hex string (left-padded with zeros). */
function addressToBytes32(address: string): string {
  const stripped = address.toLowerCase().replace(/^0x/, '');
  return '0x' + stripped.padStart(64, '0');
}

/** Query a public key record by wallet address (walletRef). Returns null if not found. */
export async function queryByWalletRef(address: string): Promise<PublicKeyRecord | null> {
  if (/^0x0+$/.test(address)) return null; // zero address has no index entry — skip the doomed 404
  const baseUrl = await getBaseUrl();
  const walletRef = addressToBytes32(address);
  const url = `${baseUrl}/api/query?walletRef=${encodeURIComponent(walletRef)}`;
  try {
    const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    // Identity lookup is best-effort enrichment (badge/contact name). A slow or
    // unreachable index must degrade to "unknown recipient", never block signing.
    if (isTimeoutError(err)) return null;
    throw err;
  }
}
