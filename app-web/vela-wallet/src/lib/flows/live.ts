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
import type { CurrencyView } from '$lib/core/generated/CurrencyView';
import { liveAssetRow } from '$lib/wallet/live';
import type { WalletMessages } from '$lib/wallet/messages';
import type { AssetsModel, DesktopFlowModel, FlowScreenModel } from './model';

export interface FlowsLiveInputs {
	balance: BalanceView;
	currency: CurrencyView;
	m: WalletMessages;
	/** The fixture T4 body, for the empty state's corpus copy. */
	emptyCopy: AssetsModel['empty'];
}

function liveAssets(model: AssetsModel, inputs: FlowsLiveInputs): AssetsModel {
	const { balance: view, currency, m } = inputs;
	const rows = view.tokens.map((t) => liveAssetRow(t, currency, m, view.hidden));
	// Empty only once the core has actually looked (never while unknown/loading).
	const settledEmpty = rows.length === 0 && !view.balance_unknown && !view.holdings_loading;
	return { ...model, rows, empty: settledEmpty ? inputs.emptyCopy : undefined };
}

/** A mobile flow screen with its assets body live; other bodies untouched. */
export function withLiveFlow(model: FlowScreenModel, inputs: FlowsLiveInputs): FlowScreenModel {
	if (model.base.kind !== 'assets') return model;
	return { ...model, base: { kind: 'assets', model: liveAssets(model.base.model, inputs) } };
}

/** The desktop third-column shape of the same overlay. */
export function withLiveDesktopFlow(
	model: DesktopFlowModel,
	inputs: FlowsLiveInputs
): DesktopFlowModel {
	if (model.body.kind !== 'assets') return model;
	return { ...model, body: { kind: 'assets', model: liveAssets(model.body.model, inputs) } };
}
