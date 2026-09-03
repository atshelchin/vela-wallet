/**
 * The live wallet-home builders (spec 025 T123, research D10): the core's
 * `BalanceView` + the committed display-currency pair → the display models
 * the drawn components already consume. Siblings of the fixture builders,
 * applied as overlays over an identity-filled base (the settings precedent).
 *
 * NO arithmetic decides anything here. The total is the core's
 * `display_total_usd` (already the aggregation, already withheld while
 * hidden — invariant ⑧); the per-row fiat is the same balance × price the
 * core sorts by. What this file adds is presentation: currency conversion at
 * the committed rate (or the honest USD figure when there is no rate — 024's
 * rule), grouping digits, trimming a balance's tail, choosing which drawn
 * state a view maps to.
 *
 * Activity rows are the core's (grouped, folded, tombstoned); the shell words
 * the day headers and formats the amounts.
 */

import type { BalanceToken } from '$lib/core/generated/BalanceToken';
import type { BalanceView } from '$lib/core/generated/BalanceView';
import type { CurrencyView } from '$lib/core/generated/CurrencyView';
import type { FeedItem } from '$lib/core/generated/FeedItem';
import type { FeedView } from '$lib/core/generated/FeedView';
import { chainName } from '$lib/services/networks';
import { shortenAddress } from './identity';
import { fill } from './messages';
import { currencyGlyph } from '$lib/settings/fixtures';
import { BALANCE_MASK, chainColor, MASK } from './fixtures';
import type { WalletMessages } from './messages';
import type {
	ActivityGroupModel,
	ActivityRowModel,
	AssetRowModel,
	BalanceModel,
	SectionModel,
	WalletDesktopModel,
	WalletHomeModel
} from './model';

export interface WalletLiveInputs {
	balance: BalanceView;
	currency: CurrencyView;
	m: WalletMessages;
	/** The feed, once Phase 4 boots it; `null` keeps the section a skeleton. */
	feed?: FeedView | null;
	/** For date headers older than yesterday — a presentation preset. */
	locale?: string;
}

// ---------------------------------------------------------------------------
// Money presentation
// ---------------------------------------------------------------------------

/**
 * A USD amount in the display currency: converted at the committed rate, or
 * the USD figure itself when the shell could not price the currency —
 * `rate: null` is NOT 1 (024's rule; a defaulted 1 under a ¥ is a lie).
 */
export function moneyParts(
	usd: number,
	currency: CurrencyView
): { code: string; glyph: string; integer: string; decimals: string } {
	const convertible = currency.rate !== null;
	const code = convertible ? currency.code : 'USD';
	const amount = convertible ? usd * (currency.rate as number) : usd;
	const fixed = Math.abs(amount).toFixed(2);
	const [whole, frac] = fixed.split('.');
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const glyph = currencyGlyph(code);
	return { code, glyph, integer: `${glyph}${grouped}`, decimals: frac };
}

export function moneyText(usd: number, currency: CurrencyView): string {
	const parts = moneyParts(usd, currency);
	return `${parts.integer}.${parts.decimals}`;
}

