import { error } from '@sveltejs/kit';
import { resolveContactsMessages } from '$lib/i18n/engine.server';
import { SUPPORTED_LOCALES, toLocale } from '$lib/i18n/locales';
import type { EntryGenerator, PageServerLoad } from './$types';

/**
 * The address book's own route (spec 024) — the tab that used to swallow its
 * tap. Prerendered per locale like every route under `[locale]`; the page
 * ships only its copy, because the book itself lives in the browser and the
 * core has not ruled until it loads there. The guard lives in the page, as on
 * /wallet and /settings.
 */
export const entries: EntryGenerator = () => SUPPORTED_LOCALES.map((locale) => ({ locale }));

export const load: PageServerLoad = ({ params }) => {
	const locale = toLocale(params.locale ?? '');
	if (locale === undefined) error(404, `unsupported locale "${params.locale}"`);
	return {
		// Page-unique key — `messages` would shadow the layout's Welcome copy.
		contactsMessages: resolveContactsMessages(locale)
	};
};
