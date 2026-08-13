/**
 * The only place the `contacts` core touches the outside world.
 *
 * Each operation the core declares maps to exactly one existing service call —
 * the three AsyncStorage keys the address book has always owned, the local
 * transaction store, the name-service waterfall, the RPC pool. No branching on
 * business meaning here: if this file ever grows an `if` that decides what
 * happens next, that decision belongs in the Rust machine.
 *
 * Two shell-level jobs that are NOT decisions and so live here:
 *
 *  1. **Shape translation.** `vela.contacts` / `vela.contacts.dismissed` /
 *     `vela.contactGroups` were written by `services/contacts.ts` in camelCase
 *     (and the tombstones as an `address → ms` object). The core speaks the
 *     snake_case wire shape. The stored format is the compatibility contract —
 *     native still reads and writes it, and the e2e suites seed it — so it is
 *     preserved byte-for-byte and translated on the way in and out.
 *  2. **Defensive coercion.** The TS loaders `JSON.parse`d and trusted; serde
 *     does not. A field of the wrong type would make `resolve_effect` throw and
 *     the book would never load, so every row is normalised to the wire types
 *     with the same defaults the TS read sites applied (`c.name || undefined`,
 *     `!!c.favorite`, `t.timestamp ?? 0`). Anything unsalvageable answers empty,
 *     exactly as the old `catch { [] }` did.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with, so the core
 * keeps ownership of classification.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearContactsCache } from '@/services/contacts';
import { resolveRecipientIdentity } from '@/services/recipient-identity';
import { poolRpcCall } from '@/services/rpc-pool';
import { loadTransactions, type LocalTransaction } from '@/services/storage';

import type { Contact } from './generated/Contact';
import type { ContactGroup } from './generated/ContactGroup';
import type { ContactHistoryTx } from './generated/ContactHistoryTx';
import type { ContactKind } from './generated/ContactKind';
import type { ContactShellResult } from './generated/ContactShellResult';
import type { ContactSource } from './generated/ContactSource';
import type { ContactTombstone } from './generated/ContactTombstone';
import type { ContactTxKind } from './generated/ContactTxKind';
import type { ContactEffect } from './contacts-types';

// The three keys `services/contacts.ts` owns today — value formats unchanged.
const CONTACTS_KEY = 'vela.contacts';
const DISMISSED_KEY = 'vela.contacts.dismissed';
const GROUPS_KEY = 'vela.contactGroups';

// ---------------------------------------------------------------------------
// Stored shapes (what `services/contacts.ts` persists — camelCase, optionals)
// ---------------------------------------------------------------------------

type StoredContact = {
  address: string;
  name?: string;
  resolvedName?: string;
  resolvedSource?: string;
  kind: ContactKind;
  favorite?: boolean;
  note?: string;
  txCount: number;
  lastUsed: number;
  firstSeen: number;
  source: ContactSource;
};

type StoredGroup = { id: string; name: string; color?: string; members: string[] };

/** `vela.contacts.dismissed` is an `address → epoch ms` map, not a list. */
type StoredDismissed = Record<string, number>;

// ---------------------------------------------------------------------------
// Coercion helpers — deserialization hygiene, never policy
// ---------------------------------------------------------------------------

const KINDS: ContactKind[] = ['eoa', 'account', 'unknown'];
const TX_KINDS: ContactTxKind[] = [
  'send',
  'receive',
  'dapp_tx',
  'sign_message',
  'sign_typed_data',
  'connect',
];

