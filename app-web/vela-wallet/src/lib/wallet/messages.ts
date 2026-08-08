/**
 * Wallet-home message manifest (spec 015, research.md D3).
 *
 * Every string the wallet screens render, keyed into the vela-core corpus.
 * Client-safe: names keys and shapes only — resolution happens in
 * `engine.server.ts` at build time, exactly like the Welcome page.
 * Templated values (`{{name}}`, `{{count}}`…) are resolved server-side too:
 * fixtures are static, so every interpolation is known at prerender time.
 */

export interface WalletMessages {
	nav: { wallet: string; contacts: string; explore: string; settings: string };
	balance: {
		totalLabel: string;
		liveIndicator: string;
		stale: string;
		unpriced: string;
		noPrice: string;
		a11yHide: string;
		a11yShow: string;
	};
	actions: { receive: string; send: string; scan: string };
	sections: { activity: string; assets: string; all: string; add: string };
	activity: {
		sent: string;
		received: string;
		dapp: string;
		today: string;
		yesterday: string;
		/** Template with `{{name}}`. */
		toName: string;
		/** Template with `{{name}}`. */
		fromName: string;
		emptyTitle: string;
		emptyCaption: string;
	};
	assets: { emptyTitle: string; emptyCaption: string };
	networkFilter: { pillAll: string; sheetTitle: string; allNetworks: string };
	sidebar: { networks: string; searchPlaceholder: string };
	receive: {
		title: string;
		addressLabel: string;
		copyAddress: string;
		qrCaption: string;
		warningTitle: string;
		warningReminder: string;
		/** Template with `{{count}}`. */
		networksLine: string;
		/** Template with `{{name}}` and `{{id}}`. */
		networkDetail: string;
	};
	assetDetail: {
		send: string;
		receive: string;
		labelName: string;
		labelPrice: string;
		/** Template with `{{symbol}}` and `{{value}}`. */
		priceValue: string;
		labelContract: string;
		labelDecimals: string;
		labelTransactions: string;
		viewOnExplorer: string;
		nativeToken: string;
	};
	close: string;
}

/** Every corpus key the wallet screens consume (tests iterate this). */
export const WALLET_KEYS = [
	'componentsUi.mainNav.wallet',
	'componentsUi.mainNav.contacts',
	'componentsUi.mainNav.explore',
	'componentsUi.mainNav.settings',
	'home.totalBalance',
	'home.liveIndicator',
	'home.balanceStale',
	'home.balanceUnpriced',
	'home.balanceDetailNoPrice',
	'home.a11yHideBalance',
	'home.a11yShowBalance',
	'componentsUi.dock.receive',
	'componentsUi.dock.send',
	'componentsUi.dock.scan',
	'home.tabActivity',
	'assets.sectionTitle',
	'history.filterAll',
	'assets.addToken',
	'history.labelSent',
	'history.labelReceived',
	'history.txLabelDappTx',
	'componentsUi.dayGroup.today',
	'componentsUi.dayGroup.yesterday',
	'history.toName',
	'history.fromName',
	'home.emptyNoActivity',
	'home.emptySubtitle',
	'assets.emptyTitle',
	'assets.emptySubtext',
	'componentsUi.networkFilter.pillAll',
	'componentsUi.networkFilter.selectChain',
	'componentsUi.networkFilter.allNetworks',
	'settingsModals.network.modalTitle',
	'componentsUi.commandBar.placeholder',
	'receive.title',
	'receive.addressLabel',
	'componentsUi.identiconViewer.copyAddress',
	'componentsUi.qrPlaceholder.caption',
	'receive.warningTitle',
	'receive.warningReminder',
	'receive.networksLine',
	'receive.networkDetail',
	'tokenDetail.send',
	'tokenDetail.receive',
	'tokenDetail.labelName',
	'tokenDetail.labelPrice',
	'tokenDetail.priceValue',
	'tokenDetail.labelContract',
	'tokenDetail.labelDecimals',
	'tokenDetail.labelTransactions',
	'tokenDetail.viewOnExplorer',
	'addToken.labelNativeToken',
	'componentsUi.identiconViewer.close'
] as const;

/**
 * `{{var}}` interpolation for the handful of templated wallet strings.
 * Build-time only, over corpus-linted templates with known vars — not a
 * parallel i18n engine (spec 015 research.md D3).
 */
export function fill(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
		name in vars ? String(vars[name]) : match
	);
}
