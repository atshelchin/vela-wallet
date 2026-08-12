/**
 * The address book — NATIVE controller.
 *
 * Today's logic, lifted verbatim out of `ContactsManager`, `ContactPicker` and
 * `GroupEditor` (spec 017): Hermes has no WebAssembly, so iOS/Android keep the
 * TypeScript service (`services/contacts.ts` + `services/contact-io.ts`). The
 * web variant (`use-contacts-book.web.ts`) is driven by the portable Rust
 * machine (`rust/crates/vela-core/src/app/contacts.rs`), where the merge, the
 * tombstones, the group ledger and the import policy are documented and tested.
 *
 * The one change against the old inline code is where the reload lives: a
 * mutator kicks off the refresh itself, so a caller never has to pair a write
 * with a `reload()` of its own. The sequence of service calls, and the order the
 * component's own follow-up work runs in, are unchanged.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  contactDisplayName,
  deleteContact,
  deleteGroup as deleteGroupService,
  getAllContacts,
  getGroups,
  getSavedContact,
  getSavedContacts,
  saveContact,
  saveGroup as saveGroupService,
  sortContacts,
  toggleFavorite as toggleFavoriteService,
  updateContact,
  type Contact,
  type ContactGroup,
  type SaveContactInput,
  type SaveGroupInput,
} from '@/services/contacts';
import { importContacts, type ImportReport, type ParsedContactsImport } from '@/services/contact-io';
import { resolveRecipientIdentity, type RecipientIdentity } from '@/services/recipient-identity';

import type { ContactsBook, RecipientTrustSignal } from './contacts-controller-types';

/**
 * @param myAddress the active account, excluded from history-derived
 * suggestions. Passed by the recipient picker; the management sheet has always
 * omitted it, and keeps omitting it here.
 */
export function useContactsBook(myAddress?: string): ContactsBook {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [saved, setSaved] = useState<Contact[] | null>(null);
  const [groups, setGroups] = useState<ContactGroup[]>([]);

  const load = useCallback(async () => {
    await Promise.all([
      getAllContacts(myAddress).then((l) => setContacts(sortContacts(l))).catch(() => setContacts([])),
      getSavedContacts().then(setSaved).catch(() => setSaved([])),
      getGroups().then(setGroups).catch(() => setGroups([])),
    ]);
  }, [myAddress]);

  // Nothing loads on mount: both consumers are sheets that live mounted-and-
  // hidden and fetch when they open, exactly as their old `visible` effects did.
  const refresh = useCallback(() => { void load(); }, [load]);

  const save = useCallback(async (input: SaveContactInput) => {
    await saveContact(input);
    void load();
  }, [load]);

  const remove = useCallback(async (address: string) => {
    await deleteContact(address);
    void load();
  }, [load]);

  const toggleFavorite = useCallback(async (address: string) => {
    await toggleFavoriteService(address);
    void load();
  }, [load]);

  const saveGroup = useCallback(async (input: SaveGroupInput) => {
    await saveGroupService(input);
    void load();
  }, [load]);

  const deleteGroup = useCallback(async (id: string) => {
    await deleteGroupService(id);
    void load();
  }, [load]);

  const importParsed = useCallback(async (parsed: ParsedContactsImport): Promise<ImportReport> => {
    const report = await importContacts(parsed);
    void load();
    return report;
  }, [load]);

  return { contacts, saved, groups, refresh, save, remove, toggleFavorite, saveGroup, deleteGroup, importParsed };
}

/**
 * The send path's "a transfer landed" seam — a no-op on native, where the
 * suggestion source is re-read lazily inside every `getAllContacts`. The web
 * variant tells the resident core instead, which holds the history in memory.
 */
export function notifyContactsHistoryChanged(): void {}

/**
 * One recipient's trust signal — NATIVE, the effect that used to live inside
 * `RecipientTrust`, moved here verbatim.
 *
 * A saved contact without a name adopts a freshly-resolved identity and writes
 * it back, so the picker and later renders show the real name instead of a
 * generic label. The caller's already-resolved `identity` skips that lookup.
 *
 * @param _chainId the web controller's inspection chain — that variant asks the
 * Rust core to resolve and classify, which is chain-scoped. Native resolves
 * inline (identity lookup is chain-agnostic) and ignores it.
 */
export function useRecipientTrust(
  address?: string,
  identity?: RecipientIdentity | null,
  _chainId?: number,
): RecipientTrustSignal | null {
  const [signal, setSignal] = useState<RecipientTrustSignal | null>(null);

  useEffect(() => {
    setSignal(null);
    if (!address) return;
    let cancelled = false;
    getSavedContact(address)
      .then((contact) => {
        if (cancelled || !contact) return;
        const stored = contactDisplayName(contact);
        if (stored) { setSignal({ name: stored, favorite: !!contact.favorite }); return; }
        // Saved without a name: report the saved-ness now (the component shows
        // whatever identity it has, or a generic label), then upgrade to a
        // live-resolved identity and cache it back.
        setSignal({ name: identity?.name ?? '', favorite: !!contact.favorite });
        if (identity?.name) return;
        resolveRecipientIdentity(address)
          .then((resolved) => {
            if (cancelled || !resolved?.name) return;
            setSignal({ name: resolved.name, favorite: !!contact.favorite });
            updateContact(address, { resolvedName: resolved.name, resolvedSource: resolved.source }).catch(() => {});
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address, identity]);

  return signal;
}
