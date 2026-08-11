/**
 * contact-io — serialize, parse, and import the address book (contacts + groups).
 *
 * Two formats:
 *   - JSON  — full-fidelity backup/restore ({version, exportedAt, contacts, groups}).
 *   - CSV   — interop (`address,name,note,favorite,groups`); groups `;`-joined per row.
 *
 * Import policy is **existing-wins** (the user's choice): a row whose address is
 * already a saved contact is skipped untouched — import only ADDS new addresses,
 * so a re-import or a restore can never clobber a local rename/favorite/note.
 * Groups are additive: a newly-added contact is attached to a same-named group
 * (created if missing); existing contacts and their memberships are never altered.
 *
 * Serialize/parse are pure; only {@link importContacts} and the `export*` helpers
 * touch the contacts service.
 *
 * ── Who owns these rules ────────────────────────────────────────────────────
 * File FORMAT lives here and stays here: quoting, line endings, which column is
 * which, JSON-vs-CSV sniffing. The core asks for exactly that split — its
 * `ImportParsed` event takes already-parsed arrays, and everything it decides
 * about them (is this an address, existing-wins, de-duplication, which groups
 * are created, the counts in `ContactImportReport`) is `contacts.rs`'s.
 *
 * The one rule this file must NOT keep is validity. It used to `continue` past
 * every row whose address didn't parse, which meant the importer's `invalid`
 * counter could only ever read 0 on the CSV path — the file's mistakes were
 * erased before the machine that counts them ever saw them.
 */
import { isAddress } from '@/models/types';
import { splitCsvLine } from '@/services/recipient-table';
import {
  type Contact,
  type ContactGroup,
  getSavedContacts,
  getGroups,
  isSavedContact,
  saveContact,
  saveGroup,
} from '@/services/contacts';

export const CONTACTS_BACKUP_VERSION = 1;

export interface ExportedContact {
  address: string;
  name?: string;
  note?: string;
  favorite?: boolean;
}

/** A group in a backup — members are addresses (not ids), so import maps by name. */
export interface ExportedGroup {
  name: string;
  color?: string;
  members: string[];
}

export interface ContactsBackup {
  version: number;
  exportedAt: string;
  contacts: ExportedContact[];
  groups: ExportedGroup[];
}

export interface ParsedContactsImport {
  contacts: ExportedContact[];
  groups: ExportedGroup[];
}

export interface ImportReport {
  /** New addresses saved. */
  added: number;
  /** Rows skipped because the address already exists (existing-wins) or repeats in the file. */
  skipped: number;
  /** Rows dropped for a malformed address. */
  invalid: number;
  /** New groups created from the import. */
  groupsCreated: number;
}

// ── Serialize ────────────────────────────────────────────────────────────────

function toExportedContact(c: Contact | ExportedContact): ExportedContact {
  const out: ExportedContact = { address: c.address };
  if (c.name) out.name = c.name;
  if ('note' in c && c.note) out.note = c.note;
  if (c.favorite) out.favorite = true;
  return out;
}

export function serializeContactsJson(contacts: (Contact | ExportedContact)[], groups: ContactGroup[], exportedAt?: string): string {
  const backup: ContactsBackup = {
    version: CONTACTS_BACKUP_VERSION,
    exportedAt: exportedAt ?? new Date().toISOString(),
    contacts: contacts.map(toExportedContact),
    groups: groups.map((g) => ({ name: g.name, ...(g.color ? { color: g.color } : {}), members: [...g.members] })),
  };
  return JSON.stringify(backup, null, 2);
}

