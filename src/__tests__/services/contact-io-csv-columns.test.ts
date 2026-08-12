/**
 * CSV import: finding the address column, and never "succeeding" with nothing.
 *
 * The failure this pins is the quiet one. A contacts CSV exported from anywhere
 * but Vela rarely spells its header `address`; when the header word was missing
 * the parser fell back to column 0, and if column 0 held the name then EVERY
 * row failed the address test, every row was dropped right here, and the import
 * dialog said "0 added, 0 already existed" — a success sentence for a file that
 * was never read. Nothing to correct, nothing to try again differently.
 *
 * Two rules now stand between the user and that outcome:
 *   1. the header word is preferred, but the DATA settles it otherwise;
 *   2. a file whose rows all fail is an error, not a zero — the caller already
 *      renders that as "Import failed — use a JSON or CSV contacts file".
 * And malformed rows are handed on rather than swallowed, so the importer's
 * `invalid` counter (contacts.rs / importContacts) is the one thing counting
 * them, instead of reading a structural 0 on this path.
 */
import { parseContactsFile, importContacts, ContactsImportUnreadableError } from '@/services/contact-io';
import { clearContactsCache } from '@/services/contacts';

const mem = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mem.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mem.set(k, v); }),
}));
jest.mock('@/services/storage', () => ({ loadTransactions: jest.fn(async () => []) }));
jest.mock('@/services/recipient-identity', () => ({ resolveRecipientIdentity: jest.fn(async () => null) }));
jest.mock('@/services/rpc-pool', () => ({ poolRpcCall: jest.fn() }));

const A = '0x' + 'aa'.repeat(20);
const B = '0x' + 'bb'.repeat(20);

describe('the address column is found by the header, then by the data', () => {
  test("a header that says 'address' still wins, wherever it sits", () => {
    const csv = `name,address,note\nAlice,${A},lead`;
    expect(parseContactsFile(csv, 'c.csv').contacts).toEqual([
      { address: A, name: 'Alice', note: 'lead' },
    ]);
  });

  test('a foreign header word does not lose the file', () => {
    // `label,wallet` used to import 0 of 2 and report it as a success.
    const csv = `label,wallet\nAlice,${A}\nBob,${B}`;
    const parsed = parseContactsFile(csv, 'c.csv');
    expect(parsed.contacts.map((c) => c.address)).toEqual([A, B]);
    expect(parsed.contacts.map((c) => c.name)).toEqual(['Alice', 'Bob']);
  });

  test('a headerless file with the address in a later column', () => {
    const parsed = parseContactsFile(`Alice,${A}\nBob,${B}`, 'c.csv');
    expect(parsed.contacts).toEqual([
      { address: A, name: 'Alice' },
      { address: B, name: 'Bob' },
    ]);
  });

  test("our own export's positional order is unchanged", () => {
    expect(parseContactsFile(`${A},Alice,note,true,Payroll`, 'c.csv')).toEqual({
      contacts: [{ address: A, name: 'Alice', note: 'note', favorite: true }],
      groups: [{ name: 'Payroll', members: [A.toLowerCase()] }],
    });
  });
});

describe('a file we cannot read says so', () => {
  test('rows that all fail raise instead of importing zero of everything', () => {
    const csv = 'name,email\nAlice,alice@example.com\nBob,bob@example.com';
    expect(() => parseContactsFile(csv, 'c.csv')).toThrow(ContactsImportUnreadableError);
  });

  test('a header with no data rows is still an empty import, not an error', () => {
    expect(parseContactsFile('address,name', 'c.csv')).toEqual({ contacts: [], groups: [] });
    expect(parseContactsFile('', 'c.csv')).toEqual({ contacts: [], groups: [] });
  });
});

describe('malformed rows reach the importer that counts them', () => {
  beforeEach(() => { mem.clear(); clearContactsCache(); });

  test("a mixed file's bad rows are reported as invalid, not erased", async () => {
    const csv = `address,name\n${A},Alice\nnot-an-address,Mallory\n${B},Bob`;
    const parsed = parseContactsFile(csv, 'c.csv');
    expect(parsed.contacts).toHaveLength(3);

    const report = await importContacts(parsed);
    // Before, `parseCsv` dropped the bad row and this could only read 0.
    expect(report).toEqual({ added: 2, skipped: 0, invalid: 1, groupsCreated: 0 });
  });

  test('a row with an empty address cell is structure, not a failed contact', async () => {
    const csv = `address,name\n${A},Alice\n,\n${B},Bob`;
    const report = await importContacts(parseContactsFile(csv, 'c.csv'));
    expect(report).toMatchObject({ added: 2, invalid: 0 });
  });
});
