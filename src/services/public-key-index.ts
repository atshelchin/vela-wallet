/**
 * Client for WebAuthn P256 Public Key Index API.
 *
 * The server stores public keys on Gnosis Chain. No signature/challenge
 * required — the server wallet signs transactions automatically.
 */

import { loadServiceEndpoints } from './storage';
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
 * The FROZEN v1 index deployment. `passkeyIndexURL` now points at the v2
 * registry, but wallets created in the v1 era have their display name only
 * HERE (v1 stored it server-side; the v2 group metadata is written at
 * publish time and cannot recover it). Read-only, best-effort.
 */
export const LEGACY_INDEX_URL = 'https://p256-index.getvela.app';

/**
 * The v1 record's display name for a credential, or null. Never throws —
 * a lost legacy name must degrade the label, not the login.
 */
export async function queryLegacyName(rpId: string, credentialId: string): Promise<string | null> {
  try {
    const url = `${LEGACY_INDEX_URL}/api/query?rpId=${encodeURIComponent(rpId)}&credentialId=${encodeURIComponent(credentialId)}`;
    const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
    if (!response.ok) return null;
    const record = (await response.json()) as { name?: string };
    const name = record.name?.trim();
    return name || null;
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
