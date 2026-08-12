/**
 * The shapes the address-book controllers return on every platform.
 *
 * A standalone module for the same reason `receive-controller-types.ts` is one:
 * a platform pair (`use-x.ts` / `use-x.web.ts`) must never import its own base
 * file — on web, Metro resolves that specifier back to the `.web.ts` variant
 * itself, and a self-referential re-export recurses at module init, taking the
 * whole app down. Both variants import from here instead.
 *
 * The entry types stay the ones `services/contacts.ts` already exports: native
 * keeps that service verbatim, and the web controller translates the core's
 * wire shape into it, so every contacts component renders from one shape.
 */

import type { Contact, ContactGroup, SaveContactInput, SaveGroupInput } from '@/services/contacts';
import type { ImportReport, ParsedContactsImport } from '@/services/contact-io';

/**
 * The address book, as the contacts surfaces consume it.
 *
 * Every mutator resolves once the book has been updated — callers never follow
 * one with a manual reload (on web that would race the pending write against a
 * fresh read of the store).
 */
export interface ContactsBook {
  /** The unified book (saved ⊕ history-derived), sorted. `null` = still loading. */
  contacts: Contact[] | null;
  /** Manually-saved contacts only — the group editor's pool and the export source. */
  saved: Contact[] | null;
  groups: ContactGroup[];
  /** Re-read the book from storage. Call when a contacts surface opens. */
  refresh: () => void;
  save: (input: SaveContactInput) => Promise<void>;
  remove: (address: string) => Promise<void>;
  toggleFavorite: (address: string) => Promise<void>;
  saveGroup: (input: SaveGroupInput) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  /** Apply an already-parsed import file; resolves with the counts to show. */
  importParsed: (parsed: ParsedContactsImport) => Promise<ImportReport>;
}

/**
 * What the saved address book says about one recipient — the trust signal
 * behind `RecipientTrust`'s leading icon.
 *
 * `null` means "not a saved contact", which is also what an unresolved lookup
 * looks like: the old inline effect could not tell those apart either, and the
 * component renders the same thing for both.
 */
export interface RecipientTrustSignal {
  /** The saved contact's display name. `''` = saved, but without a name yet. */
  name: string;
  /** Saved **and** starred — the only state that earns the green check. */
  favorite: boolean;
}