/** Quote a CSV cell only when it needs it (comma, quote, or newline). */
function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function serializeContactsCsv(contacts: (Contact | ExportedContact)[], groups: ContactGroup[]): string {
  const groupsByAddr = new Map<string, string[]>();
  for (const g of groups) {
    for (const m of g.members) {
      const arr = groupsByAddr.get(m) ?? [];
      arr.push(g.name);
      groupsByAddr.set(m, arr);
    }
  }
  const header = 'address,name,note,favorite,groups';
  const lines = contacts.map((c) =>
    [
      c.address,
      c.name ?? '',
      ('note' in c && c.note) || '',
      c.favorite ? 'true' : '',
      (groupsByAddr.get(c.address) ?? []).join(';'),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

// ── Parse ────────────────────────────────────────────────────────────────────

/** Detect JSON vs CSV by extension/shape, then parse into a normalised shape. */
export function parseContactsFile(content: string, filename?: string): ParsedContactsImport {
  const trimmed = content.replace(/^﻿/, '').trim();
  const looksJson = (!!filename && /\.json$/i.test(filename)) || trimmed.startsWith('{');
  return looksJson ? parseJson(trimmed) : parseCsv(trimmed);
}

function cleanImportedContact(c: Record<string, unknown>): ExportedContact | null {
  if (typeof c.address !== 'string') return null;
  const out: ExportedContact = { address: c.address };
  if (typeof c.name === 'string' && c.name) out.name = c.name;
  if (typeof c.note === 'string' && c.note) out.note = c.note;
  if (c.favorite === true || c.favorite === 'true') out.favorite = true;
  return out;
}

function parseJson(text: string): ParsedContactsImport {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { contacts: [], groups: [] };
  }
  const contacts: ExportedContact[] = Array.isArray(data?.contacts)
    ? data.contacts.map(cleanImportedContact).filter((c: ExportedContact | null): c is ExportedContact => !!c)
    : [];
  const groups: ExportedGroup[] = Array.isArray(data?.groups)
    ? data.groups
        .filter((g: any) => g && typeof g.name === 'string')
        .map((g: any) => ({
          name: String(g.name),
          ...(typeof g.color === 'string' ? { color: g.color } : {}),
          members: Array.isArray(g.members) ? g.members.filter((m: any) => typeof m === 'string') : [],
        }))
    : [];
  return { contacts, groups };
}

const nz = (i: number) => (i === -1 ? undefined : i);

interface CsvColumns { address: number; name?: number; note?: number; favorite?: number; groups?: number }

/**
 * Which column holds the address.
 *
 * The header word is preferred, but a foreign file rarely spells it `address`
 * — `wallet`, `Public Address`, `Recipient` are all common, and a header we
 * don't recognise used to fall back to *column 0*. When column 0 held the
 * NAME, every row failed the address test, every row was dropped silently, and
 * the import reported "0 added, 0 already existed": nothing imported, nothing
 * explained, nothing to try differently. So when the header does not say it,
 * the DATA does — the first column that actually contains an address.
 */
function findAddressColumn(header: string[] | null, rows: string[][]): number | null {
  if (header) {
    const named = header.findIndex((h) => h.toLowerCase() === 'address');
    if (named !== -1) return named;
  }
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (let i = 0; i < width; i += 1) {
    if (rows.some((r) => isAddress(r[i] ?? ''))) return i;
  }
  return null;
}

function indexColumns(header: string[] | null, address: number, namedAddress: boolean): CsvColumns {
  if (header && namedAddress) {
    // The file speaks our vocabulary — take every column it names and infer
    // nothing beyond them.
    const find = (kw: string) => nz(header.findIndex((h) => h.toLowerCase() === kw));
    return { address, name: find('name'), note: find('note'), favorite: find('favorite'), groups: find('groups') };
  }
  if (header) {
    // A foreign header (`label,wallet`): its words told us nothing, so keep
    // only what is unambiguous — the address, plus a single label column if the
    // header happens to name one.
    const named = nz(header.findIndex((h) => h.toLowerCase() === 'name'));
    return { address, name: named ?? firstOther(address) };
  }
  // Headerless: our own export order, positionally — but only when the address
  // sits where that order puts it. A headerless file whose address is somewhere
  // else tells us nothing about the rest, so we take the one thing that is
  // unambiguous (the label beside it) and no more.
  if (address === 0) return { address, name: 1, note: 2, favorite: 3, groups: 4 };
  return { address, name: firstOther(address) };
}

/** The first column that is not the address one — the de-facto label column. */
function firstOther(address: number): number {
  return address === 0 ? 1 : 0;
}

/**
 * Thrown when a CSV plainly had contact rows and not one of them yielded an
 * address. The caller already renders this as "Import failed — use a JSON or
 * CSV contacts file", which is the whole point: a file we cannot read must say
 * so, instead of succeeding with zero of everything.
 */
export class ContactsImportUnreadableError extends Error {
  constructor() {
    super('No address column found in the CSV');
    this.name = 'ContactsImportUnreadableError';
  }
}

function parseCsv(text: string): ParsedContactsImport {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { contacts: [], groups: [] };
  const first = splitCsvLine(lines[0], ',').map((c) => c.trim());
  const hasHeader = !first.some((c) => isAddress(c));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.map((line) => splitCsvLine(line, ',').map((c) => c.trim()));

  const header = hasHeader ? first : null;
  const namedAddress = !!header && header.some((h) => h.toLowerCase() === 'address');
  const addressCol = findAddressColumn(header, rows);
  const cols = indexColumns(header, addressCol ?? 0, namedAddress);

  const contacts: ExportedContact[] = [];
  const groupMap = new Map<string, string[]>();
  let valid = 0;
  let attempted = 0;
  for (const cells of rows) {
    const address = cells[cols.address] ?? '';
    // A row with nothing where the address goes is structure (a blank or a
    // separator), not a contact anyone tried to import.
    if (!address) continue;
    attempted += 1;
    const c: ExportedContact = { address };
    const name = cols.name != null ? cells[cols.name] : undefined;
    const note = cols.note != null ? cells[cols.note] : undefined;
    const fav = cols.favorite != null ? cells[cols.favorite] : undefined;
    if (name) c.name = name;
    if (note) c.note = note;
    if (fav && /^(true|1|yes)$/i.test(fav)) c.favorite = true;
    // Malformed rows are carried through rather than dropped here. "Is this an
    // address" is the importer's question, and it already counts the answer —
    // `ImportReport.invalid` was structurally 0 on the CSV path because this
    // loop had silently swallowed every bad row first.
    contacts.push(c);
    if (!isAddress(address)) continue;
    valid += 1;

    const grpCell = cols.groups != null ? cells[cols.groups] : undefined;
    if (grpCell) {
      for (const gname of grpCell.split(';').map((s) => s.trim()).filter(Boolean)) {
        const arr = groupMap.get(gname) ?? [];
        arr.push(address.toLowerCase());
        groupMap.set(gname, arr);
      }
    }
  }
  if (attempted > 0 && valid === 0) throw new ContactsImportUnreadableError();
  const groups: ExportedGroup[] = [...groupMap.entries()].map(([name, members]) => ({ name, members }));
  return { contacts, groups };
}

// ── Import (existing-wins) + export helpers ────────────────────────────────────

export async function importContacts(parsed: ParsedContactsImport): Promise<ImportReport> {
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  let groupsCreated = 0;
  const newlyAdded = new Set<string>();

  for (const c of parsed.contacts) {
    if (!isAddress(c.address)) {
      invalid += 1;
      continue;
    }
    const addr = c.address.toLowerCase();
    if (newlyAdded.has(addr) || (await isSavedContact(addr))) {
      skipped += 1; // existing-wins: never overwrite a local contact
      continue;
    }
    await saveContact({ address: addr, name: c.name, note: c.note, favorite: c.favorite });
    newlyAdded.add(addr);
    added += 1;
  }

  if (parsed.groups.length && newlyAdded.size) {
    const existing = await getGroups();
    const byName = new Map(existing.map((g) => [g.name.toLowerCase(), g]));
    for (const g of parsed.groups) {
      const membersToAdd = g.members.map((a) => a.toLowerCase()).filter((a) => newlyAdded.has(a));
      if (membersToAdd.length === 0) continue; // nothing new — leave existing groups alone
      const found = byName.get(g.name.toLowerCase());
      if (found) {
        const union = [...found.members];
        for (const m of membersToAdd) if (!union.includes(m)) union.push(m);
        await saveGroup({ id: found.id, name: found.name, members: union });
      } else {
        const created = await saveGroup({ name: g.name, color: g.color, members: membersToAdd });
        byName.set(g.name.toLowerCase(), created);
        groupsCreated += 1;
      }
    }
  }

  return { added, skipped, invalid, groupsCreated };
}

/** Current address book serialized for a backup file. */
export async function exportContactsJson(exportedAt?: string): Promise<string> {
  return serializeContactsJson(await getSavedContacts(), await getGroups(), exportedAt);
}

export async function exportContactsCsv(): Promise<string> {
  return serializeContactsCsv(await getSavedContacts(), await getGroups());
}
