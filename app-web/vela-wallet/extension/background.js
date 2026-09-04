/**
 * The extension's service worker (spec 027 Phase 2 — the doorway only).
 *
 * Phase 3 gives this file its real job: routing a page's request to the wallet
 * and its answer back. For now it does one thing, and that one thing is a
 * decision worth writing down.
 *
 * There is deliberately NO `default_popup`. An action popup is dismissed the
 * moment it loses focus, and every ceremony this wallet performs — signing in
 * included — hands focus to the platform authenticator's own prompt. A wallet
 * living in the action popup would therefore close itself in the middle of
 * every passkey it asks for (spec 027 D34). Clicking the toolbar button opens a
 * real tab instead, and it reuses the one already open rather than stacking
 * copies.
 */

/** The wallet's entry page for a locale, as the packaged app lays it out. */
const walletPage = (locale) => `${locale}/wallet.html`;

/**
 * Which locale to open. The person's own choice is stored by the app under the
 * extension's origin; before they have made one, the browser's UI language is a
 * better guess than English. Anything unrecognised falls back to English, which
 * is what the app's own negotiation does.
 */
const LOCALES = [
	'en',
	'zh',
	'zh-TW',
	'zh-HK',
	'ja',
	'ko',
	'vi',
	'id',
	'tr',
	'es-MX',
	'pt-BR',
	'fr',
	'de',
	'ru',
	'it'
];

function negotiate(tag) {
	if (!tag) return 'en';
	if (LOCALES.includes(tag)) return tag;
	const base = tag.split('-')[0];
	return LOCALES.find((l) => l === base || l.startsWith(`${base}-`)) ?? 'en';
}

async function openWallet() {
	const locale = negotiate(chrome.i18n?.getUILanguage?.());
	const url = chrome.runtime.getURL(walletPage(locale));
	const [existing] = await chrome.tabs.query({ url: chrome.runtime.getURL('') + '*' });
	if (existing) {
		await chrome.tabs.update(existing.id, { active: true, url });
		await chrome.windows.update(existing.windowId, { focused: true });
		return;
	}
	await chrome.tabs.create({ url });
}

chrome.action.onClicked.addListener(() => {
	openWallet().catch((error) => console.error('[vela] could not open the wallet', error));
});
