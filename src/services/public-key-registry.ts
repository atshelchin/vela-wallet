/**
 * Client for the WebAuthn P256 Public Key **Registry** (p256-index v2).
 *
 * Unlike the legacy `public-key-index.ts` (server-signs, no possession
 * proof), this registry is possession-proven: the server DERIVES a challenge
 * from the signing role's inputs, the client signs it (a passkey via
 * `navigator.credentials.get()` for members, a one-time software P-256 "group
 * key" for the closing content hash), and the client POSTs the assembled
 * proofs. This module is only the HTTP seam — challenge signing and group-key
 * generation live in the onboarding orchestration, never here.
 *
 * One vela wallet maps to one immutable registry group (Unit): its founding
 * passkeys are the group members, in the canonical founding order the Safe
 * address derivation uses. See `rust/crates/vela-core/src/registry_metadata.rs`.
 */

import { loadServiceEndpoints } from './storage';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import { fetchWithTimeout, isTimeoutError, NET_TIMEOUTS } from './net';

const FALLBACK_URL = DEFAULT_SERVICE_ENDPOINTS.passkeyIndexURL;

/** Cached base URL — refreshed from storage periodically to honour a user edit. */
let _cachedUrl: string | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5_000;

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

// ── Wire types (mirror p256-index-server/src/http.rs exactly) ───────────────

/** One WebAuthn-shaped possession proof. `(r,s)` sign
 *  `sha256(authenticatorData ‖ sha256(clientDataJSON))`. */
export interface RegistryProof {
  authenticatorData: string;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  r: string;
  s: string;
}

/** One group member passkey. `attestation` is empty or 20 versioned bytes. */
export interface RegistryMember {
  publicKey: string;
  attestation?: string;
  /** WebAuthn credential id (hex), stored on the entry for local lookup.
   *  Not part of any signed binding. */
  credentialId?: string;
  /** PublicKeyCredential response hints, stored on the entry for display
   *  (not signed): the `authenticatorAttachment` token and the comma-joined
   *  transports list. */
  authenticatorAttachment?: string;
  transports?: string;
  proof: RegistryProof;
}

/** A single derived challenge: 0x-hex and its base64url form (what the
 *  authenticator signs as the WebAuthn challenge). */
export interface ChallengeValue {
  challenge: string;
  challengeBase64url: string;
}

/** Inputs for GROUP-mode `/api/challenge`: everything the server needs to
 *  derive the content hash, the group's closing challenge, and each member's
 *  member-bound challenge. Proofs are NOT included — they don't exist yet. */
export interface GroupChallengeRequest {
  rpId: string;
  metadata?: string;
  groupPublicKey: string;
  members: { publicKey: string; attestation?: string }[];
}

export interface GroupChallengeResponse {
  contentHash: string;
  groupChallenge: ChallengeValue;
  members: (ChallengeValue & { publicKey: string })[];
}

/** A fully-assembled register call (proofs already signed). */
export interface RegistryRegisterRequest {
  rpId: string;
  metadata?: string;
  groupPublicKey: string;
  groupProof: RegistryProof;
  members: RegistryMember[];
}

/** 202 `{id, status:'pending'}`; 200 `{id?, status:'done', contentHash?}` when
 *  the identical unit is already on-chain. */
export interface RegisterAccepted {
  id?: string;
  status: string;
  contentHash?: string;
}

export type TaskState = 'pending' | 'done' | 'failed';

export interface TaskStatus {
  id: string;
  status: TaskState;
  kind?: 'register' | 'refer';
  rpId?: string;
  metadata?: string;
  contentHash?: string;
  groupPublicKey?: string;
  members?: { publicKey: string; attestation: string }[];
  txHash?: string | null;
  /** unitId for register / referenceId for refer, once done. */
  onChainId?: number | null;
  error?: string | null;
  createdAt?: number;
}

export interface KeyEntry {
  entryId: number;
  publicKey: string;
  attestation: string;
  createdAt: number;
}

/** `/api/query?publicKey=` — the key's global file plus one page of the
 *  groups it is a member of and the references it holds. `_queue` marks a key
 *  still working through the pipeline (pre-chain visibility). */
export interface KeyProfile {
  entry: KeyEntry | null;
  groups: { total: number; unitIds: number[] };
  references: { total: number; referenceIds: number[] };
  _queue?: { id: string; status: string; publicKey: string };
  page?: number;
  pageSize?: number;
}

// ── Service identity (health gate accepts BOTH the legacy and v2 names) ─────

export const REGISTRY_SERVICE_IDENTITIES = [
  'webauthn-p256-publickey-registry',
  'webauthn-p256-publickey-index',
] as const;

/** True for either the legacy index or the v2 registry health identity, so a
 *  wallet can point at either during the migration. */
export function isRegistryServiceIdentity(service: unknown): boolean {
  return (
    typeof service === 'string' &&
    (REGISTRY_SERVICE_IDENTITIES as readonly string[]).includes(service)
  );
}

// ── Endpoints ───────────────────────────────────────────────────────────────

