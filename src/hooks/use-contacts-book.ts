/**
 * The address book — WEB, driven by the portable Rust state machine
 * (spec 017, `rust/crates/vela-core/src/app/contacts.rs`).
 *
 * This file owns no rules. The merge of saved contacts with send-history
 * suggestions, the deletion tombstones, the group ledger, the existing-wins
 * import policy and the sort are all decided (and tested) in Rust; here the
 * view is translated into the `Contact`/`ContactGroup` shapes the components
 * already render.
 *
 * **One module-level session**, like `use-display-currency.web.ts`: the book is
 * shared across screens (the management sheet, the recipient picker, every
 * recipient trust line), so a per-mount core would give each surface its own
 * ledger and let two of them clobber each other's writes.
 *
 * Account switching is the one thing the machine cannot infer: `AccountSwitched`
 * clears the whole ledger — including the per-account send history — and
 * reloads. Missing it is what makes one account's recipients leak into the
 * next's suggestions, so the active address is tracked here and the event is
 * dispatched at session start and on every change. The same event doubles as
 * the explicit refresh a surface performs when it opens, which is precisely the
 * old `clearContactsCache()` + lazy re-read, and is also what picks up writes
 * made through the still-TypeScript service (the receipt's "save contact").
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useWallet } from '@/models/wallet-state';
import { createContactsSession, type ContactsSession } from '@/services/wallet-state-core/contacts-session';
import type { Contact as WireContact } from '@/services/wallet-state-core/generated/Contact';
import type { ContactGroupView } from '@/services/wallet-state-core/generated/ContactGroupView';
import type { ContactsView } from '@/services/wallet-state-core/generated/ContactsView';
import type { Contact, ContactGroup, SaveContactInput, SaveGroupInput } from '@/services/contacts';
import type { ImportReport, ParsedContactsImport } from '@/services/contact-io';
import type { RecipientIdentity } from '@/services/recipient-identity';

import type { ContactsBook, RecipientTrustSignal } from './contacts-controller-types';

const EMPTY_VIEW: ContactsView = {
  loaded: false,
  contacts: [],
  sections: [],
  groups: [],
  last_import: null,
  import_failure: null,
  export: null,
  recipient: null,
};

/** The newest view, loaded or not — what the management surfaces render. */
let current: ContactsView = EMPTY_VIEW;
/**
 * The newest *loaded* view. A reload passes through `loaded: false`, and the
 * read-only trust lines scattered across the send flow must not blink their
 * green check off and on while a sheet elsewhere refreshes.
 */
let settled: ContactsView = EMPTY_VIEW;

const liveListeners = new Set<(view: ContactsView) => void>();
const settledListeners = new Set<(view: ContactsView) => void>();

let session: ContactsSession | null = null;
/** The account the ledger currently belongs to; `null` before sign-in. */
let account: string | null = null;

function commit(view: ContactsView) {
  current = view;
  liveListeners.forEach((listener) => listener(view));
  if (!view.loaded) return;
  settled = view;
  settledListeners.forEach((listener) => listener(view));
}

function ensureSession(): ContactsSession {
  if (session) return session;
  session = createContactsSession({
    onView: commit,
    onError: (error) => console.error('[contacts] core fault:', error),
  });
  session.start({ type: 'account_switched', my_address: account });
  return session;
}

/** Point the ledger at an account, reloading it whenever that account changes. */
function syncAccount(address: string | null) {
  const next = address ? address.toLowerCase() : null;
  if (!session) {
    account = next;
    ensureSession();
    return;
  }
  if (next === account) return;
  account = next;
  session.dispatch({ type: 'account_switched', my_address: next });
}

/** Re-read the three stores and the send history for the current account. */
function reload() {
  ensureSession().dispatch({ type: 'account_switched', my_address: account });
}

/**
 * The local transaction store changed — a send landed — so the suggestion
 * source must be re-derived.
 *
 * The TypeScript service re-read history inside every `getAllContacts`, which
 * the contacts sheets reproduce by refreshing when they open, so nothing is
 * stale by the time it is looked at. This is the cheaper, targeted seam for the
 * send path to call the moment a transfer is recorded; it is a no-op on native,
 * where the read is already lazy.
 */
export function notifyContactsHistoryChanged(): void {
  if (!session) return; // nothing is watching the book yet
  session.dispatch({ type: 'history_changed' });
}

