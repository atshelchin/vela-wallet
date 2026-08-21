/**
 * The only place the `session` core touches the outside world.
 *
 * Seven operations, one existing `services/storage.ts` call each — the
 * vocabulary the core declares (`LoadAccounts` / `LoadActiveIndex` /
 * `SaveAccount` / `SaveActiveIndex` / `CheckPendingUploads`, plus the two
 * logout clears). No branching on business meaning: the address migration, the
 * index clamp, the restore gather, the sign-out gate and the "which write,
 * when" choices all live in Rust.
 *
 * Wire vs stored shape: the core speaks `Account`
 * (`public_key_hex` / `created_at_iso`), storage holds `StoredAccount`
 * (`publicKeyHex` / `createdAt`). Translating between them is this file's job,
 * and it is lossless in both directions so the accounts the app renders are the
 * accounts on disk — including `id` (the passkey credential id every signature
 * is looked up by) and `publicKeyHex`, which the send/sign paths re-read from
 * storage but which must survive the round trip anyway.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with.
 */

import type { Account as CoreAccount } from './generated/Account';
import type { SessionShellResult } from './generated/SessionShellResult';
import type { SessionEffect } from './session-types';
import type { Account, StoredAccount } from '@/models/types';
import {
  clearSignedInWallet,
  hasPendingUploads,
  loadAccounts,
  loadActiveAccountIndex,
  saveAccount,
  saveActiveAccountIndex,
} from '@/services/storage';
import { endExtCacheSession } from '@/services/wallet-state-core/session-ext-cache-bridge';

/**
 * A stored record in the core's vocabulary.
 *
 * Every field is defaulted because `loadAccounts()` is an unvalidated JSON
 * parse of whatever is on disk: a legacy record missing `createdAt` or
 * `publicKeyHex` would serialize as an absent key, serde would reject the whole
 * result as a core fault, and the restore would never finish — a forever
 * spinner, exactly what invariant ③ forbids. `''` is also what the reducer
 * effectively saw (`!acct.publicKeyHex` skips the migration either way).
 *
 * The parameter is `Account` with an OPTIONAL key because both callers are
 * real: the executor hands over `StoredAccount`s off disk, and the provider
 * hands over whatever a `SET_WALLET` / `ADD_ACCOUNT` dispatch carried — the
 * parallel-space fixtures, for one, are keyless `Account`s.
 */
export function toCoreAccount(
  account: Account & { publicKeyHex?: string; keys?: StoredAccount['keys'] },
): CoreAccount {
  return {
    id: account.id ?? '',
    name: account.name ?? '',
    address: account.address ?? '',
    public_key_hex: account.publicKeyHex ?? '',
    created_at_iso: account.createdAt ?? '',
    // The FULL founding key set. Dropping it here is not just lossy — the
    // core derives the address from ALL keys (invariant ②), so a multi-key
    // account stripped to its scalar key would be "repaired" to the WRONG
    // single-key Safe on every restore.
    keys: (account.keys ?? []).map((key) => ({
      credential_id: key.credentialId ?? '',
      public_key_hex: key.publicKeyHex ?? '',
      name: key.name ?? '',
    })),
  };
}

/** The inverse — what `saveAccount()` and the wallet context hold. */
export function toStoredAccount(account: CoreAccount): StoredAccount {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    publicKeyHex: account.public_key_hex,
    createdAt: account.created_at_iso,
    keys: (account.keys ?? []).map((key) => ({
      credentialId: key.credential_id,
      publicKeyHex: key.public_key_hex,
      name: key.name,
    })),
  };
}

/**
 * `ActiveIndexLoaded` carries a `usize`, and the core documents why: the TS
 * clamp (`savedIndex < accounts.length`) lets a NEGATIVE stored value through,
 * and the reducer would then render `address: ''` beside `hasWallet: true`.
 * `loadActiveAccountIndex()` already maps missing/garbage/throwing to 0
 * (`parseInt(raw, 10) || 0` inside try/catch) but would pass `-5` along, so the
 * fail-closed mapping lands here, at the wire — a negative, fractional or
 * non-finite value reads as 0, the same nothing-selected the reducer meant.
 */
function toWireIndex(index: number): number {
  return Number.isSafeInteger(index) && index >= 0 ? index : 0;
}

export async function executeSessionOperation(
  effect: SessionEffect,
): Promise<SessionShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'load_accounts': {
      const accounts = await loadAccounts();
      return { type: 'accounts_loaded', accounts: accounts.map(toCoreAccount) };
    }
    case 'load_active_index':
      return { type: 'active_index_loaded', index: toWireIndex(await loadActiveAccountIndex()) };
    case 'save_account':
      await saveAccount(toStoredAccount(operation.account));
      return { type: 'account_saved' };
    case 'save_active_index':
      await saveActiveAccountIndex(operation.index);
      return { type: 'active_index_saved' };
    case 'check_pending_uploads':
      return { type: 'pending_uploads', has_pending: await hasPendingUploads() };
    case 'clear_signed_in_wallet':
      // `clearSignedInWallet()`, deliberately NOT the erase-this-device scan in
      // `services/erase-device.ts`: the operation's whole point is its scope. It
      // removes `vela.accounts` and `vela.activeAccountIndex` — the two keys
      // that make this device signed in — and leaves every other key, including
      // the pending-upload outbox, for the reasons that function documents.
      await clearSignedInWallet();
      return { type: 'signed_in_wallet_cleared' };
    case 'clear_extension_cache':
      // Routed to the ext-cache CORE (`session_ended`) rather than to
      // `clearAccountCache()` directly: which writes survive a clear, and the
      // attempt guard that makes logout win over an in-flight write, are that
      // machine's rules. A no-op when no writer is mounted (i.e. everywhere but
      // the iOS Safari-extension host).
      endExtCacheSession();
      return { type: 'extension_cache_cleared' };
  }
}

export function sessionOperationFailure(
  effect: SessionEffect,
  _error: unknown,
): SessionShellResult {
  switch (effect.operation.type) {
    case 'load_accounts':
      // The `Promise.all(...).catch(LOADED_EMPTY)` branch: an unreadable store
      // lands `Empty`, never a forever spinner (invariant ③).
      return { type: 'accounts_unavailable' };
    case 'load_active_index':
      // No failure variant by design — `loadActiveAccountIndex()` already
      // swallows its own errors and answers 0; this covers the impossible rest.
      return { type: 'active_index_loaded', index: 0 };
    case 'save_account':
      // Best effort, exactly like the TS inner `catch`: the in-memory address
      // correction stands whether or not the write landed.
      return { type: 'account_saved' };
    case 'save_active_index':
      // Best effort, like today's un-awaited `saveActiveAccountIndex(...)`.
      return { type: 'active_index_saved' };
    case 'check_pending_uploads':
      // Ported verbatim: `handleOpenSignOut` died before `setShowSignOut(true)`,
      // so the dialog simply never opens — fail-closed for invariant ⑤.
      return { type: 'pending_uploads_unavailable' };
    case 'clear_signed_in_wallet':
      // Best effort, like every other write: the session is already signed out
      // in memory, and a failed removal cannot put it back. The stale keys are
      // re-cleared by the next successful sign-out.
      return { type: 'signed_in_wallet_cleared' };
    case 'clear_extension_cache':
      return { type: 'extension_cache_cleared' };
  }
}
