/**
 * Uploads passkey public keys to the index server for cross-device recovery.
 *
 * Flow: createRecord → verify (no signature needed, server signs on-chain tx)
 *
 * SECOND IMPLEMENTATION WARNING (spec 011-crux-onboarding-state, D10).
 * The decision table this file walks — a failed create forgiven when the query
 * confirms the stored key, a key mismatch treated as failure, the pending entry
 * cleared only once the wallet reference resolves (issue #89) — also lives in
 * `rust/crates/vela-core/src/app/create_wallet.rs`, which is what drives web
 * onboarding now. This file still runs for `retryPendingUploads()` at launch —
 * `_layout.tsx` calls it on every cold start — so this table is live on the
 * same platform the core runs on.
 *
 * Change the Rust table and this one together, or the platforms drift. The
 * shared source of truth is the table in
 * `specs/011-crux-onboarding-state/data-model.md`.
 *
 * The warning above was the ONLY thing holding the two copies together, and a
 * comment cannot fail a build. The table is therefore extracted below into two
 * pure functions — `judgeUpload` and `shouldClearPending` — whose inputs are
 * observations and whose outputs are labelled verdicts, so both copies can be
 * read by one test: `src/__tests__/services/public-key-upload-parity.test.ts`
 * executes these and reads the corresponding arms out of `create_wallet.rs`.
 */
import { computeAddress, fromHex } from '@/services/vela-core';
import * as PublicKeyIndex from './public-key-index';
import { getRelyingPartyId } from '@/modules/passkey';
import { loadPendingUploads, removePendingUpload } from './storage';

// ---------------------------------------------------------------------------
// Safe WebAuthn Compatibility Validation
// ---------------------------------------------------------------------------

/**
 * Error thrown when the passkey provider is not compatible with Safe contracts.
 * This is NOT retryable — the device/provider cannot be used.
 */
