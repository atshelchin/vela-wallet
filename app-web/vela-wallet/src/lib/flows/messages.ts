/**
 * Wallet-flow message manifest (spec 021).
 *
 * A flat `dotted key -> resolved template` map, the shape spec 014's onboarding
 * flow and spec 020's intro already use, rather than spec 015's nested
 * manifest. With ~120 strings across four journeys the nested form would be
 * more field declarations than copy, and every one of them would have to be
 * mirrored in `engine.server.ts` by hand.
 *
 * Resolution happens at build time in `engine.server.ts`; `{{var}}` fills
 * happen where the fixture knows the value, through spec 015's `fill`.
 */

/** Every corpus key the wallet-flow screens consume. Tests iterate this. */
export const WALLET_FLOW_KEYS = [
	// ---------------------------------------------------------------- chrome
	'receive.a11yBack',
	'componentsUi.identiconViewer.close',
	'componentsUi.identiconViewer.copyAddress',
	'componentsUi.networkFilter.pillAll',
	'componentsUi.dayGroup.today',
	'componentsUi.dayGroup.yesterday',
	'componentsUi.dock.send',

	// --------------------------------------------------------------- receive
	'receive.title',
	'receive.networksLine',
	'receive.searchNetworkPlaceholder',
	'receive.searchNetworkEmpty',
	'receive.qrTitleNetwork',
	'receive.qrTitleAsset',
	'receive.tokenContract',
	'receive.warningReminder',
	'receive.copied',
	'receive.request.saveImage',
	'receive.shareCardHeadline',
	'receive.shareCardNetworkNote',

	// ------------------------------------------------------------------ scan
	'componentsUi.scanner.title',
	'componentsUi.scanner.hint',
	'componentsUi.scanner.gallery',
	'componentsUi.scanner.fromGallery',
	'componentsUi.scanner.torch',
	'componentsUi.scanner.flipCamera',

	// -------------------------------------------------------------- activity
	'history.navTitle',
	'history.loadingText',
	'history.emptyFilter',
	'history.labelSent',
	'history.labelReceived',
	'history.txLabelSent',
	'history.txLabelReceived',
	'history.toName',
	'history.fromName',
	'history.viewOnExplorer',
	'componentsTx.receipt.statusConfirmed',
	'componentsTx.detail.from',
	'componentsTx.detail.to',
	'componentsTx.detail.labelChain',
	'componentsTx.detail.labelDate',
	'componentsTx.detail.labelHash',
	'componentsTx.detail.sectionTitle',

	// ---------------------------------------------------------------- assets
	'assets.sectionTitle',
	'assets.addToken',
	'assets.searchPlaceholder',
	'assets.addByAddress',
	'assets.emptyTitle',
	'assets.emptySubtext',
	'assets.notShowingTitle',
	'assets.notShowingBody',
	'tokenDetail.send',
	'tokenDetail.receive',
	'tokenDetail.labelPrice',
	'tokenDetail.priceValue',
	'tokenDetail.labelContract',
	'tokenDetail.labelDecimals',
	'tokenDetail.labelTransactions',
	'tokenDetail.viewOnExplorer',

	// ------------------------------------------------------------- add token
	'addToken.navTitle',
	'addToken.tabErc20',
	'addToken.tabNative',
	'addToken.labelNetwork',
	'addToken.tokenAddressLabel',
	'addToken.addToWalletBtn',
	'addToken.tokenAdded',
	'addToken.invalidAddress',
	'addToken.notFoundTitle',
	'addToken.notFoundMessage',
	'addToken.netSearchLabel',
	'addToken.netSearchPlaceholder',
	'addToken.netPickerEmpty',
	'addToken.netPickerSearchPlaceholder',
	'addToken.labelChainId',
	'addToken.labelNativeToken',
	'addToken.compatible',
	'addToken.notCompatible',
	'addToken.networkAdded',
	'addToken.addNetworkBtn',
	'addToken.deployContracts',
	'addToken.errorNotCompatible',

	// ------------------------------------------------------------------ send
	'send.selectTokenTitle',
	'send.searchPlaceholder',
	'history.filterAll',
	'send.filterStable',
	'send.filterGas',
	'send.filterOther',
	'send.multiSendTitle',
	'send.multiSendSummary',
	'send.multiSendChainNotice',
	'send.multiSendSameRecipient',
	'send.multiSendContinue',
	'send.selectAllValuable',
	'send.sendTitle',
	'send.maxBtn',
	'send.balanceLabel',
	'send.recipientLabel',
	'send.recipientN',
	'send.recipientCount_other',
	'send.addRecipient',
	'send.fromContacts',
	'send.batchImport',
	'send.removeRecipient',
	'send.recipientPickAria',
	'send.scanAria',
	'send.splitTotalLabel',
	'send.continueBtn',
	'componentsUi.gas.networkFee',

	// send · fee token
	'send.feeTokenLabel',
	'send.feeTokenHint',
	'send.feeTokenEstimate',

	// send · contact picker
	'send.pickContactTitle',
	'send.pickContactSearch',
	'send.scanToFill',
	'contacts.sectionGroups',
	'contacts.title',
	'contacts.groupMembers',

	// send · batch import
	'send.batchTitle',
	'send.batchUnitFiat',
	'send.batchUnitToken',
	'send.batchPastePlaceholder',
	'send.batchImportFile',
	'send.batchTemplate',
	'send.batchRateSection',
	'send.batchRateLabel',
	'send.batchRateHint',
	'send.batchParsedCount',
	'send.batchBadAddress',
	'send.batchRejected_one',
	'send.batchApply_other',

	// send · confirm
	'send.confirmTitle',
	'send.fromLabel',
	'send.toLabel',
	'send.estFeeLabel',
	'send.confirmSendBtn',
	'send.confirmTotalLine',
	'componentsTx.receipt.assetsCount',

	// send · receipt
	'send.txSubmitting',
	'send.txPreparingBiometric',
	'send.txBackgroundHint',
	'send.txCloseBackground',
	'send.txSubmittedTitle',
	'send.txConfirmedTitle',
	'send.txWaitingConfirm',
	'send.txTypicalTime',
	'componentsTx.receipt.txHash',
	'componentsTx.receipt.done'
] as const;

export type WalletFlowKey = (typeof WALLET_FLOW_KEYS)[number];

/** Resolved templates, keyed by corpus path. */
export type WalletFlowMessages = Readonly<Record<WalletFlowKey, string>>;