/** A human decimal balance, tail trimmed — the number is the core's. */
export function trimBalance(balance: string, maxDecimals = 6): string {
	if (!balance.includes('.')) return balance;
	const [whole, frac] = balance.split('.');
	const cut = frac.slice(0, maxDecimals).replace(/0+$/, '');
	return cut === '' ? whole : `${whole}.${cut}`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function liveBalance(
	view: BalanceView,
	currency: CurrencyView,
	m: WalletMessages
): BalanceModel {
	const base = {
		label: m.balance.totalLabel,
		a11yHide: m.balance.a11yHide,
		a11yShow: m.balance.a11yShow
	};

	if (view.hidden) {
		return {
			...base,
			currency: currency.rate !== null ? currency.code : 'USD',
			state: 'hidden',
			integer: BALANCE_MASK
		};
	}

	// The core withholds the display total while the skeleton shows; the
	// last-known cached total paints first, live replaces it (max(live,cached)
	// is the core's rule — this only chooses what to show meanwhile).
	const total = view.display_total_usd ?? view.cached_total_usd;
	if (total === null) {
		return { ...base, currency: currency.rate !== null ? currency.code : 'USD', state: 'loading' };
	}

	const parts = moneyParts(total, currency);
	const zeroLive = total === 0 && !view.balance_unknown && view.tokens.length === 0;
	const onCache = view.display_total_usd === null && view.cached_total_usd !== null;

	const status: BalanceModel['status'] =
		view.refreshing || onCache || view.notice === 'still_updating'
			? { kind: 'refreshing', text: m.balance.stale }
			: view.notice === 'unpriced'
				? { kind: 'warning', text: m.balance.unpriced }
				: undefined;

	return {
		...base,
		currency: parts.code,
		state: zeroLive ? 'zero-live' : 'normal',
		integer: parts.integer,
		decimals: parts.decimals,
		liveText: zeroLive ? m.balance.liveIndicator : undefined,
		status
	};
}

export function liveAssetRow(
	token: BalanceToken,
	currency: CurrencyView,
	m: WalletMessages,
	hidden: boolean
): AssetRowModel {
	const fiat: AssetRowModel['fiat'] = hidden
		? { kind: 'masked' }
		: token.price_usd === null
			? { kind: 'no-price', text: m.balance.noPrice }
			: {
					kind: 'value',
					text: moneyText((parseFloat(token.balance) || 0) * token.price_usd, currency)
				};
	return {
		ticker: token.symbol,
		chain: chainName(token.chain_id),
		badgeColor: chainColor(token.chain_id),
		balance: hidden ? MASK : trimBalance(token.balance),
		fiat,
		masked: hidden
	};
}

function assetsMode(view: BalanceView): SectionModel['mode'] {
	if (view.tokens.length > 0) return 'rows';
	// Nothing held yet — a skeleton while the first fetch is out, an empty
	// state once the core has actually looked.
	return view.holdings_loading || view.balance_unknown ? 'loading' : 'empty';
}

// ---------------------------------------------------------------------------
// Activity — the core's grouped rows, worded and formatted here
// ---------------------------------------------------------------------------

function localMidnight(ms: number): number {
	const d = new Date(ms);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today" / "Yesterday" from the corpus; older days as a short date. */
export function dayLabel(
	dayStartMs: number,
	m: WalletMessages,
	locale = 'en',
	now = Date.now()
): string {
	const today = localMidnight(now);
	if (dayStartMs === today) return m.activity.today;
	if (dayStartMs === today - 86_400_000) return m.activity.yesterday;
	return new Date(dayStartMs).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function liveActivityRow(
	item: FeedItem,
	m: WalletMessages,
	hidden: boolean
): ActivityRowModel {
	const received = item.direction === 'in';
	const kind: ActivityRowModel['kind'] = received
		? 'received'
		: item.direction === 'out'
			? 'sent'
			: 'dapp';
	const who = item.alias ?? (item.counterparty !== null ? shortenAddress(item.counterparty) : null);
	const subtitle =
		who === null
			? chainName(item.chain_id)
			: fill(received ? m.activity.fromName : m.activity.toName, { name: who });
	const amount =
		item.value === null
			? String(item.batch?.count ?? '')
			: `${received ? '+' : '-'}${trimBalance(item.value)}`;
	return {
		kind,
		title:
			kind === 'received'
				? m.activity.received
				: kind === 'sent'
					? m.activity.sent
					: m.activity.dapp,
		subtitle,
		amount: hidden ? MASK : amount,
		unit: item.symbol,
		positive: received,
		masked: hidden,
		badgeColor: chainColor(item.chain_id)
	};
}

/** The core emits headers and items already interleaved (invariant ⑥). */
export function liveActivityGroups(
	view: FeedView,
	m: WalletMessages,
	hidden: boolean,
	locale = 'en'
): ActivityGroupModel[] {
	const groups: ActivityGroupModel[] = [];
	for (const row of view.rows) {
		if (row.type === 'header') {
			groups.push({ label: dayLabel(row.day_start_ms, m, locale), rows: [] });
			continue;
		}
		const last = groups.at(-1);
		const model = liveActivityRow(row.item, m, hidden);
		if (last === undefined) groups.push({ label: '', rows: [model] });
		else last.rows.push(model);
	}
	return groups;
}

/**
 * The feed has no "loaded" flag (an empty store and a pristine view are the
 * same rows). The store read lands in milliseconds while the balance fetch
 * takes seconds, so "the balance has looked" is a safe proxy for "the feed
 * has looked" — a presentation choice, recorded as such.
 */
function activityMode(view: BalanceView, feed: FeedView | null | undefined): SectionModel['mode'] {
	if (!feed) return 'loading';
	if (feed.rows.length > 0) return 'rows';
	return view.balance_unknown ? 'loading' : 'empty';
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

/** Live balance + holdings over an identity-filled home model. */
export function withLiveWallet(model: WalletHomeModel, inputs: WalletLiveInputs): WalletHomeModel {
	const { balance: view, currency, m } = inputs;
	return {
		...model,
		balance: liveBalance(view, currency, m),
		assetsSection: { ...model.assetsSection, mode: assetsMode(view) },
		assetRows: view.tokens.map((t) => liveAssetRow(t, currency, m, view.hidden)),
		activitySection: { ...model.activitySection, mode: activityMode(view, inputs.feed) },
		activityGroups: inputs.feed
			? liveActivityGroups(inputs.feed, m, view.hidden, inputs.locale)
			: []
	};
}

/** The desktop shape of the same overlay. */
export function withLiveWalletDesktop(
	model: WalletDesktopModel,
	inputs: WalletLiveInputs
): WalletDesktopModel {
	const { balance: view, currency, m } = inputs;
	return {
		...model,
		balance: liveBalance(view, currency, m),
		assetsSection: { ...model.assetsSection, mode: assetsMode(view) },
		assetRows: view.tokens.map((t) => liveAssetRow(t, currency, m, view.hidden)),
		activitySection: { ...model.activitySection, mode: activityMode(view, inputs.feed) },
		activityGroups: inputs.feed
			? liveActivityGroups(inputs.feed, m, view.hidden, inputs.locale)
			: []
	};
}