export class PasskeyIncompatibleError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Passkey provider incompatible: ${reason}`);
    this.name = 'PasskeyIncompatibleError';
    this.reason = reason;
  }
}

/**
 * Validate the registration (webauthn.create) clientDataJSON for Safe compatibility.
 *
 * If the provider outputs wrong field order for create, it will do the same for get.
 * This lets us reject incompatible providers BEFORE saving anything.
 *
 * Expected: {"type":"webauthn.create","challenge":"<base64url>", ...}
 */
export function validateCreateClientData(clientDataJSONHex: string): void {
  const clientDataBytes = fromHex(clientDataJSONHex);
  const clientDataJSON = new TextDecoder().decode(clientDataBytes);

  const requiredPrefix = '{"type":"webauthn.create","challenge":"';
  if (!clientDataJSON.startsWith(requiredPrefix)) {
    const actualStart = clientDataJSON.slice(0, 80);
    console.error('[SafeCompat] CREATE clientDataJSON prefix mismatch');
    console.error('[SafeCompat] Expected prefix:', requiredPrefix);
    console.error('[SafeCompat] Actual start:', actualStart);
    throw new PasskeyIncompatibleError(
      'Your device\'s passkey provider produces an incompatible response format. ' +
      'The clientDataJSON field order does not match Safe contract requirements. ' +
      'Please try a different passkey provider or device.\n\n' +
      'Got: ' + actualStart,
    );
  }

  if (!clientDataJSON.endsWith('}')) {
    throw new PasskeyIncompatibleError('clientDataJSON does not end with }');
  }

  console.log('[SafeCompat] CREATE clientDataJSON format OK');
}

// ---------------------------------------------------------------------------
// The decision table, as data
// ---------------------------------------------------------------------------

/**
 * What the shell OBSERVED, never what it concluded. `create` failing is not a
 * verdict (the write may have landed with its response lost, or the record may
 * already exist from an idempotent retry), and a query that could not answer is
 * not a verdict either — the query 404-ing and the query timing out are the
 * same thing here: unconfirmed.
 */
export type CreateObservation =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

export type QueryObservation =
  | { readonly type: 'record'; readonly publicKey: string }
  | { readonly type: 'unavailable'; readonly error: unknown };

/** The labelled verdict. Every caller branches on `type`, never on an error string. */
export type UploadVerdict =
  /** The server holds the matching key — proceed to the wallet-ref step. */
  | { readonly type: 'confirmed' }
  /** Nothing was proven; keep the pending entry and retry on a later launch. */
  | { readonly type: 'unconfirmed'; readonly error: unknown }
  /** The server holds a DIFFERENT key for this credential — never retryable by waiting. */
  | { readonly type: 'mismatch' };

/** The message a `mismatch` surfaces. Byte-identical to the core's. */
export const MISMATCH_MESSAGE = 'Server verification failed: public key mismatch';

/**
 * Row lookup for the index-upload table (spec 011 data-model.md), mirroring
 * `create_wallet.rs`'s `Syncing(Creating|Confirming)` arms:
 *
 *   create ok   / record matches  → confirmed
 *   create fail / record matches  → confirmed  (already-exists, or write landed)
 *   create ok   / record differs  → mismatch
 *   create fail / record differs  → mismatch
 *   create ok   / no answer       → unconfirmed with the query's error
 *   create fail / no answer       → unconfirmed with the CREATE error (the original cause)
 *
 * The key comparison is case-insensitive, exactly as the core's
 * `eq_ignore_ascii_case` is: hex case carries no meaning, and two copies of one
 * table that disagree about `04AB…` vs `04ab…` are a drift, not a nuance.
 */
export function judgeUpload(
  expectedPublicKeyHex: string,
  create: CreateObservation,
  query: QueryObservation,
): UploadVerdict {
  if (query.type === 'unavailable') {
    // `throw createError ?? verifyErr`: the create error is the original cause
    // and wins when both failed.
    return { type: 'unconfirmed', error: create.ok ? query.error : create.error };
  }
  return query.publicKey.toLowerCase() === expectedPublicKeyHex.toLowerCase()
    ? { type: 'confirmed' }
    : { type: 'mismatch' };
}

/**
 * The wallet-reference step (issue #89). `unknown` is the index/RPC failing to
 * answer — never confused with a definitive "not revealed yet", though both
 * keep the entry.
 */
export type WalletRefObservation = 'resolved' | 'unresolved' | 'unknown';

/**
 * Clear the pending entry ONLY on a resolved wallet reference. The credential
 * record existing is not the signal: the bundler grants sponsorship once the
 * key resolves BY walletRef, which lands after the index's async on-chain
 * commit-reveal — minutes later, and sometimes stuck. Clearing early abandoned
 * those registrations and the funded treasury never paid out (issue #89).
 */
export function shouldClearPending(walletRef: WalletRefObservation): boolean {
  return walletRef === 'resolved';
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a public key to the index server, then verify it was stored.
 * No signature needed — server signs on-chain tx automatically.
 */
export async function uploadPublicKey(params: {
  credentialId: string;
  publicKeyHex: string;
  name: string;
}): Promise<void> {
  const { credentialId, publicKeyHex, name } = params;
  const rpId = getRelyingPartyId();

  console.log('[PublicKeyUpload] Starting upload for:', name);

  // 1. Upload to server (no challenge/signature needed). A failure here is NOT
  //    necessarily fatal: the record may already exist (idempotent re-run via the
  //    Idempotency-Key) or the write may have landed but the response was lost to
  //    a timeout. The verify step below is the source of truth, so remember the
  //    error and only surface it if verification can't confirm the record.
  let create: CreateObservation;
  try {
    await PublicKeyIndex.createRecord({ rpId, credentialId, publicKey: publicKeyHex, name });
    console.log('[PublicKeyUpload] Upload request OK for:', name);
    create = { ok: true };
  } catch (err) {
    create = { ok: false, error: err };
    console.warn('[PublicKeyUpload] create failed; verifying before deciding:', err instanceof Error ? err.message : String(err));
  }

  // 2. Verify against the server — the stored record is the source of truth. If it
  //    exists and matches, the upload succeeded regardless of whether THIS call
  //    wrote it (covers "already exists" on retry and timeout-but-succeeded).
  //    A query that cannot answer (404 or transport) is not a verdict: the write
  //    may have landed but we can't prove it yet, so the entry stays pending and
  //    is retried on next launch (createRecord dedupes via Idempotency-Key).
  //    Never remove the pending entry on an unconfirmed result, never fake success.
  let query: QueryObservation;
  try {
    const record = await PublicKeyIndex.queryRecord(rpId, credentialId);
    query = { type: 'record', publicKey: record.publicKey };
  } catch (verifyErr) {
    query = { type: 'unavailable', error: verifyErr };
  }

  const verdict = judgeUpload(publicKeyHex, create, query);
  if (verdict.type === 'unconfirmed') throw verdict.error;
  if (verdict.type === 'mismatch') throw new Error(MISMATCH_MESSAGE);
  console.log('[PublicKeyUpload] Verified on server for:', name);

  // 3. The credentialId record exists — but that is NOT the signal that the key
  //    is usable for GAS SPONSORSHIP. The bundler grants sponsorship only once the
  //    key resolves BY walletRef (the Safe address), which lands after the index's
  //    async on-chain commit-reveal — minutes later, and sometimes stuck. Clearing
  //    the pending upload on credentialId-confirmation alone abandoned those
  //    registrations, so the bundler never saw the key and the funded treasury
  //    never paid out (issue #89). Only clear once walletRef resolves; until then
  //    keep it pending so retryPendingUploads re-drives it (createRecord is
  //    idempotent and re-queues a stuck reveal). Never throw here: the credentialId
  //    is confirmed, the wallet is fully usable locally, and onboarding must not be
  //    blocked on the slow reveal (saveAccount still gates on credentialId only).
  let walletRef: WalletRefObservation;
  try {
    walletRef = (await PublicKeyIndex.queryByWalletRef(computeAddress(publicKeyHex)))
      ? 'resolved'
      : 'unresolved';
  } catch (err) {
    // walletRef check failed (index/RPC down) — an absence of information, not
    // an absence of the reveal.
    walletRef = 'unknown';
    console.warn('[PublicKeyUpload] walletRef check failed; leaving pending:', err instanceof Error ? err.message : String(err));
  }
  if (shouldClearPending(walletRef)) {
    try {
      await removePendingUpload(credentialId);
      console.log('[PublicKeyUpload] walletRef resolved — registration complete:', name);
    } catch (err) {
      // A failed local delete is not a failed registration — the key IS on the
      // index. The entry is simply re-driven once more next launch, which is
      // idempotent. (`RemovingPending, StorageFailed` → `save_account` in the core.)
      console.warn('[PublicKeyUpload] pending entry could not be cleared:', err instanceof Error ? err.message : String(err));
    }
  } else if (walletRef === 'unresolved') {
    console.log('[PublicKeyUpload] credentialId stored; walletRef pending on-chain reveal — keeping for retry:', name);
  }
}

/**
 * Retry all pending public key uploads.
 * No biometric needed — safe to call silently on app launch.
 */
export async function retryPendingUploads(): Promise<{
  succeeded: number;
  failed: number;
}> {
  const pending = await loadPendingUploads();
  if (pending.length === 0) return { succeeded: 0, failed: 0 };
  console.log('[PublicKeyUpload] Retrying', pending.length, 'pending uploads');

  let succeeded = 0;
  let failed = 0;

  for (const upload of pending) {
    try {
      await uploadPublicKey({
        credentialId: upload.id,
        publicKeyHex: upload.publicKeyHex,
        name: upload.name,
      });
      succeeded++;
    } catch (err) {
      failed++;
      console.error('[PublicKeyUpload] Retry FAILED for', upload.name, ':', err instanceof Error ? err.message : String(err));
    }
  }

  console.log('[PublicKeyUpload] Retry complete:', succeeded, 'succeeded,', failed, 'failed');
  return { succeeded, failed };
}
