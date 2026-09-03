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
import { getAllNetworksSync, nativeSymbol } from '$lib/services/networks';
import { chainColor } from '$lib/wallet/fixtures';
import type { WalletIdentity } from '$lib/wallet/identity';
import { shortenAddress } from '$lib/wallet/identity';
import { liveActivityGroups, liveAssetRow } from '$lib/wallet/live';
import { addressLines } from './fixtures';
import type { WalletMessages } from '$lib/wallet/messages';
import type {
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
	locale?: string;
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
	const groups = liveActivityGroups(feed, m, view.hidden, inputs.locale);
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
		account: {
			...model.account,
			name: identity.name,
			identiconSvg: identity.identiconSvg,
			lines: addressLines(identity.address)
		}
	};
}

/** A mobile flow screen with its live bodies swapped in; others untouched. */
export function withLiveFlow(model: FlowScreenModel, inputs: FlowsLiveInputs): FlowScreenModel {
	let next = model;
	if (model.base.kind === 'assets') {
		next = { ...next, base: { kind: 'assets', model: liveAssets(model.base.model, inputs) } };
	} else if (model.base.kind === 'history') {
		next = { ...next, base: { kind: 'history', model: liveHistory(model.base.model, inputs) } };
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
		default:
			return model;
	}
}