function dispatch(event: Parameters<ContactsSession['dispatch']>[0]) {
  ensureSession().dispatch(event);
}

/**
 * Save a contact from OUTSIDE the React tree — the receipt's "save contact".
 *
 * `SendScreen.tsx:169` was the last writer on this key that still went through
 * the TypeScript service, which made the contacts core one of two authors of the
 * same store (integration-plan, carried-forward gaps). It is the same `save`
 * event `useContactsBook().save` dispatches; having it as a plain function is
 * only so the send controller can call it from a callback rather than a hook.
 */
export function saveContactThroughCore(input: SaveContactInput): void {
  dispatch({
    type: 'save',
    input: {
      address: input.address,
      name: input.name ?? null,
      note: input.note ?? null,
      favorite: input.favorite ?? null,
      kind: input.kind ?? null,
      resolved_name: input.resolvedName ?? null,
      resolved_source: input.resolvedSource ?? null,
    },
    now_ms: Date.now(),
  });
}

/**
 * The saved contact for ONE address, from OUTSIDE the React tree — the read
 * behind `services/saved-contact.web.ts`.
 *
 * `getSavedContact` (contacts.ts:253) re-read the store on every call, and four
 * surfaces still called it on web (the recipient name, the trust badge, the
 * signing address identity, the summary line) while this core held the same
 * ledger — the second implementation of "is this address saved, and what is it
 * called" (spec 017). They read this instead, so a save made through the core is
 * visible to them immediately and a tombstone hides the address here too.
 *
 * Resolves against the first *loaded* view, so it never answers "not saved" off
 * an empty pre-load ledger — the answer's whole purpose is an anti-poisoning
 * signal, and a false negative there is the dangerous direction.
 */
export async function savedContactThroughCore(address: string): Promise<Contact | null> {
  // `async` on purpose: a wasm that failed to initialise makes `ensureSession`
  // throw, and the callers are `.then(...).catch(...)` effects — a SYNCHRONOUS
  // throw would escape their catch and take the row's whole tree down. As a
  // rejection it lands where the old `getSavedContact` failure landed.
  const addr = address.toLowerCase();
  const pick = (view: ContactsView): Contact | null => {
    const wire = savedContact(view, addr);
    return wire ? toContact(wire) : null;
  };
  ensureSession();
  if (settled.loaded) return Promise.resolve(pick(settled));
  return new Promise<Contact | null>((resolve) => {
    const listener = (view: ContactsView) => {
      settledListeners.delete(listener);
      resolve(pick(view));
    };
    settledListeners.add(listener);
  });
}

// ---------------------------------------------------------------------------
// Wire → the shapes the components render
// ---------------------------------------------------------------------------

function toContact(wire: WireContact): Contact {
  return {
    address: wire.address,
    ...(wire.name != null ? { name: wire.name } : {}),
    ...(wire.resolved_name != null ? { resolvedName: wire.resolved_name } : {}),
    ...(wire.resolved_source != null ? { resolvedSource: wire.resolved_source } : {}),
    kind: wire.kind,
    favorite: wire.favorite,
    ...(wire.note != null ? { note: wire.note } : {}),
    txCount: wire.tx_count,
    lastUsed: wire.last_used_ms,
    firstSeen: wire.first_seen_ms,
    source: wire.source,
  };
}

function toGroup(view: ContactGroupView): ContactGroup {
  return {
    id: view.id,
    name: view.name,
    ...(view.color != null ? { color: view.color } : {}),
    // The core resolves members to contacts for send-to-group; the sheets want
    // the addresses back.
    members: view.members.map((member) => member.address),
  };
}