/** A non-empty string, or null — the wire's reading of TS falsiness. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A finite number, or `fallback` — `Number.isFinite` guards NaN/Infinity/JSON nulls. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function kind(value: unknown): ContactKind {
  return KINDS.includes(value as ContactKind) ? (value as ContactKind) : 'unknown';
}

function txKind(value: unknown): ContactTxKind | null {
  // Absent (a legacy untyped record) and unrecognised both answer `null`; the
  // core owns what that means (no suggestion, but still a prior interaction).
  return TX_KINDS.includes(value as ContactTxKind) ? (value as ContactTxKind) : null;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Unreadable or corrupt — the TS loaders' `catch { [] }`.
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  // The surfaces that still read through `services/contacts.ts` (the signing
  // summary, the receipt's "save contact", the type badge) keep a lazy
  // module-level copy of these keys. Dropping it after a core write is cache
  // invalidation, not a decision: it makes those readers re-read the bytes the
  // core just wrote instead of serving a stale snapshot.
  clearContactsCache();
}

// ---------------------------------------------------------------------------
// Stored ⇄ wire
// ---------------------------------------------------------------------------

function toWireContact(stored: StoredContact): Contact {
  return {
    address: String(stored.address ?? '').toLowerCase(),
    name: str(stored.name),
    resolved_name: str(stored.resolvedName),
    resolved_source: str(stored.resolvedSource),
    kind: kind(stored.kind),
    favorite: !!stored.favorite,
    note: str(stored.note),
    tx_count: Math.max(0, Math.trunc(num(stored.txCount, 0))),
    last_used_ms: num(stored.lastUsed, 0),
    first_seen_ms: num(stored.firstSeen, 0),
    source: stored.source === 'auto' ? 'auto' : 'manual',
  };
}

function toStoredContact(contact: Contact): StoredContact {
  // Optional fields are omitted rather than written as `null` so the stored
  // JSON stays identical to what `services/contacts.ts` produces.
  return {
    address: contact.address,
    ...(contact.name != null ? { name: contact.name } : {}),
    ...(contact.resolved_name != null ? { resolvedName: contact.resolved_name } : {}),
    ...(contact.resolved_source != null ? { resolvedSource: contact.resolved_source } : {}),
    kind: contact.kind,
    favorite: contact.favorite,
    ...(contact.note != null ? { note: contact.note } : {}),
    txCount: contact.tx_count,
    lastUsed: contact.last_used_ms,
    firstSeen: contact.first_seen_ms,
    source: contact.source,
  };
}

function toWireGroup(stored: StoredGroup): ContactGroup {
  return {
    id: String(stored.id ?? ''),
    name: String(stored.name ?? ''),
    color: str(stored.color),
    members: Array.isArray(stored.members)
      ? stored.members.filter((m): m is string => typeof m === 'string')
      : [],
  };
}

function toStoredGroup(group: ContactGroup): StoredGroup {
  return {
    id: group.id,
    name: group.name,
    ...(group.color != null ? { color: group.color } : {}),
    members: group.members,
  };
}

function toWireHistoryTx(tx: LocalTransaction): ContactHistoryTx {
  return {
    kind: txKind(tx.type),
    to: str(tx.to),
    to_name: str(tx.toName),
    timestamp_ms: typeof tx.timestamp === 'number' && Number.isFinite(tx.timestamp) ? tx.timestamp : null,
  };
}

async function readContacts(): Promise<Contact[]> {
  const raw = await readJson<StoredContact[]>(CONTACTS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is StoredContact => !!c && typeof c === 'object' && typeof c.address === 'string')
    .map(toWireContact);
}

async function readTombstones(): Promise<ContactTombstone[]> {
  const raw = await readJson<StoredDismissed>(DISMISSED_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw)
    .filter(([, at]) => typeof at === 'number' && Number.isFinite(at))
    .map(([address, at]) => ({ address: address.toLowerCase(), dismissed_at_ms: at }));
}

function toStoredDismissed(tombstones: ContactTombstone[]): StoredDismissed {
  const out: StoredDismissed = {};
  for (const entry of tombstones) out[entry.address] = entry.dismissed_at_ms;
  return out;
}

async function readGroups(): Promise<ContactGroup[]> {
  const raw = await readJson<StoredGroup[]>(GROUPS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is StoredGroup => !!g && typeof g === 'object' && typeof g.id === 'string')
    .map(toWireGroup);
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export async function executeContactOperation(
  effect: ContactEffect,
): Promise<ContactShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_store': {
      const [contacts, tombstones, groups] = await Promise.all([
        readContacts(),
        readTombstones(),
        readGroups(),
      ]);
      return { type: 'store_loaded', contacts, tombstones, groups };
    }
    case 'write_contacts':
      await writeJson(CONTACTS_KEY, operation.contacts.map(toStoredContact));
      return { type: 'written' };
    case 'write_dismissed':
      await writeJson(DISMISSED_KEY, toStoredDismissed(operation.tombstones));
      return { type: 'written' };
    case 'write_groups':
      await writeJson(GROUPS_KEY, operation.groups.map(toStoredGroup));
      return { type: 'written' };
    case 'load_send_history': {
      const txs = await loadTransactions();
      return { type: 'history_loaded', txs: txs.map(toWireHistoryTx) };
    }
    case 'resolve_identity': {
      const identity = await resolveRecipientIdentity(operation.address);
      return {
        type: 'identity_resolved',
        address: operation.address,
        identity: identity ? { name: identity.name, source: identity.source } : null,
      };
    }
    case 'classify_recipient': {
      // The raw `eth_getCode` answer goes back untouched — the core owns both
      // projections (address-book kind, risk badge). A transport-level
      // non-answer is reported as `null`, never as a verdict.
      const response = await poolRpcCall('eth_getCode', [operation.address, 'latest'], operation.chain_id);
      const code = response?.error != null || typeof response?.result !== 'string' ? null : response.result;
      return {
        type: 'recipient_classified',
        chain_id: operation.chain_id,
        address: operation.address,
        code,
      };
    }
  }
}

export function contactOperationFailure(
  effect: ContactEffect,
  _error: unknown,
): ContactShellResult {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_store':
      // An unreadable store means "no address book yet" (today's catch).
      return { type: 'store_loaded', contacts: [], tombstones: [], groups: [] };
    case 'write_contacts':
    case 'write_dismissed':
    case 'write_groups':
      // Best-effort, as every `persist*` swallows storage errors today; the
      // in-memory ledger stays authoritative.
      return { type: 'written' };
    case 'load_send_history':
      // `loadTransactions` threw → no suggestions (contacts.ts:286-290).
      return { type: 'history_failed' };
    case 'resolve_identity':
      return { type: 'identity_resolved', address: operation.address, identity: null };
    case 'classify_recipient':
      return {
        type: 'recipient_classified',
        chain_id: operation.chain_id,
        address: operation.address,
        code: null,
      };
  }
}
