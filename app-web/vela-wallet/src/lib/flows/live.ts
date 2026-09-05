/**
 * Live overlays for the pushed flow screens (spec 025 Phase 3 — the assets
 * screen; Phase 4 adds receive/activity). Siblings of `fixtures.ts`: the
 * gallery states keep their canon, the live route swaps the money.
 *
 * The assets list is the SAME holdings the home shows, so it is the same
 * builder (`liveAssetRow`) — one rule for what a held token looks like. The
 * empty body's copy comes from the fixture layer's own empty state (T4): the
 * words are the corpus's either way, and borrowing the built block avoids a
 * second builder for four strings.
 */

import type { BalanceView } from '$lib/core/generated/BalanceView';
import type { FeedView } from '$lib/core/generated/FeedView';
import type { CurrencyView } from '$lib/core/generated/CurrencyView';
import type { MtokView } from '$lib/core/generated/MtokView';
import type { WalletFlowMessages } from './messages';
import { getAllNetworksSync, nativeSymbol } from '$lib/services/networks';
import { chainColor } from '$lib/wallet/fixtures';
import type { ShareCardModel } from './model';
import type { WalletIdentity } from '$lib/wallet/identity';
import { shortenAddress } from '$lib/wallet/identity';
import { encodeQr } from '$lib/wallet/qr';
import { liveActivityGroups, liveAssetRow } from '$lib/wallet/live';
import { addressLines } from './fixtures';
import { liveBatchImport, type BatchLiveInputs } from './live-batch';
import { liveContactPick, type ContactPickLiveInputs } from './live-contact-pick';
import {
	liveFeeTokenPick,
	liveSendConfirm,
	liveSendForm,
	liveSendPick,
	liveSendReceipt,
	type SendLiveInputs
} from './live-send';
import type { WalletMessages } from '$lib/wallet/messages';
import type {
	AddTokenModel,
	AssetsModel,
	DesktopFlowModel,
	FlowScreenModel,
	HistoryModel,
	ReceiveListModel,
	ReceiveQrModel
} from './model';

export interface FlowsLiveInputs {
	balance: BalanceView;
	currency: CurrencyView;
	m: WalletMessages;
	/** The fixture T4 body, for the empty state's corpus copy. */
	emptyCopy: AssetsModel['empty'];
	/** Phase 4: the feed (history screen) and the person (receive card). */
	feed?: FeedView | null;
	identity?: WalletIdentity;
	/**
	 * The live send flow (spec 026). Present only while a send session exists —
	 * absent, every send screen stays the picture 021 drew, which is what the
	 * gallery renders.
	 */
	send?: SendLiveInputs;
	/** The batch importer, while its sheet is open (spec 026 US3). */
	batch?: BatchLiveInputs;
	/**
	 * The address book, for the recipient picker (spec 028 US5). Present while
	 * a send is open; absent, the picker stays the gallery's picture.
	 */
	contactPick?: ContactPickLiveInputs;
	/**
	 * The `manage_tokens` core's view while the add-token sheet is open (spec
	 * 028 US4), with the flat flow corpus beside it — the same shape `batch`
	 * rides in, because this file's own `m` is the wallet home's nested map.
	 */
	addToken?: AddTokenLiveInputs;
}

function liveAssets(model: AssetsModel, inputs: FlowsLiveInputs): AssetsModel {
	const { balance: view, currency, m } = inputs;
	const rows = view.tokens.map((t) => liveAssetRow(t, currency, m, view.hidden));
	// Empty only once the core has actually looked (never while unknown/loading).
	const settledEmpty = rows.length === 0 && !view.balance_unknown && !view.holdings_loading;
	return { ...model, rows, empty: settledEmpty ? inputs.emptyCopy : undefined };
}

function liveHistory(model: HistoryModel, inputs: FlowsLiveInputs): HistoryModel {
	const { feed, balance: view, m } = inputs;
	if (!feed) return { ...model, mode: 'loading', groups: [] };
	const groups = liveActivityGroups(feed, m, view.hidden);
	return {
		...model,
		mode: groups.length > 0 ? 'rows' : view.balance_unknown ? 'loading' : 'empty',
		groups
	};
}

