import type { EntryGenerator } from './$types';
import { SUPPORTED_LOCALES } from '$lib/i18n/locales';

/** Prerender one Welcome page per supported locale; sub-pages are discovered by the crawler. */
export const entries: EntryGenerator = () => SUPPORTED_LOCALES.map((locale) => ({ locale }));
