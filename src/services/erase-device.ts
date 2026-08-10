/**
 * "Erase this device" — the destructive counterpart to signing out.
 *
 * Sign-out (`clearSignedInWallet()` in `services/storage.ts`) is deliberately
 * narrow: it drops `vela.accounts` + `vela.activeAccountIndex` and nothing
 * else, because the address is derived from the passkey and every
 * address-keyed and origin-keyed record lines back up on the next sign-in.
 * THIS is the action that means "this device is no longer mine": everything
 * Vela wrote here goes, and none of it comes back.
 *
 * ## Why a prefix scan and not a key list
 *
 * The predecessor of this module was `storage.ts`'s `clearAll()`, which walked
 * a hand-maintained list of the eleven keys that ONE module happened to own.
 * It never covered contacts, contact groups, browser history, the `vela.perm.*`
 * dApp grants, the receive-acknowledged flags, the balance/rate/token-metadata
 * caches, or a single preference key — and it drifted out of date silently,
 * because nothing about a delete-list fails when the app grows a key. A
 * delete-list erase is wrong by default and only accidentally right.
 *
 * So the direction is inverted: enumerate what is ACTUALLY on the device,
 * delete everything under the `vela.` namespace, and name the exceptions.
 * A new key added anywhere in the app is erased on the day it is written,
 * with no edit here. `clearAll()` is gone rather than kept alongside this —
 * two functions that both nearly mean "erase everything" is how the first one
 * rotted.
 *
 * ## The keep-list
 *
 * {@link ERASE_KEEP_KEYS} is exactly `vela.pendingUploads`, and the reason is
 * not convenience. A record there is a passkey public key that the index
 * service has never confirmed. `retryPendingUploads()` re-sends it on the next
 * launch and needs no account list to do so (`src/app/_layout.tsx` calls it
 * before any wallet is restored), but a DELETED record can never be retried —
 * and that credential then cannot be found at login on any device. Erasing it
 * would downgrade "recoverable" to "possibly ruined", which is worse than
 * leaving one opaque outbox entry behind, and strictly worse here than at
 * sign-out: the account list is going too, so the retry is the only remaining
 * path to that key. Uploading first and erasing after was the alternative; it
 * was rejected because it makes a destructive action the user asked for depend
 * on a network that may be down.
 *
 * Keys outside the `vela.` namespace are not this module's to judge and are
 * left alone — today that is only `dev_unlocked`, the developer-menu latch,
 * which holds no user data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetStorageCaches } from '@/services/storage';

/** Every key this app writes is namespaced. The scan is this prefix. */
export const VELA_KEY_PREFIX = 'vela.';

/**
 * The only `vela.` keys an erase leaves behind. See the module doc — the
 * pending-upload outbox is a retry queue for a public key the index service
 * has not acknowledged, and deleting it is unrecoverable in a way nothing else
 * here is.
 */
export const ERASE_KEEP_KEYS: readonly string[] = ['vela.pendingUploads'];

const KEEP = new Set<string>(ERASE_KEEP_KEYS);

/** Would {@link eraseDeviceData} delete this key? */
export function isErasableKey(key: string): boolean {
  return key.startsWith(VELA_KEY_PREFIX) && !KEEP.has(key);
}

/**
 * The erase ran but storage still holds keys it was supposed to remove.
 *
 * A distinct error type because the caller must NOT treat this as "erased":
 * telling the user their device is clean while their transaction history is
 * still on it is the one outcome this feature cannot have.
 */
export class EraseIncompleteError extends Error {
  /** The keys that survived. Never logged with their values. */
  readonly remaining: readonly string[];

  constructor(remaining: readonly string[]) {
    super(`Erase incomplete: ${remaining.length} key(s) still present`);
    this.name = 'EraseIncompleteError';
    this.remaining = remaining;
  }
}

/**
 * Delete every `vela.` key except {@link ERASE_KEEP_KEYS}, then verify.
 *
 * Resolves with the keys that were removed. Rejects if the enumeration itself
 * fails, or with {@link EraseIncompleteError} if anything survived — a caller
 * that navigates the user to onboarding on a rejected promise would be
 * claiming an erase that did not happen.
 *
 * A `multiRemove` that throws is retried key by key: the batch API is
 * all-or-nothing on some backends, and one unwritable key must not strand the
 * other forty. The verification pass, not the return value of either call, is
 * what decides success.
 *
 * The in-memory caches in `storage.ts` are reset only after that pass. They
 * are read synchronously during render (endpoints, locale prefs, RPC provider
 * keys), so leaving them populated would keep serving erased values to this
 * process — and the RPC keys are credentials.
 */
export async function eraseDeviceData(): Promise<readonly string[]> {
  const all = await AsyncStorage.getAllKeys();
  const doomed = all.filter(isErasableKey);

  if (doomed.length > 0) {
    try {
      await AsyncStorage.multiRemove(doomed);
    } catch {
      for (const key of doomed) {
        // Individually swallowed on purpose: the verification pass below is
        // the authority on whether the erase succeeded, not this loop.
        try {
          await AsyncStorage.removeItem(key);
        } catch {
          /* checked below */
        }
      }
    }
  }

  const remaining = (await AsyncStorage.getAllKeys()).filter(isErasableKey);
  if (remaining.length > 0) throw new EraseIncompleteError(remaining);

  resetStorageCaches();
  return doomed;
}