/** The receive list: every network the wallet knows, all with THE address. */
function liveReceiveList(model: ReceiveListModel, inputs: FlowsLiveInputs): ReceiveListModel {
	const identity = inputs.identity;
	if (identity === undefined) return model;
	const template = model.rows[0];
	return {
		...model,
		rows: getAllNetworksSync().map((n) => ({
			name: n.displayName,
			code: nativeSymbol(n.chainId),
			badgeColor: chainColor(n.chainId),
			addressDisplay: shortenAddress(identity.address),
			copyLabel: template?.copyLabel ?? '',
			qrLabel: template?.qrLabel ?? ''
		}))
	};
}

/** The QR sheet's account card is the person's; the network mark stays the
 *  list's first row until the tapped index rides the flow stack (recorded). */
function liveReceiveQr(model: ReceiveQrModel, inputs: FlowsLiveInputs): ReceiveQrModel {
	const identity = inputs.identity;
	if (identity === undefined) return model;
	return {
		...model,
		// The code is the ADDRESS, encoded (spec 028 T411). Until now this screen
		// drew 021's placeholder pattern, which never encoded anything — a person
		// showed it to a friend and no money arrived.
		code: encodeQr(identity.address),
		account: {
			...model.account,
			name: identity.name,
			identiconSvg: identity.identiconSvg,
			lines: addressLines(identity.address)
		}
	};
}

/**
 * The share card (spec 028 T413) — the image someone hands to a stranger.
 *
 * Three things ride together on purpose, and the third is the reason: the
 * address in readable text, so a person can check it without a scanner; the
 * code, so a camera can; and the account's own identicon, which is DERIVED from
 * the address. A card someone doctored to swap the address carries artwork that
 * no longer matches it — the mismatch is the tell.
 */
function liveShareCard(model: ShareCardModel, inputs: FlowsLiveInputs): ShareCardModel {
	const identity = inputs.identity;
	if (identity === undefined) return model;
	return {
		...model,
		code: encodeQr(identity.address),
		name: identity.name,
		lines: addressLines(identity.address),
		identiconSvg: identity.identiconSvg
	};
}

/**
 * T3 — adding a token by contract address (spec 028 T442).
 *
 * The drawn sheet has one field, one result card and one CTA, and every state
 * T5 draws is a variant of those. Here each is the `manage_tokens` core's
 * projection: validity is `address_valid`, the probe is `detecting`, the card
 * is the first chain that answered with an identity (`found`, registry order),
 * and "added" is the core's own dedupe verdict against what is stored. The
 * shell words it and nothing more.
 *
 * Two things the mock draws are not here yet, and are recorded rather than
 * improvised: the network picker (the core probes EVERY known chain at once
 * and the card names the one that answered, so a picker would be choosing
 * what the core already found), and the native-token tab (that is
 * `network_admin`'s, and it lives in Settings).
 */
export interface AddTokenLiveInputs {
	view: MtokView;
	m: WalletFlowMessages;
}

export function liveAddToken(model: AddTokenModel, inputs: AddTokenLiveInputs): AddTokenModel {
	const { view, m } = inputs;
	const first = view.found[0];
	const typed = view.input_address.trim() !== '';
	const result: AddTokenModel['result'] = view.detecting
		? { kind: 'searching', text: m['addToken.searchingNetworks'] }
		: first !== undefined
			? {
					kind: 'token',
					mark: { ticker: first.symbol, badgeColor: chainColor(first.chain_id) },
					name: first.name,
					detail: `${first.symbol} · ${m['tokenDetail.labelDecimals']} ${first.decimals} · ${first.network_name}`,
					chip: first.added ? { text: m['addToken.tokenAdded'], tone: 'success' } : undefined
				}
			: view.not_found
				? {
						kind: 'not-found',
						text: `${m['addToken.notFoundTitle']} — ${m['addToken.notFoundMessage']}`
					}
				: { kind: 'none' };
	return {
		...model,
		tab: 'erc20',
		network: undefined,
		fieldValue: view.input_address,
		fieldError: view.save_error
			? m['addToken.errorSaveToken']
			: typed && !view.address_valid
				? m['addToken.invalidAddress']
				: undefined,
		result,
		cta: m['addToken.addToWalletBtn'],
		ctaDisabled: first === undefined || first.added || view.saving
	};
}

