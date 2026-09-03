/**
 * The live contacts builders (spec 024 T031): ContactsView → display models.
 * Core order authoritative; sectioning and search are render concerns.
 */
import { describe, expect, it } from 'vitest';
import type { Contact } from '$lib/core/generated/Contact';
import type { ContactsView } from '$lib/core/generated/ContactsView';
import { resolveContactsMessages } from '$lib/i18n/engine.server';
import { buildContactsLive, displayName, letterSections } from './live';

const m = resolveContactsMessages('en');
const identicon = (seed: string) => `<svg data-seed="${seed}"></svg>`;

function contact(partial: Partial<Contact> & { address: string }): Contact {
	return {
		name: null,
		resolved_name: null,
		resolved_source: null,
		kind: 'unknown',
		favorite: false,
		note: null,
		tx_count: 0,
		last_used_ms: 0,
		first_seen_ms: 0,
		source: 'manual',
		...partial
	};
}

const ALICE = contact({ address: '0x' + 'a1'.repeat(20), name: 'Alice', favorite: true });
const ANTON = contact({ address: '0x' + 'a2'.repeat(20), name: 'Anton' });
const BOB = contact({ address: '0x' + 'b1'.repeat(20), name: 'Bob' });
const UNNAMED = contact({ address: '0x' + 'c1'.repeat(20) });

const VIEW: ContactsView = {
	loaded: true,
	// Core order: favourites first, then recency — Anton before Alice would be
	// the core's business; this fixture has Alice (fav) first.
	contacts: [ALICE, ANTON, BOB, UNNAMED],
	groups: [{ id: 'g1', name: 'Payroll', color: null, members: [ALICE, BOB] }],
	last_import: null,
	recipient: null
};

describe('displayName', () => {
	it('the given name wins; an unnamed address introduces itself shortened', () => {
		expect(displayName(ALICE)).toBe('Alice');
		expect(displayName(UNNAMED)).toMatch(/^0x[0-9a-f]+…[0-9a-f]+$/i);
	});
});

describe('letterSections', () => {
	it('groups by initial, keeps core order inside a letter, 0x names go to #', () => {
		const sections = letterSections(VIEW, identicon, '');
		expect(sections.map((s) => s.letter)).toEqual(['A', 'B', '#']);
		expect(sections[0].contacts.map((c) => c.name)).toEqual(['Alice', 'Anton']);
	});

	it('search narrows by name and address, case-insensitive', () => {
		expect(letterSections(VIEW, identicon, 'ant')[0].contacts[0].name).toBe('Anton');
		expect(letterSections(VIEW, identicon, 'b1b1')[0].contacts[0].name).toBe('Bob');
		expect(letterSections(VIEW, identicon, 'zzz')).toEqual([]);
	});
});

describe('buildContactsLive', () => {
	it('an empty loaded book renders the invitation', () => {
		const model = buildContactsLive({ ...VIEW, contacts: [], groups: [] }, m, identicon, {
			screen: 'list',
			query: ''
		});
		expect(model.screen).toBe('empty');
		expect(model.empty?.primary).toBe(m.addContact);
	});

	it('the list carries groups (with core ids), counts, and the full A–Z rail', () => {
		const model = buildContactsLive(VIEW, m, identicon, { screen: 'list', query: '' });
		expect(model.screen).toBe('list');
		expect(model.list?.groups[0]).toMatchObject({ id: 'g1', name: 'Payroll', count: '2' });
		expect(model.list?.indexLetters).toHaveLength(27);
		expect(model.list?.sections.map((s) => s.letter)).toEqual(['A', 'B', '#']);
	});

	it('detail shows the selected contact with its group chips', () => {
		const model = buildContactsLive(VIEW, m, identicon, {
			screen: 'detail',
			query: '',
			selectedAddress: ALICE.address
		});
		expect(model.screen).toBe('detail');
		expect(model.detail?.contact.name).toBe('Alice');
		expect(model.detail?.chips).toEqual(['Payroll']);
		expect(model.detail?.address.full).toBe(ALICE.address);
	});

	it('a vanished selection falls back to the list, never a blank screen', () => {
		const model = buildContactsLive(VIEW, m, identicon, {
			screen: 'detail',
			query: '',
			selectedAddress: '0xdead'
		});
		expect(model.screen).toBe('list');
	});

	it('the group screen resolves members through the core view', () => {
		const model = buildContactsLive(VIEW, m, identicon, {
			screen: 'group',
			query: '',
			selectedGroupId: 'g1'
		});
		expect(model.screen).toBe('group');
		expect(model.group?.group.members.map((c) => c.name)).toEqual(['Alice', 'Bob']);
	});
});
