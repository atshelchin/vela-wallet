/**
 * The web activity_feed executor (spec 025 Phase 4): stored records reach the
 * core in its vocabulary (coerced, never rejected), the raw rows reach the
 * sink, own accounts alias locally, and the failure twin answers every op.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalTransaction } from '$lib/services/transactions-model';
import type { FeedEffect } from './feed-types';

const kv = new Map<string, string>();
vi.mock('$lib/services/storage', () => ({
	getItem: vi.fn(async (key: string) => kv.get(key) ?? null),
	setItem: vi.fn(async (key: string, value: string) => void kv.set(key, value)),
	removeItem: vi.fn(async (key: string) => void kv.delete(key))
}));
vi.mock('$lib/services/activity', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/services/activity')>();
	return { ...original, syncReceivedTransfers: vi.fn(async () => 2) };
});

const waterfall = vi.fn(async (addr: string) =>
	addr === '0x' + 'b1'.repeat(20) ? { name: 'vitalik.eth', source: 'ENS' } : null
);
vi.mock('$lib/services/recipient-identity', () => ({
	resolveRecipientIdentity: (addr: string) => waterfall(addr)
}));

import { createFeedExecutor, toFeedRecord } from './feed-executor';

const effect = (operation: FeedEffect['operation']): FeedEffect => ({ id: 1, operation });
const ME = '0x14fb1f4e2b9c7a5d8e3f6a1b4c7d9e2f5a8b1d1e';
const OTHER = '0x' + 'b1'.repeat(20);

const RECEIVED: LocalTransaction = {
	id: '1-0xabc-0',
	userOpHash: '',
	txHash: '0xabc',
	from: OTHER,
	to: ME,
	value: '1.5',
	symbol: 'ETH',
	decimals: 18,
	chainId: 1,
	timestamp: 1_700_000_000,
	status: 'confirmed',
	type: 'receive',
	usd: '$4,500.00'
};

beforeEach(() => kv.clear());

describe('toFeedRecord', () => {
	it('speaks the core vocabulary, day-keyed in the device timezone', () => {
		const record = toFeedRecord(RECEIVED);
		expect(record).toMatchObject({
			id: '1-0xabc-0',
			from: OTHER,
			to: ME,
			value: '1.5',
			symbol: 'ETH',
			chain_id: 1,
			kind: 'receive',
			status: 'confirmed',
			usd: '$4,500.00'
		});
		expect(record?.day_start_ms).toBe(
			new Date(new Date(1_700_000_000 * 1000).setHours(0, 0, 0, 0)).getTime()
		);
	});
	it('a legacy untyped row is kind null (read as send by the core); junk coerces', () => {
		const legacy = toFeedRecord({ ...RECEIVED, type: undefined, decimals: NaN, timestamp: NaN });
		expect(legacy).toMatchObject({ kind: null, decimals: 0, timestamp: 0 });
		expect(toFeedRecord({ ...RECEIVED, type: 'nonsense' as never })).toBeNull();
	});
});

describe('the store and the scan', () => {
	it('read_tx_store hands the raw rows to the sink and the core its records, read_id echoed', async () => {
		kv.set('vela.transactionHistory', JSON.stringify([RECEIVED]));
		const raw: LocalTransaction[][] = [];
		const executor = createFeedExecutor(() => [], { storeLoaded: (records) => raw.push(records) });
		const result = await executor.execute(
			effect({ type: 'read_tx_store', address: ME, read_id: 7 }),
			new AbortController().signal
		);
		expect(raw[0]).toEqual([RECEIVED]);
		expect(result).toMatchObject({ type: 'store_loaded', read_id: 7 });
		if (result.type === 'store_loaded') expect(result.records[0].id).toBe('1-0xabc-0');
	});

	it('scan_incoming_transfers answers the sync count', async () => {
		const executor = createFeedExecutor(() => [], { storeLoaded: () => {} });
		expect(
			await executor.execute(
				effect({ type: 'scan_incoming_transfers', address: ME }),
				new AbortController().signal
			)
		).toEqual({ type: 'sync_completed', new_count: 2 });
	});

	it('delete_tx_record removes the row from the store', async () => {
		kv.set('vela.transactionHistory', JSON.stringify([RECEIVED]));
		const executor = createFeedExecutor(() => [], { storeLoaded: () => {} });
		expect(
			await executor.execute(
				effect({ type: 'delete_tx_record', id: '1-0xabc-0' }),
				new AbortController().signal
			)
		).toEqual({ type: 'delete_committed', id: '1-0xabc-0' });
		expect(JSON.parse(kv.get('vela.transactionHistory')!)).toEqual([]);
	});
});

describe('identity', () => {
	it('an own account aliases locally with no network; anyone else asks the waterfall', async () => {
		const executor = createFeedExecutor(() => [{ address: ME, name: 'Me' }], {
			storeLoaded: () => {}
		});
		const signal = new AbortController().signal;
		expect(
			await executor.execute(effect({ type: 'resolve_recipient_identity', addr: ME }), signal)
		).toEqual({ type: 'alias_resolved', addr: ME, name: 'Me' });
		expect(waterfall).not.toHaveBeenCalled();
		expect(
			await executor.execute(effect({ type: 'resolve_recipient_identity', addr: OTHER }), signal)
		).toEqual({ type: 'alias_resolved', addr: OTHER, name: 'vitalik.eth' });
		const nobody = '0x' + 'c2'.repeat(20);
		expect(
			await executor.execute(effect({ type: 'resolve_recipient_identity', addr: nobody }), signal)
		).toEqual({ type: 'alias_resolved', addr: nobody, name: null });
	});
});

describe('the failure twin', () => {
	it('answers every operation without deciding', () => {
		const executor = createFeedExecutor(() => [], { storeLoaded: () => {} });
		expect(
			executor.toFailure(
				effect({ type: 'read_tx_store', address: ME, read_id: 3 }),
				new Error('io')
			)
		).toMatchObject({ type: 'store_loaded', records: [], read_id: 3 });
		expect(
			executor.toFailure(effect({ type: 'scan_incoming_transfers', address: ME }), new Error('net'))
		).toEqual({ type: 'sync_completed', new_count: 0 });
		expect(
			executor.toFailure(effect({ type: 'timer', ms: 1, generation: 4 }), new Error('x'))
		).toEqual({ type: 'toast_expired', generation: 4 });
	});
});