/** The saved contact for an address, or `undefined` — `source: 'manual'` IS saved. */
function savedContact(view: ContactsView, address: string): WireContact | undefined {
  return view.contacts.find((c) => c.address === address && c.source === 'manual');
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * @param _myAddress the native controller's "exclude me from suggestions"
 * argument. The core already knows the account (it is the one the ledger was
 * loaded for), so the parameter is accepted and ignored here — one session
 * cannot hold two answers.
 */
export function useContactsBook(_myAddress?: string): ContactsBook {
  const address = useWallet().state.address || null;
  const [view, setView] = useState<ContactsView>(() => current);

  useEffect(() => {
    liveListeners.add(setView);
    syncAccount(address);
    setView(current);
    return () => { liveListeners.delete(setView); };
  }, [address]);

  const refresh = useCallback(() => { reload(); }, []);

  const save = useCallback(async (input: SaveContactInput) => {
    dispatch({
      type: 'save',
      input: {
        address: input.address,
        name: input.name ?? null,
        note: input.note ?? null,
        favorite: input.favorite ?? null,
        kind: input.kind ?? null,
        resolved_name: input.resolvedName ?? null,
        resolved_source: input.resolvedSource ?? null,
      },
      now_ms: Date.now(),
    });
  }, []);

  const remove = useCallback(async (address_: string) => {
    dispatch({ type: 'delete', address: address_, now_ms: Date.now() });
  }, []);

  const toggleFavorite = useCallback(async (address_: string) => {
    dispatch({ type: 'toggle_favorite', address: address_, now_ms: Date.now() });
  }, []);

  const saveGroup = useCallback(async (input: SaveGroupInput) => {
    dispatch({
      type: 'group_save',
      input: {
        id: input.id ?? null,
        name: input.name,
        color: input.color ?? null,
        members: input.members ?? null,
      },
    });
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    dispatch({ type: 'group_delete', id });
  }, []);

  const importParsed = useCallback(async (parsed: ParsedContactsImport): Promise<ImportReport> => {
    dispatch({
      type: 'import_parsed',
      contacts: parsed.contacts.map((c) => ({
        address: c.address,
        name: c.name ?? null,
        note: c.note ?? null,
        favorite: c.favorite ?? null,
      })),
      groups: parsed.groups.map((g) => ({
        name: g.name,
        color: g.color ?? null,
        members: g.members,
      })),
      now_ms: Date.now(),
    });
    // A wasm dispatch is synchronous, so the report the core just wrote is
    // already on the committed view by the time this returns.
    const report = current.last_import;
    return {
      added: report?.added ?? 0,
      skipped: report?.skipped ?? 0,
      invalid: report?.invalid ?? 0,
      groupsCreated: report?.groups_created ?? 0,
    };
  }, []);

  // Derived once per committed view: the sheets memoise their filters on these
  // arrays, and a fresh identity every render would defeat that.
  const contacts = useMemo(
    () => (view.loaded ? view.contacts.map(toContact) : null),
    [view],
  );
  const saved = useMemo(
    () => (view.loaded ? view.contacts.filter((c) => c.source === 'manual').map(toContact) : null),
    [view],
  );
  const groups = useMemo(() => view.groups.map(toGroup), [view]);

  return {
    contacts,
    saved,
    groups,
    refresh,
    save,
    remove,
    toggleFavorite,
    saveGroup,
    deleteGroup,
    importParsed,
  };
}

/**
 * One recipient's trust signal, read off the same shared ledger — WEB.
 *
 * Read-only, so it renders from the last *loaded* view: a management sheet
 * refreshing elsewhere must not flicker the green check off a recipient row.
 *
 * @param _identity the native controller's "skip the duplicate lookup" hint.
 * The core resolves and caches identities itself, so it is accepted for
 * signature parity and ignored.
 * @param chainId the chain the recipient is being paid on. Supplying it lets
 * the core inspect the address: resolve its identity (writing the name back
 * onto a saved-but-unnamed contact) and classify it. The core dedupes and
 * caches both per address, so N rows inspecting at once cost one lookup each.
 */
export function useRecipientTrust(
  address?: string,
  _identity?: RecipientIdentity | null,
  chainId?: number,
): RecipientTrustSignal | null {
  const walletAddress = useWallet().state.address || null;
  const [view, setView] = useState<ContactsView>(() => settled);

  useEffect(() => {
    settledListeners.add(setView);
    syncAccount(walletAddress);
    setView(settled);
    return () => { settledListeners.delete(setView); };
  }, [walletAddress]);

  useEffect(() => {
    if (!address || chainId == null) return;
    dispatch({ type: 'inspect_recipient', chain_id: chainId, address });
  }, [address, chainId]);

  if (!address) return null;
  const saved = savedContact(view, address.toLowerCase());
  if (!saved) return null;
  // The core's own precedence: user name → cached identity name → nothing (the
  // component then falls back to the live identity or a generic label).
  return {
    name: saved.name || saved.resolved_name || '',
    favorite: saved.favorite,
  };
}
