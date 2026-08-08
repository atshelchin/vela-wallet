/**
 * Gallery root: component boards + links to full screen states (spec 015
 * FR-004). Prerendered for the review locales; not linked from any user-facing
 * page. All resolution (strings, identicons) happens here at build time.
 */
import { error } from '@sveltejs/kit';
import { resolveWalletMessages } from '$lib/i18n/engine.server';
import { toLocale } from '$lib/i18n/locales';
import {
	buildDesktopState,
	buildMobileState,
	DESKTOP_STATES,
	IDENTICON_BOARD_SEEDS,
	MOBILE_STATES
} from '$lib/wallet/fixtures';
import { identiconSvgFor } from '$lib/wallet/identicon.server';
import type { WalletHomeModel } from '$lib/wallet/model';
import type { EntryGenerator, PageServerLoad } from './$types';

/** Review locales (spec US4: zh mocks + en). Other locales 404 here. */
export const entries: EntryGenerator = () => [{ locale: 'zh' }, { locale: 'en' }];

export const load: PageServerLoad = ({ params }) => {
	const locale = toLocale(params.locale ?? '');
	if (locale === undefined) error(404, `unsupported locale "${params.locale}"`);
	const messages = resolveWalletMessages(locale);
	const identicon = identiconSvgFor;

	const models: Partial<Record<string, WalletHomeModel>> = {};
	for (const state of ['h1s', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'] as const) {
		models[state] = buildMobileState(state, messages, identicon);
	}

	return {
		messages,
		models,
		mobileStates: MOBILE_STATES,
		desktopStates: DESKTOP_STATES,
		sidebar: buildDesktopState('d1', messages, identicon).sidebar,
		board: IDENTICON_BOARD_SEEDS.map((seed) => ({
			seed: seed === '' ? '(empty)' : seed,
			svg: identicon(seed)
		}))
	};
};
