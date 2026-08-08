import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { SUPPORTED_LOCALES, textDirectionOf, type Locale } from '$lib/i18n/locales';
import { resolveFlowMessages, resolveWelcomeMessages } from '$lib/i18n/engine.server';

/**
 * Every [locale] page is prerendered (contracts/i18n-ssr.md): the vela-core
 * wasm engine resolves all strings here, at build time, and only serialized
 * strings reach the client. URL tags are case-sensitive canonical corpus tags;
 * anything else is a 404.
 */
export const prerender = true;

export const load: LayoutServerLoad = ({ params }) => {
	if (!(SUPPORTED_LOCALES as readonly string[]).includes(params.locale)) {
		error(404, `Unsupported locale "${params.locale}"`);
	}
	const locale = params.locale as Locale;
	return {
		locale,
		dir: textDirectionOf(locale),
		messages: resolveWelcomeMessages(locale),
		/** Onboarding flow copy (spec 014): raw templates, filled client-side. */
		flow: resolveFlowMessages(locale)
	};
};