async function postJson<T>(path: string, body: unknown, timeoutMs: number, label: string): Promise<T> {
  const baseUrl = await getBaseUrl();
  const response = await fetchWithTimeout(
    `${baseUrl}${path}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { timeoutMs },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${label} failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

/** GROUP-mode challenge: content hash + the group's closing challenge + each
 *  member's challenge, all to be signed before `register`. */
export async function requestGroupChallenge(
  request: GroupChallengeRequest,
): Promise<GroupChallengeResponse> {
  return postJson('/api/challenge', request, NET_TIMEOUTS.keyIndexRead, 'Challenge');
}

/** MEMBER-mode challenge: one passkey signing AT CREATION. The challenge
 *  binds only (groupPublicKey, own attestation) — the contract's
 *  `memberBindingFor` — so it exists before the rest of the founding set
 *  does, which is what makes the interleaved create→confirm flow possible. */
export async function requestMemberChallenge(request: {
  rpId: string;
  groupPublicKey: string;
  publicKey: string;
  attestation?: string;
}): Promise<ChallengeValue> {
  return postJson('/api/challenge', request, NET_TIMEOUTS.keyIndexRead, 'Challenge');
}

/** Submit a fully-proven register. Idempotent by content hash: the same unit
 *  resubmitted returns the same task id. */
export async function register(request: RegistryRegisterRequest): Promise<RegisterAccepted> {
  return postJson('/api/register', request, NET_TIMEOUTS.keyIndexWrite, 'Register');
}

/** One task-status read. Throws on a non-OK response. */
export async function getTask(id: string): Promise<TaskStatus> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/task/${encodeURIComponent(id)}`;
  const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
  if (!response.ok) throw new Error(`Task status failed: ${response.status}`);
  return (await response.json()) as TaskStatus;
}

export interface PollOptions {
  /** Overall budget before giving up. Default 120s. */
  timeoutMs?: number;
  /** Delay between status reads. Default 2s. */
  intervalMs?: number;
}

/** Poll `getTask` until the task is terminal (`done`/`failed`) or the budget
 *  elapses. A terminal task is returned; a timeout throws. Transient read
 *  failures are retried until the budget runs out. */
export async function pollTask(id: string, options: PollOptions = {}): Promise<TaskStatus> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const task = await getTask(id);
      if (task.status === 'done' || task.status === 'failed') return task;
      lastError = null;
    } catch (err) {
      // Keep polling through transient read failures until the budget runs out.
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(`Task ${id} did not settle within ${timeoutMs}ms`);
}

/** The key's global file plus its group/reference ids. A well-formed key that
 *  is unknown returns an empty profile (never a 404); a malformed key is a
 *  400 and throws. */
export async function queryByPublicKey(publicKey: string): Promise<KeyProfile> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/query?publicKey=${encodeURIComponent(publicKey)}`;
  const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
  if (!response.ok) throw new Error(`Query failed: ${response.status}`);
  return (await response.json()) as KeyProfile;
}

/** One founding member of a group, as `/api/query?unitId=` returns it. */
export interface UnitMember {
  entryId: number;
  publicKey: string;
  attestation: string;
  /** WebAuthn credential id (hex), as stored at registration. */
  credentialId: string;
  authenticatorAttachment?: string;
  transports?: string;
  createdAt?: number;
}

/** `/api/query?unitId=` — the group's frozen record, one page of its founding
 *  members (ascending page order IS the canonical founding order), and the
 *  discovery-only reference inbox. */
export interface UnitDetail {
  unit: {
    unitId: number;
    rpId: string;
    /** The opaque metadata blob (hex) — vela wallets encode `RegistryMetadata`
     *  (address, key_names, …) here. */
    metadata: string;
    groupPublicKey: string;
    contentHash: string;
    memberCount: number;
    createdAt?: number;
  };
  members: { total: number; items: UnitMember[] };
  references: { total: number; referenceIds: number[] };
  page?: number;
  pageSize?: number;
}

/** A vela wallet's founding set is capped at 7 keys; a larger group is not
 *  ours and must never be reconstructed into an account. */
const MAX_UNIT_MEMBERS = 7;

/** The group's frozen record plus ALL its founding members, ascending
 *  (= canonical founding) order. Throws on an unknown unit (404), a
 *  non-wallet-sized group, or a page that does not hold every member. */
export async function queryUnit(unitId: number): Promise<UnitDetail> {
  const baseUrl = await getBaseUrl();
  // `order=asc` = registration order = the canonical founding order the Safe
  // address derivation pins (the server default is newest-first).
  const url = `${baseUrl}/api/query?unitId=${encodeURIComponent(unitId)}&pageSize=${MAX_UNIT_MEMBERS}&order=asc`;
  const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
  if (!response.ok) throw new Error(`Query failed: ${response.status}`);
  const detail = (await response.json()) as UnitDetail;
  const total = detail.members?.total ?? 0;
  const items = detail.members?.items ?? [];
  if (total > MAX_UNIT_MEMBERS) {
    throw new Error(`Query failed: unit ${unitId} has ${total} members (cap ${MAX_UNIT_MEMBERS})`);
  }
  if (items.length !== total) {
    throw new Error(`Query failed: unit ${unitId} page holds ${items.length} of ${total} members`);
  }
  return detail;
}

/** Health probe. Returns null on any transport failure (a down registry must
 *  degrade the health badge, never throw into onboarding). */
export async function getHealth(): Promise<{ service: string; status: string } | null> {
  const baseUrl = await getBaseUrl();
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/health?_t=${Date.now()}`,
      {},
      { timeoutMs: NET_TIMEOUTS.keyIndexRead },
    );
    if (!response.ok) return null;
    return (await response.json()) as { service: string; status: string };
  } catch (err) {
    if (isTimeoutError(err)) return null;
    throw err;
  }
}
