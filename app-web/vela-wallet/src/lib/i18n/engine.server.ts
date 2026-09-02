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
import type { SettingsMessages } from '$lib/settings/messages';

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

/** The serializable strings the settings screens render (spec 023). */
export function resolveSettingsMessages(locale: Locale): SettingsMessages {
	activate(locale);
	const k = (key: string) => t(locale, key);
	return {
		title: k('settings.title'),
		nav: {
			wallet: k('componentsUi.mainNav.wallet'),
			contacts: k('componentsUi.mainNav.contacts'),
			explore: k('componentsUi.mainNav.explore'),
			settings: k('componentsUi.mainNav.settings')
		},
		sections: {
			account: k('settings.sections.account'),
			appearance: k('settings.sections.appearance'),
			localization: k('settings.sections.localization'),
			advanced: k('settings.sections.advanced')
		},
		account: {
			switch: k('settings.account.switch'),
			contactsSubtitle: k('settings.account.contactsSubtitle')
		},
		contacts: k('componentsUi.mainNav.contacts'),
		feedback: { title: k('settings.feedback.title'), subtitle: k('settings.feedback.subtitle') },
		appearance: {
			themeTitle: k('settings.appearance.themeTitle'),
			themeLight: k('settings.appearance.themeLight'),
			themeDark: k('settings.appearance.themeDark'),
			themeAuto: k('settings.appearance.themeAuto'),
			avatarTitle: k('settings.appearance.avatarTitle'),
			avatarInitials: k('settings.appearance.avatarInitials'),
			avatarIdenticon: k('settings.appearance.avatarIdenticon'),
			textScale: k('settings.appearance.textScale')
		},
		language: {
			title: k('language.title'),
			pickerTitle: k('language.pickerTitle'),
			pickerSubtitle: k('language.pickerSubtitle'),
			followSystem: k('language.followSystem'),
			contributeNote: k('language.contributeNote'),
			contributeCta: k('language.contributeCta')
		},
		localization: {
			currencyTitle: k('settings.localization.currencyTitle'),
			autoExample: k('settings.localization.autoExample'),
			numberTitle: k('settings.localization.numberTitle'),
			numberSubtitle: k('settings.localization.numberSubtitle'),
			dateTitle: k('settings.localization.dateTitle'),
			dateSubtitle: k('settings.localization.dateSubtitle'),
			timeTitle: k('settings.localization.timeTitle'),
			timeSubtitle: k('settings.localization.timeSubtitle')
		},
		formatNote: {
			system: k('settings.formatNote.system'),
			indian: k('settings.formatNote.indian'),
			h24: k('settings.formatNote.h24'),
			h12: k('settings.formatNote.h12')
		},
		currency: {
			title: k('componentsUi.currency.title'),
			searchPlaceholder: k('componentsUi.currency.searchPlaceholder')
		},
		advanced: {
			networksTitle: k('settings.advanced.networksTitle'),
			networksSubtitle: k('settings.advanced.networksSubtitle'),
			rpcProvidersTitle: k('settings.advanced.rpcProvidersTitle'),
			rpcProvidersSubtitle: k('settings.advanced.rpcProvidersSubtitle'),
			addNetworkTitle: k('settings.advanced.addNetworkTitle'),
			addNetworkSubtitle: k('settings.advanced.addNetworkSubtitle'),
			endpointsTitle: k('settings.advanced.endpointsTitle'),
			endpointsSubtitle: k('settings.advanced.endpointsSubtitle')
		},
		networks: {
			count: k('settings.networks.count'),
			custom: k('settings.networks.custom'),
			builtinNote: k('settings.networks.builtinNote'),
			saveHint: k('settings.networks.saveHint'),
			online: k('settings.networks.online'),
			offline: k('settingsModals.health.offline'),
			chainId: k('settingsModals.network.chainId'),
			rpcUrl: k('settingsModals.network.fieldRpcUrl'),
			explorer: k('settingsModals.network.fieldExplorer'),
			mismatch: k('settingsModals.network.rpcChainMismatch')
		},
		addNetwork: {
			description: k('settingsModals.addNetwork.description'),
			searchPlaceholder: k('settingsModals.addNetwork.searchPlaceholder'),
			compatible: k('settingsModals.addNetwork.compatible'),
			incompatible: k('settingsModals.addNetwork.incompatible'),
			compatibilityCheck: k('settingsModals.addNetwork.compatibilityCheck'),
			customRpcTitle: k('settingsModals.addNetwork.customRpcTitle'),
			customRpcPlaceholder: k('settingsModals.addNetwork.customRpcPlaceholder'),
			addNetworkBtn: k('settingsModals.addNetwork.addNetworkBtn'),
			incompatibleHint: k('settingsModals.addNetwork.incompatibleHint'),
			openChainSetupTool: k('settingsModals.addNetwork.openChainSetupTool'),
			recheckWithRpc: k('settingsModals.addNetwork.recheckWithRpc'),
			testnet: k('settingsModals.addNetwork.testnet'),
			bestRpc: k('settingsModals.addNetwork.bestRpc'),
			// A product name, not prose — the corpus has no key for it and should
			// not: translating "EntryPoint v0.7" would make the checklist lie.
			checkEntryPoint: 'EntryPoint v0.7',
			checkSafe: k('settingsModals.addNetwork.checkSafe'),
			checkSigner: k('settingsModals.addNetwork.checkSigner'),
			checkRemaining: k('settingsModals.addNetwork.checkRemaining')
		},
		rpcProviders: {
			description: k('settingsModals.rpcProviders.description'),
			getKey: k('settingsModals.rpcProviders.getKey'),
			checkKey: k('settingsModals.rpcProviders.checkKey'),
			notSet: k('settingsModals.rpcProviders.notSet'),
			connected: k('activity.connected'),
			supportsCount: k('settingsModals.rpcProviders.supportsCount'),
			avgLatency: k('settingsModals.rpcProviders.avgLatency')
		},
		endpoints: {
			description: k('settingsModals.endpoints.description'),
			chainDataLabel: k('settingsModals.endpoints.chainDataLabel'),
			chainDataHint: k('settingsModals.endpoints.chainDataHint'),
			passkeyLabel: k('settingsModals.endpoints.passkeyLabel'),
			passkeyHint: k('settingsModals.endpoints.passkeyHint'),
			bundlerLabel: k('settingsModals.endpoints.bundlerLabel'),
			bundlerHint: k('settingsModals.endpoints.bundlerHint'),
			fiatLabel: k('settingsModals.endpoints.fiatLabel'),
			fiatHint: k('settingsModals.endpoints.fiatHint'),
			reset: k('settingsModals.endpoints.resetToDefaults'),
			guide: k('settingsModals.endpoints.selfHostGuide')
		},
		storage: {
			title: k('settings.storage.title'),
			subtitle: k('settings.storage.subtitle'),
			summary: k('settings.storage.summary'),
			userData: k('settings.storage.userData'),
			caches: k('settings.storage.caches'),
			connections: k('settings.storage.connections'),
			legendUserData: k('settings.storage.legendUserData'),
			legendCaches: k('settings.storage.legendCaches'),
			legendSessions: k('settings.storage.legendSessions'),
			itemTransactions: k('settings.storage.itemTransactions'),
			itemContacts: k('settings.storage.itemContacts'),
			itemCustom: k('settings.storage.itemCustom'),
			itemBrowsing: k('settings.storage.itemBrowsing'),
			itemBalances: k('settings.storage.itemBalances'),
			itemRates: k('settings.storage.itemRates'),
			itemScan: k('settings.storage.itemScan'),
			itemDapps: k('settings.storage.itemDapps'),
			records: k('settings.storage.records'),
			contactsCount: k('settings.storage.contactsCount'),
			itemsCount: k('settings.storage.itemsCount'),
			sitesCount: k('settings.storage.sitesCount'),
			clear: k('settings.storage.clear'),
			clearAllCaches: k('settings.storage.clearAllCaches'),
			disconnectAll: k('settings.storage.disconnectAll'),
			clearTitle: k('settings.storage.clearTitle'),
			clearBody: k('settings.storage.clearBody'),
			clearConfirm: k('settings.storage.clearConfirm')
		},
		about: {
			title: k('settings.about.title'),
			subtitleTemplate: k('settings.about.subtitle'),
			tagline: k('about.tagline'),
			version: k('about.version'),
			sectionTechnical: k('about.sectionTechnical'),
			techWalletLabel: k('about.techWalletLabel'),
			techWalletValue: k('about.techWalletValue'),
			techAuthLabel: k('about.techAuthLabel'),
			techAuthValue: k('about.techAuthValue'),
			techAccountTypeLabel: k('about.techAccountTypeLabel'),
			techAccountTypeValue: k('about.techAccountTypeValue'),
			techSignerLabel: k('about.techSignerLabel'),
			techSignerValue: k('about.techSignerValue'),
			techNetworksLabel: k('about.techNetworksLabel'),
			techNetworksValue: k('about.techNetworksValue'),
			linkWebsite: k('about.linkWebsite'),
			linkGitHub: k('about.linkGitHub'),
			linkSafeWallet: k('about.linkSafeWallet'),
			sectionLinks: k('about.sectionLinks'),
			footer: k('about.footer')
		},
		accounts: {
			title: k('settingsModals.account.modalTitle'),
			total: k('settingsModals.account.total'),
			countPrefix: k('home.switcherAccountCount'),
			createNew: k('settingsModals.account.createNew'),
			signInExisting: k('settingsModals.account.signInExisting')
		},
		signOut: {
			button: k('settings.signOut.button'),
			title: k('settings.signOut.title'),
			desc: k('settings.signOut.desc'),
			keeps: k('settings.signOut.keeps'),
			warning: k('settings.signOut.warning'),
			anyway: k('settings.signOut.anyway'),
			cancel: k('settings.signOut.cancel')
		},
		erase: {
			title: k('settings.eraseDevice.title'),
			subtitle: k('settings.eraseDevice.subtitle'),
			desc: k('settings.eraseDevice.desc'),
			loses: k('settings.eraseDevice.loses'),
			keeps: k('settings.eraseDevice.keeps'),
			confirm: k('settings.eraseDevice.confirm'),
			cancel: k('settings.eraseDevice.cancel')
		},
		bugReport: {
			title: k('componentsUi.bugReport.title'),
			subtitle: k('componentsUi.bugReport.subtitle'),
			whatPlaceholder: k('componentsUi.bugReport.whatPlaceholder'),
			addSteps: k('componentsUi.bugReport.addSteps'),
			previewToggle: k('componentsUi.bugReport.previewToggle'),
			previewVersion: k('componentsUi.bugReport.previewVersion'),
			previewPlatform: k('componentsUi.bugReport.previewPlatform'),
			previewLanguage: k('componentsUi.bugReport.previewLanguage'),
			previewRpc: k('componentsUi.bugReport.previewRpc'),
			previewFailures: k('componentsUi.bugReport.previewFailures'),
			previewNone: k('componentsUi.bugReport.previewNone'),
			consent: k('componentsUi.bugReport.consent'),
			send: k('componentsUi.bugReport.send'),
			openGithubForm: k('componentsUi.bugReport.openGithubForm')
		},
		rescue: {
			rpcUnavailableSingle: k('assets.rpcUnavailableSingle'),
			rpcUnavailableMultiple: k('assets.rpcUnavailableMultiple'),
			rpcFix: k('assets.rpcFix'),
			rpcFixTitle: k('assets.rpcFixTitle'),
			rpcFixWarning: k('assets.rpcFixWarning'),
			rpcFixLabel: k('assets.rpcFixLabel'),
			rpcFixSaveBtn: k('assets.rpcFixSaveBtn'),
			rpcFixRestored: k('assets.rpcFixRestored'),
			rpcProvidersTitle: k('assets.rpcProvidersTitle'),
			rpcReport: k('assets.rpcReport')
		},
		balanceDetail: {
			title: k('home.balanceDetailTitle'),
			total: k('assets.switcherTotal'),
			networksLabel: k('home.balanceDetailNetworksLabel'),
			networksNote: k('home.balanceDetailNetworksNote'),
			statusRetrying: k('home.balanceDetailStatusRetrying'),
			statusFailed: k('home.balanceDetailStatusFailed'),
			updatedLabel: k('home.balanceDetailUpdatedLabel'),
			retry: k('home.balanceDetailRetry')
		},
		relayer: {
			title: k('componentsUi.treasuryBootstrap.title'),
			lead: k('componentsUi.treasuryBootstrap.lead'),
			amountHint: k('componentsUi.treasuryBootstrap.amountHint'),
			addressLabel: k('componentsUi.treasuryBootstrap.addressLabel'),
			disclaimer: k('componentsUi.treasuryBootstrap.disclaimer'),
			retryBtn: k('componentsUi.treasuryBootstrap.retryBtn'),
			copyBtn: k('componentsUi.treasuryBootstrap.copyBtn')
		},
		indexDown: {
			title: k('settings.indexDown.title'),
			subtitle: k('settings.indexDown.subtitle'),
			warning: k('onboarding.settings.warningText'),
			endpointLabel: k('onboarding.settings.endpointUrlLabel'),
			editEndpoint: k('settings.indexDown.editEndpoint'),
			passkeyHint: k('onboarding.settings.passkeyHint')
		},
		common: {
			cancel: k('common.cancel'),
			system: k('common.system'),
			automatic: k('common.automatic'),
			done: k('common.done'),
			tryAgain: k('common.tryAgain'),
			close: k('componentsUi.identiconViewer.close'),
			copyAddress: k('componentsUi.identiconViewer.copyAddress')
		},
		shell: {
			networksTitle: k('settingsModals.network.modalTitle'),
			commandBarPlaceholder: k('componentsUi.commandBar.placeholder'),
			allNetworks: k('componentsUi.networkFilter.allNetworks')
		},
		walletTitle: k('componentsUi.mainNav.wallet'),
		sendTitle: k('componentsUi.dock.send')
	};
}

/** Direct engine access for the differential test only. */
export function rawResolve(locale: Locale, key: string): string {
	activate(locale);
	return engine.t(key);
}
