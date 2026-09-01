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
 * Loading mirrors `src/i18n/index.web.ts` (RN web): the wasm is read from the
 * committed `public/` asset and `initSync`'d at import (`wasm-init.server.ts`);
 * catalogs are statically imported raw, so resolution is synchronous.
 */
import { I18n as WasmI18n } from '../../../../../rust/pkg-web/vela_core.js';
import './wasm-init.server';
import { FALLBACK_LOCALE, type Locale } from './locales';
import { FLOW_KEYS, type FlowMessages, type WelcomeMessages } from './messages';
import type { WalletMessages } from '$lib/wallet/messages';
import type { ContactsMessages } from '$lib/contacts/messages';
import { INTRO_KEYS } from '$lib/intro/slides';
import { WALLET_FLOW_KEYS, type WalletFlowMessages } from '$lib/flows/messages';

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
		heroTitle: t(locale, 'onboarding.welcome.heroTitle'),
		heroTitleFit: t(locale, 'onboarding.welcome.heroTitleFit'),
		heroSubtitle: t(locale, 'onboarding.welcome.heroSubtitle'),
		createWallet: t(locale, 'onboarding.welcome.createWallet'),
		alreadyHaveWallet: t(locale, 'onboarding.welcome.alreadyHaveWallet')
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
	return Object.fromEntries(FLOW_KEYS.map((key) => [key, t(locale, key)])) as FlowMessages;
}

/**
 * The first-run intro's copy (spec 020). Same shape as the flow's: dotted key →
 * resolved template, filled client-side, so the carousel can be handed one map
 * instead of a field per string.
 */
export function resolveIntroMessages(locale: Locale): Readonly<Record<string, string>> {
	activate(locale);
	return Object.fromEntries(INTRO_KEYS.map((key) => [key, t(locale, key)]));
}

/** The serializable strings the wallet screens render (spec 015, research.md D3). */
export function resolveWalletMessages(locale: Locale): WalletMessages {
	activate(locale);
	const k = (key: string) => t(locale, key);
	return {
		nav: {
			wallet: k('componentsUi.mainNav.wallet'),
			contacts: k('componentsUi.mainNav.contacts'),
			explore: k('componentsUi.mainNav.explore'),
			settings: k('componentsUi.mainNav.settings')
		},
		balance: {
			totalLabel: k('home.totalBalance'),
			liveIndicator: k('home.liveIndicator'),
			stale: k('home.balanceStale'),
			unpriced: k('home.balanceUnpriced'),
			noPrice: k('home.balanceDetailNoPrice'),
			a11yHide: k('home.a11yHideBalance'),
			a11yShow: k('home.a11yShowBalance')
		},
		actions: {
			receive: k('componentsUi.dock.receive'),
			send: k('componentsUi.dock.send'),
			scan: k('componentsUi.dock.scan')
		},
		sections: {
			activity: k('home.tabActivity'),
			assets: k('assets.sectionTitle'),
			all: k('history.filterAll'),
			add: k('assets.addToken')
		},
		activity: {
			sent: k('history.labelSent'),
			received: k('history.labelReceived'),
			dapp: k('history.txLabelDappTx'),
			today: k('componentsUi.dayGroup.today'),
			yesterday: k('componentsUi.dayGroup.yesterday'),
			toName: k('history.toName'),
			fromName: k('history.fromName'),
			emptyTitle: k('home.emptyNoActivity'),
			emptyCaption: k('home.emptySubtitle')
		},
		assets: { emptyTitle: k('assets.emptyTitle'), emptyCaption: k('assets.emptySubtext') },
		networkFilter: {
			pillAll: k('componentsUi.networkFilter.pillAll'),
			sheetTitle: k('componentsUi.networkFilter.selectChain'),
			allNetworks: k('componentsUi.networkFilter.allNetworks')
		},
		sidebar: {
			networks: k('settingsModals.network.modalTitle'),
			searchPlaceholder: k('componentsUi.commandBar.placeholder')
		},
		receive: {
			title: k('receive.title'),
			addressLabel: k('receive.addressLabel'),
			copyAddress: k('componentsUi.identiconViewer.copyAddress'),
			qrCaption: k('componentsUi.qrPlaceholder.caption'),
			warningTitle: k('receive.warningTitle'),
			warningReminder: k('receive.warningReminder'),
			networksLine: k('receive.networksLine'),
			networkDetail: k('receive.networkDetail')
		},
		assetDetail: {
			send: k('tokenDetail.send'),
			receive: k('tokenDetail.receive'),
			labelName: k('tokenDetail.labelName'),
			labelPrice: k('tokenDetail.labelPrice'),
			priceValue: k('tokenDetail.priceValue'),
			labelContract: k('tokenDetail.labelContract'),
			labelDecimals: k('tokenDetail.labelDecimals'),
			labelTransactions: k('tokenDetail.labelTransactions'),
			viewOnExplorer: k('tokenDetail.viewOnExplorer'),
			nativeToken: k('addToken.labelNativeToken')
		},
		identiconViewer: {
			title: k('componentsUi.identiconViewer.title'),
			caption: k('componentsUi.identiconViewer.caption'),
			copyAddress: k('componentsUi.identiconViewer.copyAddress'),
			copied: k('componentsUi.identiconViewer.copied'),
			close: k('componentsUi.identiconViewer.close'),
			a11yOpen: k('componentsUi.identiconViewer.a11yOpen')
		},
		signOut: {
			title: k('settings.signOut.title'),
			keeps: k('settings.signOut.keeps'),
			warning: k('settings.signOut.warning'),
			button: k('settings.signOut.button'),
			anyway: k('settings.signOut.anyway'),
			cancel: k('settings.signOut.cancel')
		},
		close: k('componentsUi.identiconViewer.close')
	};
}

