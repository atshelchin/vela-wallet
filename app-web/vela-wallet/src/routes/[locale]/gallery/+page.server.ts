/**
 * Gallery root: component boards + links to full screen states (spec 015
 * FR-004, extended by spec 018 with the contacts vocabulary). Prerendered for
 * the review locales; not linked from any user-facing page. All resolution
 * (strings, identicons) happens here at build time.
 */
import { error } from '@sveltejs/kit';
import {
	resolveContactsMessages,
	resolveIntroMessages,
	resolveWalletMessages
} from '$lib/i18n/engine.server';
import { toLocale } from '$lib/i18n/locales';
import {
	buildDesktopState,
	buildMobileState,
	DESKTOP_STATES,
	IDENTICON_BOARD_SEEDS,
	MOBILE_STATES
} from '$lib/wallet/fixtures';
import {
	addMenu,
	buildDesktopState as buildContactsDesktopState,
	buildMobileState as buildContactsMobileState,
	CONTACT_BOARD_SEEDS,
	contactContextMenu,
	DESKTOP_STATES as CONTACTS_DESKTOP_STATES,
	groupContextMenu,
	groupMenuMobile,
	headerDropdown,
	MOBILE_STATES as CONTACTS_MOBILE_STATES
} from '$lib/contacts/fixtures';
import { fill } from '$lib/wallet/messages';
import { identiconSvgFor } from '$lib/wallet/identicon.server';
import type { WalletHomeModel } from '$lib/wallet/model';
import type { EntryGenerator, PageServerLoad } from './$types';

/** Review locales (spec US4: zh mocks + en). Other locales 404 here. */
export const entries: EntryGenerator = () => [{ locale: 'zh' }, { locale: 'en' }];

export const load: PageServerLoad = ({ params }) => {
	const locale = toLocale(params.locale ?? '');
	if (locale === undefined) error(404, `unsupported locale "${params.locale}"`);
	const messages = resolveWalletMessages(locale);
	const contactsMessages = resolveContactsMessages(locale);
	const identicon = identiconSvgFor;

	const models: Partial<Record<string, WalletHomeModel>> = {};
	for (const state of ['h1s', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'] as const) {
		models[state] = buildMobileState(state, messages, identicon);
	}

	const c1 = buildContactsMobileState('c1', contactsMessages, identicon);
	const c1s = buildContactsMobileState('c1s', contactsMessages, identicon);
	const c1f = buildContactsMobileState('c1f', contactsMessages, identicon);
	const c2 = buildContactsMobileState('c2', contactsMessages, identicon);
	const c2s = buildContactsMobileState('c2s', contactsMessages, identicon);
	const c3 = buildContactsMobileState('c3', contactsMessages, identicon);
	const c4 = buildContactsMobileState('c4', contactsMessages, identicon);
	const dc1 = buildContactsDesktopState('dc1', contactsMessages, identicon);
	const dc4 = buildContactsDesktopState('dc4', contactsMessages, identicon);

	return {
		messages,
		contactsMessages,
		/** Spec 020: the first-run intro's copy, for the slide board. */
		intro: resolveIntroMessages(locale),
		models,
		mobileStates: MOBILE_STATES,
		desktopStates: DESKTOP_STATES,
		contactsMobileStates: CONTACTS_MOBILE_STATES,
		contactsDesktopStates: CONTACTS_DESKTOP_STATES,
		sidebar: buildDesktopState('d1', messages, identicon).sidebar,
		board: IDENTICON_BOARD_SEEDS.map((seed) => ({
			seed: seed === '' ? '(empty)' : seed,
			svg: identicon(seed)
		})),
		contacts: {
			list: c1.list,
			swipe: c1s.list,
			filtered: c1f.list,
			detail: c2.detail,
			confirm: c2s.confirm,
			empty: c3.empty,
			group: c4.group,
			rail: dc1.rail,
			railDrop: { ...dc4.rail, dropTarget: dc4.rail.groups[1]?.name },
			searchEmpty: {
				title: fill(contactsMessages.noResults, { query: 'zzz' }),
				caption: contactsMessages.emptyHint,
				primary: contactsMessages.addContact,
				secondary: contactsMessages.importFile
			},
			menus: {
				add: addMenu(contactsMessages),
				group: groupMenuMobile(contactsMessages),
				header: headerDropdown(contactsMessages),
				groupContext: groupContextMenu(contactsMessages),
				contactContext: contactContextMenu(contactsMessages)
			},
			board: CONTACT_BOARD_SEEDS.map((seed) => ({
				seed: seed === '' ? '(empty)' : seed,
				svg: identicon(seed)
			}))
		}
	};
};
