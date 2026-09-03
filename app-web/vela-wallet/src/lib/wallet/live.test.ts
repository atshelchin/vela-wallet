/**
 * The live wallet-home builders (spec 025 T125): BalanceView + currency pair
 * → the drawn models. Presentation only — the numbers are the core's.
 */
import { describe, expect, it } from 'vitest';
import type { BalanceView } from '$lib/core/generated/BalanceView';
import type { CurrencyView } from '$lib/core/generated/CurrencyView';
import { resolveWalletMessages } from '$lib/i18n/engine.server';
import { buildMobileState } from './fixtures';
import { liveAssetRow, liveBalance, moneyParts, trimBalance, withLiveWallet } from './live';

const m = resolveWalletMessages('en');
const USD: CurrencyView = { code: 'USD', rate: 1, committed: true };
const EUR: CurrencyView = { code: 'EUR', rate: 0.5, committed: true };
const UNPRICED_JPY: CurrencyView = { code: 'JPY', rate: null, committed: true };

const PRISTINE: BalanceView = {
	address: null,
	display_total_usd: null,
	balance_unknown: true,
	balance_partial: false,
	notice: null,
	hidden: false,
	refreshing: false,
	last_refreshed_at_ms: null,
	tokens: [],
	unpriced_tokens: [],
	failed_chain_ids: [],
	rate_limited_chain_ids: [],
	banner_chain_ids: [],
	holdings_loading: false,
	cached_total_usd: null,
	switcher: { open: false, loading: false, balances: [] }
};

const ETH = {
	chain_id: 1,
	symbol: 'ETH',
	name: 'Ether',
	balance: '1.500000000000000000',
	decimals: 18,
	token_address: null,
	price_usd: 3000,
	spam: false
};

describe('moneyParts', () => {
	it('groups digits and splits the cents', () => {
		expect(moneyParts(4500, USD)).toMatchObject({ code: 'USD', integer: '$4,500', decimals: '00' });
		expect(moneyParts(1383.28, USD)).toMatchObject({ integer: '$1,383', decimals: '28' });
	});
	it('converts at the committed rate', () => {
		expect(moneyParts(4500, EUR)).toMatchObject({ code: 'EUR', integer: '€2,250' });
	});
	it('a null rate shows the USD figure, never a defaulted 1 under a ¥ (024 rule)', () => {
		expect(moneyParts(4500, UNPRICED_JPY)).toMatchObject({ code: 'USD', integer: '$4,500' });
	});
});

describe('trimBalance', () => {
	it('trims the tail without touching the number', () => {
		expect(trimBalance('1.500000000000000000')).toBe('1.5');
		expect(trimBalance('0')).toBe('0');
		expect(trimBalance('12.3456789')).toBe('12.345678');
	});
});

describe('liveBalance', () => {
	it('the pristine view is a skeleton — never a fake $0', () => {
		expect(liveBalance(PRISTINE, USD, m).state).toBe('loading');
	});
	it('hidden withholds the figure with the mask', () => {
		const model = liveBalance({ ...PRISTINE, hidden: true, display_total_usd: 4500 }, USD, m);
		expect(model.state).toBe('hidden');
		expect(model.integer).toBe('••••••');
		expect(model.decimals).toBeUndefined();
	});
	it('a live zero with nothing held is the zero-live state', () => {
		const model = liveBalance(
			{ ...PRISTINE, balance_unknown: false, display_total_usd: 0 },
			USD,
			m
		);
		expect(model.state).toBe('zero-live');
		expect(model.liveText).toBe(m.balance.liveIndicator);
	});
	it('a cached total paints first, marked as refreshing', () => {
		const model = liveBalance({ ...PRISTINE, cached_total_usd: 1383.28 }, USD, m);
		expect(model).toMatchObject({
			state: 'normal',
			integer: '$1,383',
			decimals: '28',
			status: { kind: 'refreshing', text: m.balance.stale }
		});
	});
	it('an unpriced notice is a warning; still-updating is refreshing', () => {
		const live = { ...PRISTINE, balance_unknown: false, display_total_usd: 10, tokens: [ETH] };
		expect(liveBalance({ ...live, notice: 'unpriced' }, USD, m).status).toEqual({
			kind: 'warning',
			text: m.balance.unpriced
		});
		expect(liveBalance({ ...live, notice: 'still_updating' }, USD, m).status?.kind).toBe(
			'refreshing'
		);
	});
});

describe('liveAssetRow', () => {
	it('prices the row at the committed currency, trims the balance, colours the chain', () => {
		const row = liveAssetRow(ETH, EUR, m, false);
		expect(row).toMatchObject({
			ticker: 'ETH',
			chain: 'Ethereum',
			balance: '1.5',
			fiat: { kind: 'value', text: '€2,250.00' },
			masked: false
		});
		expect(row.badgeColor).toMatch(/^#/);
	});
	it('no price is said, not guessed; hidden masks both figures', () => {
		expect(liveAssetRow({ ...ETH, price_usd: null }, USD, m, false).fiat).toEqual({
			kind: 'no-price',
			text: m.balance.noPrice
		});
		const hidden = liveAssetRow(ETH, USD, m, true);
		expect(hidden.fiat).toEqual({ kind: 'masked' });
		expect(hidden.balance).toBe('••••');
	});
});

describe('withLiveWallet', () => {
	const base = buildMobileState('h1', m, (seed) => `<svg data-seed="${seed}"></svg>`);

	it('replaces the fixture money with the core view and leaves activity honestly loading', () => {
		const model = withLiveWallet(base, {
			balance: { ...PRISTINE, balance_unknown: false, display_total_usd: 4500, tokens: [ETH] },
			currency: USD,
			m
		});
		expect(model.balance.integer).toBe('$4,500');
		expect(model.assetRows.map((r) => r.ticker)).toEqual(['ETH']);
		expect(model.assetsSection.mode).toBe('rows');
		expect(model.activitySection.mode).toBe('loading');
		expect(model.activityGroups).toEqual([]);
		// The fixture's staged figures are gone.
		expect(JSON.stringify(model)).not.toContain('$1,383');
	});

	it('nothing held after the core has looked is the empty state, not a skeleton', () => {
		const model = withLiveWallet(base, {
			balance: { ...PRISTINE, balance_unknown: false, display_total_usd: 0 },
			currency: USD,
			m
		});
		expect(model.assetsSection.mode).toBe('empty');
	});
});
