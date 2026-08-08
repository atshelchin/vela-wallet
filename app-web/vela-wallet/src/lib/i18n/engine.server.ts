/**
 * vela-core i18n engine — BUILD-TIME ONLY seam (spec 006, contracts/i18n-ssr.md).
 *
 * Runs the real Rust resolver (the artefact spec 005 proved against i18next
 * with zero divergences) over the real generated catalogs (`public/i18n/`).
 * Every `[locale]` page is prerendered, so this module executes in Node during
 * `vite build` (and in the dev server / vitest) — never on the deployed
 * Cloudflare Worker, which cannot compile wasm from bytes. The e2e suite
 * asserts the built `_worker.js` contains no `WASM_BASE64`.
 *
 * Loading mirrors `src/i18n/index.web.ts` (RN web): the wasm is
 * base64-embedded and `initSync`'d at import; catalogs are statically imported
 * raw, so resolution is synchronous and immune to the working directory.
 */
import { initSync, I18n as WasmI18n } from '../../../../../rust/pkg-web/vela_core.js';
import { WASM_BASE64 } from '../../../../../rust/pkg-web/vela_core_bg.base64.js';
import { FALLBACK_LOCALE, type Locale } from './locales';
import { FEATURE_SLUGS, FLOW_KEYS, type FlowMessages, type WelcomeMessages } from './messages';

/** Generated runtime catalogs (gen-i18n.mjs stage 4), one per locale. */
const CATALOGS = import.meta.glob('../../../../../public/i18n/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

function catalogBytes(locale: string): Uint8Array {
	const entry = Object.entries(CATALOGS).find(([path]) => path.endsWith(`/${locale}.json`));
	if (!entry) throw new Error(`no generated catalog for locale "${locale}" in public/i18n/`);
	return new TextEncoder().encode(entry[1]);
}

initSync({ module: Buffer.from(WASM_BASE64, 'base64') });

const engine = new WasmI18n(catalogBytes(FALLBACK_LOCALE));

/**
 * Resolve `key` in `locale`. The engine echoes the key when nothing matches —
 * surface that as an error: a Welcome page must never ship raw keys.
 */
function t(locale: Locale, key: string): string {
	const value = engine.t(key);
	if (value === key) throw new Error(`i18n key "${key}" did not resolve for locale "${locale}"`);
	return value;
}

/** Make `locale` active, loading its catalog on first use. `en` ships in the constructor. */
function activate(locale: Locale): void {
	if (locale !== FALLBACK_LOCALE && !engine.residentLocales().includes(locale)) {
		engine.loadCatalog(locale, catalogBytes(locale));
	}
	engine.changeLanguage(locale);
}

export function textDirection(locale: Locale): string {
	activate(locale);
	return engine.dir();
}

/** The serializable strings the Welcome page renders (data-model.md PageMessages). */
export function resolveWelcomeMessages(locale: Locale): WelcomeMessages {
	activate(locale);
	return {
		metaTitle: t(locale, 'onboarding.welcomeWeb.meta.title'),
		metaDescription: t(locale, 'onboarding.welcomeWeb.meta.description'),
		tagline: t(locale, 'onboarding.welcomeWeb.tagline'),
		createWallet: t(locale, 'onboarding.welcome.createWallet'),
		alreadyHaveWallet: t(locale, 'onboarding.welcome.alreadyHaveWallet'),
		features: FEATURE_SLUGS.map((slug, i) => ({
			number: String(i + 1).padStart(2, '0'),
			title: t(locale, `onboarding.welcomeWeb.features.${slug}.title`),
			description: t(locale, `onboarding.welcomeWeb.features.${slug}.description`)
		}))
	};
}

/**
 * The serialized onboarding-flow copy (spec 014, T025): every key the
 * create/login panels can resolve, as raw templates — `{{var}}` fills happen
 * client-side from frozen presentation state. `t` throws on key echo, so a
 * missing corpus key fails the prerender instead of shipping a dotted key.
 */
export function resolveFlowMessages(locale: Locale): FlowMessages {
	activate(locale);
	return Object.fromEntries(FLOW_KEYS.map((key) => [key, t(locale, key)]));
}

/** Direct engine access for the differential test only. */
export function rawResolve(locale: Locale, key: string): string {
	activate(locale);
	return engine.t(key);
}
