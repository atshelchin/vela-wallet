/**
 * The live contacts builders (spec 024, research D7): `ContactsView` → the
 * same display models the drawn components consume. Siblings of the fixture
 * builders — the galleries keep their canon.
 *
 * Two presentation judgements live here, both documented as render concerns:
 * - **Letter sectioning.** The core's list order (favourites first, then
 *   most-recent) is authoritative; the list PAGE presents an A–Z directory,
 *   so contacts are grouped by initial and keep the core's relative order
 *   inside each letter — the same class of work as date-grouping a feed.
 * - **Search filtering.** The core has no list-search event (its
 *   `matches_query` serves the recipient picker); filtering the rendered
 *   list by the box's text is display-side narrowing of core-ruled rows.
 */

import type { Contact } from '$lib/core/generated/Contact';
import type { ContactGroupView } from '$lib/core/generated/ContactGroupView';
import type { ContactsView } from '$lib/core/generated/ContactsView';
import { fill } from '$lib/wallet/messages';
import { shortenAddress } from '$lib/wallet/identity';
import type { ContactsMessages } from './messages';
import type {
	ContactDetailModel,
	ContactModel,
	ContactsHomeModel,
	ContactsListModel,
	EmptyCtaModel,
	GroupModel,
	LetterSectionModel
} from './model';

/** The full rail, always — letters without a section still render (018 D4). */
const INDEX_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

type Identicon = (seed: string) => string;

/** What the person calls this contact — their name wins over a resolved one,
 *  and an unnamed address introduces itself as its short form. */
export function displayName(contact: Contact): string {
	return contact.name ?? contact.resolved_name ?? shortenAddress(contact.address);
}

function toContactModel(contact: Contact, view: ContactsView, identicon: Identicon): ContactModel {
	return {
		name: displayName(contact),
		addressDisplay: shortenAddress(contact.address),
		addressFull: contact.address,
		identiconSvg: identicon(contact.address),
		groups: view.groups
			.filter((g) => g.members.some((mb) => mb.address === contact.address))
			.map((g) => g.name)
	};
}

function sectionLetter(name: string): string {
	const first = (name.trim()[0] ?? '#').toUpperCase();
	return first >= 'A' && first <= 'Z' ? first : '#';
}

/** Group the core-ordered list by initial; core order survives per letter. */
export function letterSections(
	view: ContactsView,
	identicon: Identicon,
	query: string
): LetterSectionModel[] {
	const q = query.trim().toLowerCase();
	const matches = (c: Contact) =>
		q === '' ||
		displayName(c).toLowerCase().includes(q) ||
		(c.resolved_name ?? '').toLowerCase().includes(q) ||
		c.address.includes(q);
	const byLetter = new Map<string, ContactModel[]>();
	for (const contact of view.contacts) {
		if (!matches(contact)) continue;
		const letter = sectionLetter(displayName(contact));
		const bucket = byLetter.get(letter) ?? [];
		bucket.push(toContactModel(contact, view, identicon));
		byLetter.set(letter, bucket);
	}
	return [...byLetter.entries()]
		.sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
		.map(([letter, contacts]) => ({ letter, contacts }));
}

function toGroupModel(
	group: ContactGroupView,
	view: ContactsView,
	m: ContactsMessages,
	identicon: Identicon
): GroupModel {
	return {
		id: group.id,
		name: group.name,
		countLabel: fill(m.groupMembers, { count: group.members.length }),
		count: String(group.members.length),
		membersLabel: fill(m.membersCount, { count: group.members.length }),
		members: group.members.map((member) => toContactModel(member, view, identicon))
	};
}

function emptyModel(m: ContactsMessages): EmptyCtaModel {
	return {
		title: m.empty,
		caption: m.emptyHint,
		primary: m.addContact,
		secondary: m.importFile
	};
}

export function liveContactDetail(
	contact: Contact,
	view: ContactsView,
	m: ContactsMessages,
	identicon: Identicon
): ContactDetailModel {
	const model = toContactModel(contact, view, identicon);
	// The address block wraps to two even halves on the phone (018 canon).
	const half = Math.ceil(contact.address.length / 2);
	return {
		contact: model,
		chips: model.groups,
		addChipLabel: m.moveGroup,
		actions: { send: m.send, receive: m.receive, qr: m.actionQr },
		address: {
			label: m.addressLabel,
			lines: [contact.address.slice(0, half), contact.address.slice(half)],
			full: contact.address,
			copyLabel: m.copyAddress
		},
		activityTitle: m.recentActivity,
		activityAction: m.activity.all,
		activityLink: m.viewAllActivity,
		// No local history on web yet (spec 025) — an honest empty list.
		rows: [],
		editLabel: m.edit,
		deleteLabel: m.deleteContact
	};
}

/** What the LIVE route renders — screen choice is the route's render state. */
export interface ContactsUiState {
	screen: 'list' | 'detail' | 'group' | 'empty';
	query: string;
	selectedAddress?: string;
	selectedGroupId?: string;
}

export function buildContactsLive(
	view: ContactsView,
	m: ContactsMessages,
	identicon: Identicon,
	ui: ContactsUiState
): ContactsHomeModel {
	const base = {
		state: 'c1' as const,
		title: m.title,
		addLabel: m.addContact,
		editLabel: m.edit,
		menuLabel: m.manage,
		backLabel: m.cancel,
		tabs: {
			wallet: m.shell.navWallet,
			contacts: m.shell.navContacts,
			explore: m.shell.navExplore,
			settings: m.shell.navSettings
		}
	};

	if (
		ui.screen === 'empty' ||
		(ui.screen === 'list' && view.loaded && view.contacts.length === 0)
	) {
		return { ...base, screen: 'empty', empty: emptyModel(m) };
	}

	if (ui.screen === 'detail' && ui.selectedAddress !== undefined) {
		const contact = view.contacts.find((c) => c.address === ui.selectedAddress);
		if (contact !== undefined) {
			return { ...base, screen: 'detail', detail: liveContactDetail(contact, view, m, identicon) };
		}
	}

	if (ui.screen === 'group' && ui.selectedGroupId !== undefined) {
		const group = view.groups.find((g) => g.id === ui.selectedGroupId);
		if (group !== undefined) {
			return {
				...base,
				screen: 'group',
				group: {
					group: toGroupModel(group, view, m, identicon),
					addMember: m.addMember,
					cta: m.batchSend,
					ctaCaption: fill(m.batchSendHint, { count: group.members.length }),
					captionTitled: fill(m.batchSendHintTitled, { count: group.members.length }),
					menuLabel: m.manage
				}
			};
		}
	}

	const sections = letterSections(view, identicon, ui.query);
	const list: ContactsListModel = {
		search: { placeholder: m.searchPlaceholder, query: ui.query === '' ? undefined : ui.query },
		groupsTitle: m.sectionGroups,
		groupsAction: m.groupNew,
		groups: view.groups.map((g) => toGroupModel(g, view, m, identicon)),
		contactsTitle: m.sectionContacts,
		contactsCount: fill(m.countPeople, { count: view.contacts.length }),
		sections,
		indexLetters: INDEX_LETTERS,
		swipeActions: { send: m.send, delete: m.delete },
		noResults:
			ui.query !== '' && sections.length === 0 ? fill(m.noResults, { query: ui.query }) : undefined
	};
	return { ...base, screen: 'list', list };
}
