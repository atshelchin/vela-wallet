/**
 * The only place the `ext_cache` core touches the outside world.
 *
 * One operation → one existing service call: the App Group file, the
 * device-level attestation key, the extension sign bus. No branching on
 * business meaning — the TTL verdict, the loading gate, the `{ name, address }`
 * projection and the Universal-Link match are all decided in
 * `rust/crates/vela-core/src/app/ext_cache.rs`, which is where an `if` about
 * what happens next belongs.
 *
 * Every operation is a no-op off iOS: the App Group calls guard on
 * `AppGroup.isSupportedSync()` inside the sync service, exactly as the
 * machine's module docs assume. On web that leaves only the attestation key and
 * the sign bus running — which is precisely what the TypeScript component
 * already did on every platform, so web behaviour is unchanged.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with, so the core
 * keeps ownership of classification.
 */

import {
  clearAccountCache,
  getUniversalLinkVerifiedAt,
  setUniversalLinkVerifiedAt,
  writeExtSnapshot,
} from '@/services/app-group-account-sync';
import { requestExtensionSign } from '@/services/extension-sign-bus';

import type { ExtCacheShellResult } from './generated/ExtCacheShellResult';
import type { ExtCacheEffect } from './ext-cache-types';

export async function executeExtCacheOperation(
  effect: ExtCacheEffect,
): Promise<ExtCacheShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'write_snapshot':
      // The snapshot arrives fully decided (projection, chain id, TTL verdict,
      // clock); the service only merges the network catalog and writes.
      await writeExtSnapshot(operation.snapshot);
      return { type: 'snapshot_written' };
    case 'remove_snapshot':
      await clearAccountCache();
      return { type: 'snapshot_removed' };
    case 'read_attestation':
      // `now_ms` rides the result so the TTL stays a pure function of the
      // core's inputs (the 011 clock-injection pattern).
      return {
        type: 'attestation_read',
        ts: await getUniversalLinkVerifiedAt(),
        now_ms: Date.now(),
      };
    case 'persist_attestation':
      // The core supplies the timestamp it ruled on — never a fresh clock read.
      await setUniversalLinkVerifiedAt(operation.ts);
      return { type: 'attestation_persisted' };
    case 'request_extension_sign':
      // Buffered by the bus if the root controller isn't mounted yet.
      requestExtensionSign(operation.rid);
      return { type: 'sign_requested' };
  }
}

export function extCacheOperationFailure(
  effect: ExtCacheEffect,
  _error: unknown,
): ExtCacheShellResult {
  switch (effect.operation.type) {
    case 'write_snapshot':
      // Best-effort, as the TS `catch` around `AppGroup.writeFile` is.
      return { type: 'snapshot_written' };
    case 'remove_snapshot':
      return { type: 'snapshot_removed' };
    case 'read_attestation':
      // Unreadable storage is "never attested" — `getUniversalLinkVerifiedAt`'s
      // own catch. Failing closed keeps the extension on the safe scheme.
      return { type: 'attestation_read', ts: 0, now_ms: Date.now() };
    case 'persist_attestation':
      // Acked even when storage failed; the follow-up read reports the truth.
      return { type: 'attestation_persisted' };
    case 'request_extension_sign':
      return { type: 'sign_requested' };
  }
}
