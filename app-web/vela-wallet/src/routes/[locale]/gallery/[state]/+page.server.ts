/**
 * Full-screen states (spec 015 US1/US2 + spec 018 US1/US2): one prerendered
 * page per mock — wallet H1–H8 / D1–D3 and contacts C1–C6 / DC1–DC6 —
 * fixture-driven and offline.
 */
import { error } from '@sveltejs/kit';
import {
	resolveContactsMessages,
	resolveSettingsMessages,
	resolveWalletMessages
} from '$lib/i18n/engine.server';
import { toLocale } from '$lib/i18n/locales';
import {
	buildDesktopState,
	buildMobileState,
	DESKTOP_STATES,
	MOBILE_STATES
} from '$lib/wallet/fixtures';
import {
	buildDesktopState as buildContactsDesktopState,
	buildMobileState as buildContactsMobileState,
	DESKTOP_STATES as CONTACTS_DESKTOP_STATES,
	MOBILE_STATES as CONTACTS_MOBILE_STATES
} from '$lib/contacts/fixtures';
import {
	buildDesktopState as buildSettingsDesktopState,
	buildMobileState as buildSettingsMobileState,
	DESKTOP_STATES as SETTINGS_DESKTOP_STATES,
	MOBILE_STATES as SETTINGS_MOBILE_STATES
} from '$lib/settings/fixtures';
import { buildDesktopState as buildWalletDesktopState } from '$lib/wallet/fixtures';
import { identiconSvgFor } from '$lib/wallet/identicon.server';
import type { DesktopStateId, MobileStateId } from '$lib/wallet/model';
import type { DesktopContactsStateId, MobileContactsStateId } from '$lib/contacts/model';
import type { DesktopSettingsStateId, MobileSettingsStateId } from '$lib/settings/model';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	(['zh', 'en'] as const).flatMap((locale) =>
		[
			...MOBILE_STATES,
			...DESKTOP_STATES,
			...CONTACTS_MOBILE_STATES,
			...CONTACTS_DESKTOP_STATES,
			...SETTINGS_MOBILE_STATES,
			...SETTINGS_DESKTOP_STATES
		].map((state) => ({ locale, state }))
	);

export const load: PageServerLoad = ({ params }) => {
	const locale = toLocale(params.locale ?? '');
	if (locale === undefined) error(404, `unsupported locale "${params.locale}"`);

	if ((MOBILE_STATES as string[]).includes(params.state)) {
		const messages = resolveWalletMessages(locale);
		const state = params.state as MobileStateId;
		return { kind: 'mobile' as const, model: buildMobileState(state, messages, identiconSvgFor) };
	}
	if ((DESKTOP_STATES as string[]).includes(params.state)) {
		const messages = resolveWalletMessages(locale);
		const state = params.state as DesktopStateId;
		return { kind: 'desktop' as const, model: buildDesktopState(state, messages, identiconSvgFor) };
	}
	if ((CONTACTS_MOBILE_STATES as string[]).includes(params.state)) {
		const messages = resolveContactsMessages(locale);
		const state = params.state as MobileContactsStateId;
		return {
			kind: 'contacts-mobile' as const,
			model: buildContactsMobileState(state, messages, identiconSvgFor)
		};
	}
	if ((CONTACTS_DESKTOP_STATES as string[]).includes(params.state)) {
		const messages = resolveContactsMessages(locale);
		const state = params.state as DesktopContactsStateId;
		return {
			kind: 'contacts-desktop' as const,
			model: buildContactsDesktopState(state, messages, identiconSvgFor)
		};
	}
	if ((SETTINGS_MOBILE_STATES as string[]).includes(params.state)) {
		const messages = resolveSettingsMessages(locale);
		const state = params.state as MobileSettingsStateId;
		return {
			kind: 'settings-mobile' as const,
			model: buildSettingsMobileState(state, messages, identiconSvgFor)
		};
	}
	if ((SETTINGS_DESKTOP_STATES as string[]).includes(params.state)) {
		const messages = resolveSettingsMessages(locale);
		const state = params.state as DesktopSettingsStateId;
		// The app sidebar is spec 015's, with 设置 selected — the settings page
		// is a destination inside the wallet shell, not a shell of its own.
		const wallet = buildWalletDesktopState('d1', resolveWalletMessages(locale), identiconSvgFor);
		return {
			kind: 'settings-desktop' as const,
			model: buildSettingsDesktopState(state, messages, identiconSvgFor),
			sidebar: {
				...wallet.sidebar,
				nav: wallet.sidebar.nav.map((item) => ({ ...item, selected: item.id === 'settings' }))
			}
		};
	}
	error(404, `unknown state "${params.state}"`);
};
