/**
 * "Is this address a saved contact, and what is it called?" — WEB, answered by
 * the portable Rust state machine (spec 017,
 * `rust/crates/vela-core/src/app/contacts.rs`) through the one resident session
 * every contacts surface already shares.
 *
 * This file owns no rules: what counts as saved (`source: 'manual'`), the
 * lower-casing of the key and the deletion tombstones are the core's. The
 * explicit `.web` import path is the same one `useSendController.web.ts` uses
 * for `saveContactThroughCore` — the session lives in the hook module because
 * that is where the React surfaces subscribe to it.
 */
import { savedContactThroughCore } from '@/hooks/use-contacts-book.web';
import { isAddress } from '@/models/types';
import type { Contact } from '@/services/contacts';

export function savedContactFor(address: string): Promise<Contact | null> {
  // `getSavedContact`'s own guard (contacts.ts:254), kept so a malformed address
  // resolves to "not saved" instead of waiting on the ledger.
  if (!isAddress(address)) return Promise.resolve(null);
  return savedContactThroughCore(address);
}
