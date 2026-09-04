/**
 * The service worker: routing, and no authoritative state (spec 027 T320/T322).
 *
 * Ported in PART from packages/safari-extension/src/background.js @ 52ad8fa9.
 * Safari's version also HELD policy — per-origin grants in `storage.local`, a
 * read proxy to a public node, a native round-trip to the iOS app. None of that
 * comes across. Every decision this extension makes belongs to the core's own
 * machines (`dapp_permissions`, `dapp_session`, `ext_cache`), which run in the
 * wallet, not here. This file carries requests to the wallet and answers back,
 * and it makes exactly one promise of its own:
 *
 *   **a request is never left unanswered.**
 *
 * MV3 evicts an idle worker, and a page promise that never settles is the worst
 * thing this extension can produce — a dApp spinner that spins forever while
 * the person cannot tell whether their money moved. So a request is written
 * down the moment it arrives, a window closed without a decision answers 4001,
 * and content.js has its own deadline on top (spec 027 D37).
 */
import {
	ERR,
	REQUEST_PREFIX,
	classifyMethod,
	isWellFormedRequest,
	rpcError
} from './lib/protocol.js';

// ---------------------------------------------------------------------------
// The doorway
// ---------------------------------------------------------------------------

/**
 * There is deliberately NO `default_popup`. An action popup is dismissed the
 * moment it loses focus, and every ceremony this wallet performs — signing IN
 * included — hands focus to the platform authenticator's own prompt. A wallet
 * living in the action popup would close itself in the middle of every passkey
 * it asks for (spec 027 D34). The toolbar button opens a real tab instead, and
 * it reuses the one already open rather than stacking copies.
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

/** The locale the wallet's own pages should open in. */
function uiLocale() {
	return negotiate(chrome.i18n?.getUILanguage?.());
}

const walletPage = (locale) => `${locale}/wallet.html`;
const requestPage = (locale, rid) => `${locale}/request.html?rid=${encodeURIComponent(rid)}`;

async function openWallet() {
	const url = chrome.runtime.getURL(walletPage(uiLocale()));
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

// ---------------------------------------------------------------------------
// Requests in flight
// ---------------------------------------------------------------------------

/**
 * The live half of a pending request: the page's own `sendResponse`, which
 * cannot be persisted and does not survive an eviction. The DURABLE half is in
 * `storage.local` under `REQUEST_PREFIX`, so a worker that comes back can still
 * find out what it owes an answer for.
 */
const pending = new Map();

async function remember(rid, record) {
	try {
		await chrome.storage.local.set({ [REQUEST_PREFIX + rid]: record });
	} catch {
		/* storage denied — the in-memory half still answers this session */
	}
}

async function forget(rid) {
	try {
		await chrome.storage.local.remove(REQUEST_PREFIX + rid);
	} catch {
		/* nothing to undo */
	}
}

/** Settle a request exactly once, whatever settles it. */
function settle(rid, payload) {
	const entry = pending.get(rid);
	if (!entry) return false;
	pending.delete(rid);
	void forget(rid);
	try {
		entry.reply(payload);
	} catch {
		/* the page is gone; the wallet's own record is the surviving truth */
	}
	if (entry.windowId !== undefined) {
		chrome.windows.remove(entry.windowId).catch(() => {});
	}
	return true;
}

/**
 * Open the window that will answer. A dedicated window, not the action popup,
 * and not an in-page sheet: the site asking for a signature must not be able to
 * style, cover or scroll the surface that decides.
 */
async function openRequestWindow(rid) {
	const created = await chrome.windows.create({
		url: chrome.runtime.getURL(requestPage(uiLocale(), rid)),
		type: 'popup',
		width: 420,
		height: 760,
		focused: true
	});
	const entry = pending.get(rid);
	if (entry) entry.windowId = created.id;
	return created.id;
}

/** A window closed without deciding IS a refusal (the 022 contract). */
chrome.windows.onRemoved.addListener((windowId) => {
	for (const [rid, entry] of pending) {
		if (entry.windowId === windowId) {
			settle(rid, { error: rpcError(ERR.USER_REJECTED, 'User rejected the request') });
		}
	}
});

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

async function route(request, sender, reply) {
	// The two facts the page cannot forge, taken from the browser rather than
	// from the message: who asked, and from where.
	const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : null);
	const tabId = sender.tab?.id;
	if (!origin || tabId === undefined) {
		reply({ error: rpcError(ERR.INTERNAL, 'Request did not come from a page') });
		return;
	}
	if (!isWellFormedRequest(request)) {
		// Malformed, or larger than a request has any business being. Refused
		// before it reaches a screen that would have to render it.
		reply({ error: rpcError(ERR.INVALID_PARAMS, 'Malformed request') });
		return;
	}

	const rid = `${tabId}:${request.id}`;
	if (pending.has(rid)) {
		// One answer, once. A repeated id is a page confusing itself.
		reply({ error: rpcError(ERR.INVALID_PARAMS, 'Duplicate request id') });
		return;
	}

	const bucket = classifyMethod(request.method);
	if (bucket === 'unsupported') {
		reply({
			error: rpcError(ERR.UNSUPPORTED_METHOD, `Vela does not support ${request.method}`)
		});
		return;
	}

	if (bucket !== 'sign' && bucket !== 'connect') {
		// Phase 4 wires `ext_cache` (the instant answers) and `dapp_permissions`
		// (what an origin may see), and Phase 5 the reads. Until then this says so
		// rather than inventing a default: a chain id or an account list made up
		// here would be a business rule living in the wrong place.
		reply({ error: rpcError(ERR.UNAUTHORIZED, 'Vela is not connected to this site yet') });
		return;
	}

	const record = {
		rid,
		id: request.id,
		method: request.method,
		params: request.params,
		origin,
		tabId,
		at: Date.now()
	};
	pending.set(rid, { reply, tabId, origin, windowId: undefined });
	await remember(rid, record);
	try {
		await openRequestWindow(rid);
	} catch (error) {
		settle(rid, { error: rpcError(ERR.INTERNAL, String(error?.message ?? error)) });
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || typeof message !== 'object') return;

	if (message.type === 'rpc') {
		route(message, sender, sendResponse);
		return true; // the answer comes later
	}

	// ---- the wallet's own half ---------------------------------------------

	if (message.type === 'requestDetail') {
		chrome.storage.local
			.get(REQUEST_PREFIX + message.rid)
			.then((all) => sendResponse(all[REQUEST_PREFIX + message.rid] ?? null))
			.catch(() => sendResponse(null));
		return true;
	}

	if (message.type === 'requestAnswer') {
		const delivered = settle(message.rid, { result: message.result, error: message.error });
		sendResponse({ delivered });
		return true;
	}

	return undefined;
});