/** A mobile flow screen with its live bodies swapped in; others untouched. */
export function withLiveFlow(model: FlowScreenModel, inputs: FlowsLiveInputs): FlowScreenModel {
	let next = model;
	if (model.base.kind === 'assets') {
		next = { ...next, base: { kind: 'assets', model: liveAssets(model.base.model, inputs) } };
	} else if (model.base.kind === 'history') {
		next = { ...next, base: { kind: 'history', model: liveHistory(model.base.model, inputs) } };
	} else if (model.base.kind === 'share-card') {
		next = {
			...next,
			base: { kind: 'share-card', model: liveShareCard(model.base.model, inputs) }
		};
	} else if (model.base.kind === 'receive-list') {
		next = {
			...next,
			base: { kind: 'receive-list', model: liveReceiveList(model.base.model, inputs) }
		};
	}
	if (model.sheet?.kind === 'receive-qr') {
		next = {
			...next,
			sheet: { kind: 'receive-qr', model: liveReceiveQr(model.sheet.model, inputs) }
		};
	}
	const send = inputs.send;
	if (send) {
		if (model.base.kind === 'send-pick') {
			next = { ...next, base: { kind: 'send-pick', model: liveSendPick(model.base.model, send) } };
		} else if (model.base.kind === 'send-form') {
			next = { ...next, base: { kind: 'send-form', model: liveSendForm(model.base.model, send) } };
		} else if (model.base.kind === 'send-confirm') {
			next = {
				...next,
				base: { kind: 'send-confirm', model: liveSendConfirm(model.base.model, send) }
			};
		} else if (model.base.kind === 'send-receipt') {
			next = {
				...next,
				base: { kind: 'send-receipt', model: liveSendReceipt(model.base.model, send) }
			};
		}
		if (model.sheet?.kind === 'fee-token') {
			next = {
				...next,
				sheet: { kind: 'fee-token', model: liveFeeTokenPick(model.sheet.model, send) }
			};
		}
	}
	if (inputs.batch && model.sheet?.kind === 'batch-import') {
		next = {
			...next,
			sheet: { kind: 'batch-import', model: liveBatchImport(model.sheet.model, inputs.batch) }
		};
	}
	if (inputs.contactPick && model.sheet?.kind === 'contact-pick') {
		next = {
			...next,
			sheet: {
				kind: 'contact-pick',
				model: liveContactPick(model.sheet.model, inputs.contactPick)
			}
		};
	}
	if (inputs.addToken && model.sheet?.kind === 'add-token') {
		next = {
			...next,
			sheet: { kind: 'add-token', model: liveAddToken(model.sheet.model, inputs.addToken) }
		};
	}
	return next;
}

/** The desktop third-column shape of the same overlay. */
export function withLiveDesktopFlow(
	model: DesktopFlowModel,
	inputs: FlowsLiveInputs
): DesktopFlowModel {
	switch (model.body.kind) {
		case 'assets':
			return { ...model, body: { kind: 'assets', model: liveAssets(model.body.model, inputs) } };
		case 'history':
			return { ...model, body: { kind: 'history', model: liveHistory(model.body.model, inputs) } };
		case 'receive-list':
			return {
				...model,
				body: { kind: 'receive-list', model: liveReceiveList(model.body.model, inputs) }
			};
		case 'receive-qr':
			return {
				...model,
				body: { kind: 'receive-qr', model: liveReceiveQr(model.body.model, inputs) }
			};
		case 'send-pick':
			return inputs.send
				? {
						...model,
						body: { kind: 'send-pick', model: liveSendPick(model.body.model, inputs.send) }
					}
				: model;
		case 'send-form':
			return inputs.send
				? {
						...model,
						body: { kind: 'send-form', model: liveSendForm(model.body.model, inputs.send) }
					}
				: model;
		case 'send-confirm':
			return inputs.send
				? {
						...model,
						body: { kind: 'send-confirm', model: liveSendConfirm(model.body.model, inputs.send) }
					}
				: model;
		case 'send-receipt':
			return inputs.send
				? {
						...model,
						body: { kind: 'send-receipt', model: liveSendReceipt(model.body.model, inputs.send) }
					}
				: model;
		case 'fee-token':
			return inputs.send
				? {
						...model,
						body: { kind: 'fee-token', model: liveFeeTokenPick(model.body.model, inputs.send) }
					}
				: model;
		case 'add-token':
			return inputs.addToken
				? {
						...model,
						body: { kind: 'add-token', model: liveAddToken(model.body.model, inputs.addToken) }
					}
				: model;
		case 'contact-pick':
			return inputs.contactPick
				? {
						...model,
						body: {
							kind: 'contact-pick',
							model: liveContactPick(model.body.model, inputs.contactPick)
						}
					}
				: model;
		default:
			return model;
	}
}
