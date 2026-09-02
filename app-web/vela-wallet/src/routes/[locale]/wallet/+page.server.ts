import { error } from '@sveltejs/kit';
import { resolveWalletMessages } from '$lib/i18n/engine.server';
import { SUPPORTED_LOCALES, toLocale } from '$lib/i18n/locales';
import { buildDesktopState, buildMobileState } from '$lib/wallet/fixtures';
import { identiconSvgFor } from '$lib/wallet/identicon.server';
import { EMPTY_HEADER } from '$lib/wallet/identity';
import type { EntryGenerator, PageServerLoad } from './$types';

/**
 * The signed-in wallet's own route (spec 019).
 *
 * Prerendered per locale like every other page: the body is still the spec-015
 * fixture layer and its copy is static, so all of it resolves here. What is NOT
 * resolved here is WHOSE wallet it is — the header ships empty and the browser
 * fills it from the session, because a prerendered fixture address would flash
 * a stranger's wallet at the person for a frame after hydration.
 *
 * The guard lives in the page, not in a `load`: prerendered pages have no
 * server request to redirect, and the only thing that knows whether this
 * browser has a wallet is the session core running in it.
 */
export const entries: EntryGenerator = () => SUPPORTED_LOCALES.map((locale) => ({ locale }));

export const load: PageServerLoad = ({ params }) => {
	const locale = toLocale(params.locale ?? '');
	if (locale === undefined) error(404, `unsupported locale "${params.locale}"`);
	const messages = resolveWalletMessages(locale);

	const home = buildMobileState('h1', messages, identiconSvgFor);
	const desktop = buildDesktopState('d1', messages, identiconSvgFor);

	// No explore data here (spec 022 founder call): 探索 is the in-app dApp
	// browser, and this client IS a browser tab — it cannot host one. The
	// vocabulary still ships for the gallery, which is the design source the
	// three native clients are reviewed against.
	return {
		walletMessages: messages,
		home: { ...home, header: EMPTY_HEADER },
		desktop: { ...desktop, sidebar: { ...desktop.sidebar, header: EMPTY_HEADER } }
	};
};