/** The serializable strings the contacts screens render (spec 018, D3). */
export function resolveContactsMessages(locale: Locale): ContactsMessages {
	activate(locale);
	const k = (key: string) => t(locale, key);
	return {
		title: k('contacts.title'),
		searchPlaceholder: k('contacts.searchPlaceholder'),
		sectionGroups: k('contacts.sectionGroups'),
		sectionContacts: k('contacts.sectionContacts'),
		manage: k('contacts.manage'),
		allContacts: k('contacts.allContacts'),
		countPeople: k('contacts.countPeople'),
		groupMembers: k('contacts.groupMembers'),
		membersCount: k('contacts.membersCount'),
		groupNew: k('contacts.groupNew'),
		groupEdit: k('contacts.groupEdit'),
		groupRename: k('contacts.groupRename'),
		groupDelete: k('contacts.groupDelete'),
		moveGroup: k('contacts.moveGroup'),
		addMember: k('contacts.addMember'),
		addContact: k('contacts.addContact'),
		addTitle: k('contacts.addTitle'),
		edit: k('contacts.edit'),
		empty: k('contacts.empty'),
		emptyHint: k('contacts.emptyHint'),
		noResults: k('contacts.noResults'),
		batchSend: k('contacts.batchSend'),
		batchSendHint: k('contacts.batchSendHint'),
		batchSendHintTitled: k('contacts.batchSendHintTitled'),
		importFile: k('contacts.importFile'),
		importAll: k('contacts.importAll'),
		importGroup: k('contacts.importGroup'),
		exportTitle: k('contacts.exportTitle'),
		exportAll: k('contacts.exportAll'),
		exportGroup: k('contacts.exportGroup'),
		recentActivity: k('contacts.recentActivity'),
		viewAllActivity: k('contacts.viewAllActivity'),
		addressLabel: k('contacts.addressLabel'),
		copyAddress: k('componentsUi.identiconViewer.copyAddress'),
		send: k('componentsUi.dock.send'),
		receive: k('componentsUi.dock.receive'),
		actionQr: k('contacts.actionQr'),
		deleteContact: k('contacts.deleteContact'),
		delete: k('contacts.delete'),
		deleteTitle: k('contacts.deleteTitle'),
		deleteBody: k('contacts.deleteBody'),
		cancel: k('contacts.cancel'),
		activity: {
			sent: k('history.labelSent'),
			received: k('history.labelReceived'),
			yesterday: k('componentsUi.dayGroup.yesterday'),
			all: k('history.filterAll')
		},
		shell: {
			navWallet: k('componentsUi.mainNav.wallet'),
			navContacts: k('componentsUi.mainNav.contacts'),
			navExplore: k('componentsUi.mainNav.explore'),
			navSettings: k('componentsUi.mainNav.settings'),
			networksTitle: k('settingsModals.network.modalTitle'),
			commandBarPlaceholder: k('componentsUi.commandBar.placeholder'),
			allNetworks: k('componentsUi.networkFilter.allNetworks'),
			close: k('componentsUi.identiconViewer.close')
		}
	};
}

/**
 * The Receive / Send / Activity / Assets copy (spec 021). Flat, like the
 * onboarding flow's and the intro's: with ~120 strings across four journeys a
 * nested manifest would be more field declarations than copy, and each one
 * would have to be restated here by hand.
 */
export function resolveWalletFlowMessages(locale: Locale): WalletFlowMessages {
	activate(locale);
	return Object.fromEntries(
		WALLET_FLOW_KEYS.map((key) => [key, t(locale, key)])
	) as WalletFlowMessages;
}

/** Direct engine access for the differential test only. */
export function rawResolve(locale: Locale, key: string): string {
	activate(locale);
	return engine.t(key);
}
