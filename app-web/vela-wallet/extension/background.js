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
	CLOSED_WITHOUT_ANSWER,
	ERR,
	PERM_PREFIX,
	REQUEST_PREFIX,
	classifyMethod,
	isWellFormedRequest,
	resolveGrantedAccounts,
	rpcError,
	toHexChainId
} from './lib/protocol.js';

/** The snapshot the wallet publishes for exactly this purpose. */
const EXT_CACHE_KEY = 'vela.ext.cache';

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

/**
 * A window that went away still owing an answer.
 *
 * The window settles itself with the CORE's answer on teardown; this is the
 * backstop for one that died before it could. Either way the code is 4900, not
 * 4001 — see `CLOSED_WITHOUT_ANSWER`. An explicit Cancel already answered 4001
 * before closing, so it never reaches here.
 */
chrome.windows.onRemoved.addListener((windowId) => {
	for (const [rid, entry] of pending) {
		if (entry.windowId === windowId) {
			settle(rid, {
				error: rpcError(CLOSED_WITHOUT_ANSWER.code, CLOSED_WITHOUT_ANSWER.message)
			});
		}
	}
});

// ---------------------------------------------------------------------------
// The instant answers
// ---------------------------------------------------------------------------

/**
 * What an origin may be told without asking anyone.
 *
 * Both values come from state the CORE authored — the grant it wrote, and the
 * snapshot `ext_cache` published — combined by `resolveGrantedAccounts`, a
 * pinned twin of the core's own rule (see its note in `lib/protocol.js`).
 */
async function answerFromSnapshot(method, origin) {
	let grant = null;
	let snapshot = null;
	try {
		const all = await chrome.storage.local.get([PERM_PREFIX + origin, EXT_CACHE_KEY]);
		grant = all[PERM_PREFIX + origin] ?? null;
		snapshot = all[EXT_CACHE_KEY] ?? null;
	} catch {
		/* storage denied — answered below as "nothing is known" */
	}
	const addresses = Array.isArray(snapshot?.accounts)
		? snapshot.accounts.map((a) => a?.address).filter((a) => typeof a === 'string')
		: null;
	const accounts = resolveGrantedAccounts(grant, addresses);

	switch (method) {
		case 'eth_accounts':
			// `[]` for an ungranted origin is the honest answer, and the one
			// EIP-1193 asks for: a disconnected wallet, with no prompt.
			return { result: accounts };
		case 'eth_chainId':
			return snapshot
				? { result: toHexChainId(snapshot.chain_id) }
				: { error: rpcError(ERR.UNAUTHORIZED, 'Vela has not been opened in this browser yet') };
		case 'net_version':
			return snapshot
				? { result: String(snapshot.chain_id) }
				: { error: rpcError(ERR.UNAUTHORIZED, 'Vela has not been opened in this browser yet') };
		case 'wallet_getPermissions':
			// EIP-2255's shape, from the same grant.
			return { result: accounts.length ? [{ parentCapability: 'eth_accounts' }] : [] };
		default:
			return { error: rpcError(ERR.METHOD_NOT_FOUND, `Unhandled state method ${method}`) };
	}
}

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

	if (bucket === 'state') {
		// Answered from what the WALLET published, never from a judgement made
		// here. A page that is already connected asks these on every load;
		// opening a window for them would be absurd.
		reply(await answerFromSnapshot(request.method, origin));
		return;
	}

	if (bucket !== 'sign' && bucket !== 'connect') {
		// Reads and chain switching arrive with their own phases. Saying so beats
		// inventing an answer here.
		reply({ error: rpcError(ERR.UNAUTHORIZED, 'Vela cannot answer that yet') });
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
