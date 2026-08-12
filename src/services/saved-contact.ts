/**
 * "Is this address a saved contact, and what is it called?" — NATIVE.
 *
 * One address, one answer, asked by four surfaces: the recipient name, the
 * recipient trust badge, the signing panel's address identity and the signing
 * summary line. Hermes has no WebAssembly, so native keeps reading the
 * TypeScript store (`services/contacts.ts`).
 *
 * The web twin (`saved-contact.web.ts`) asks the `contacts` core instead. Until
 * it existed, those four surfaces read the TypeScript store on web while the
 * core owned the same ledger — so a contact saved through the core (the
 * receipt's "save contact", the address book sheet) or hidden by its deletion
 * tombstone could disagree with the green check next to the recipient.
 */
import { getSavedContact, type Contact } from '@/services/contacts';

export function savedContactFor(address: string): Promise<Contact | null> {
  return getSavedContact(address);
}
