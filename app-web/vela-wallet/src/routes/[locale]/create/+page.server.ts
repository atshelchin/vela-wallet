import type { EntryGenerator } from './$types';
import { SUPPORTED_LOCALES } from '$lib/i18n/locales';

/**
 * The create flow's own route (spec 019). Prerendered per locale like every
 * other page: the shell and its copy are static, and the only dynamic thing —
 * the state machine — arrives in the browser.
 */
export const entries: EntryGenerator = () => SUPPORTED_LOCALES.map((locale) => ({ locale }));
