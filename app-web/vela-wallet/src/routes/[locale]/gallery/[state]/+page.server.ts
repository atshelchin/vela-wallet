/**
 * Full-screen wallet states (spec 015 US1/US2): one prerendered page per
 * mock, mobile H1–H8 and desktop D1–D3, fixture-driven and offline.
 */
import { error } from '@sveltejs/kit';
import { resolveWalletMessages } from '$lib/i18n/engine.server';
import { toLocale } from '$lib/i18n/locales';
import {
	buildDesktopState,
	buildMobileState,
	DESKTOP_STATES,
	MOBILE_STATES
} from '$lib/wallet/fixtures';
import { identiconSvgFor } from '$lib/wallet/identicon.server';
import type { DesktopStateId, MobileStateId } from '$lib/wallet/model';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	(['zh', 'en'] as const).flatMap((locale) =>
		[...MOBILE_STATES, ...DESKTOP_STATES].map((state) => ({ locale, state }))
	);

export const load: PageServerLoad = ({ params }) => {
	const locale = toLocale(params.locale ?? '');
	if (locale === undefined) error(404, `unsupported locale "${params.locale}"`);
	const messages = resolveWalletMessages(locale);

	if ((MOBILE_STATES as string[]).includes(params.state)) {
		const state = params.state as MobileStateId;
		return { kind: 'mobile' as const, model: buildMobileState(state, messages, identiconSvgFor) };
	}
	if ((DESKTOP_STATES as string[]).includes(params.state)) {
		const state = params.state as DesktopStateId;
		return { kind: 'desktop' as const, model: buildDesktopState(state, messages, identiconSvgFor) };
	}
	error(404, `unknown wallet state "${params.state}"`);
};
