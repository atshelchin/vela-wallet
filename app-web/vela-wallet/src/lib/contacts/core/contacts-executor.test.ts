/**
 * The web contacts executor (spec 024 T030): stored-shape byte compatibility,
 * defensive coercion, and the fail-closed answers for the 025 seams.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactEffect } from './contacts-types';

const kv = new Map<string, string>();
vi.mock('$lib/services/storage', () => ({
	getItem: vi.fn(async (key: string) => kv.get(key) ?? null),
	setItem: vi.fn(async (key: string, value: string) => void kv.set(key, value)),
	removeItem: vi.fn(async (key: string) => void kv.delete(key))
}));

import { contactOperationFailure, executeContactOperation } from './contacts-executor';

const effect = (operation: ContactEffect['operation']): ContactEffect => ({ id: 1, operation });

const ADDR = '0x14fb1f4e2b9c7a5d8e3f6a1b4c7d9e2f5a8b1d1e';

beforeEach(() => kv.clear());

describe('read_store', () => {
	it('translates the stored camelCase records and the tombstone map', async () => {
		kv.set(
			'vela.contacts',
			JSON.stringify([
				{
					address: ADDR.toUpperCase(),
					name: 'Alice',
					kind: 'eoa',
					favorite: true,
					txCount: 3,
					lastUsed: 1000,
					firstSeen: 500,
					source: 'manual'
				}
			])
		);
		kv.set('vela.contacts.dismissed', JSON.stringify({ [ADDR]: 999 }));
		kv.set('vela.contactGroups', JSON.stringify([{ id: 'g1', name: '工资单', members: [ADDR] }]));

		const result = await executeContactOperation(effect({ type: 'read_store' }));
		expect(result.type).toBe('store_loaded');
		if (result.type !== 'store_loaded') return;
		// Address lowercased — the canonical key.
		expect(result.contacts[0]).toMatchObject({
			address: ADDR.toLowerCase(),
			name: 'Alice',
			favorite: true,
			tx_count: 3,
			last_used_ms: 1000,
			source: 'manual'
		});
		expect(result.tombstones).toEqual([{ address: ADDR, dismissed_at_ms: 999 }]);
		expect(result.groups[0]).toMatchObject({ id: 'g1', name: '工资单', members: [ADDR] });
	});

	it('coerces malformed rows instead of rejecting the whole book', async () => {
		kv.set(
			'vela.contacts',
			JSON.stringify([
				{ address: ADDR, kind: 'nonsense', txCount: 'three', lastUsed: null, source: 'weird' },
				{ noAddress: true },
				null
			])
		);
		const result = await executeContactOperation(effect({ type: 'read_store' }));
		if (result.type !== 'store_loaded') throw new Error('wrong variant');
		expect(result.contacts).toHaveLength(1);
		expect(result.contacts[0]).toMatchObject({
			kind: 'unknown',
			tx_count: 0,
			last_used_ms: 0,
			source: 'manual'
		});
	});
});

describe('writes keep the Expo stored shapes', () => {
	it('write_contacts omits null optionals, exactly as services/contacts.ts', async () => {
		await executeContactOperation(
			effect({
				type: 'write_contacts',
				contacts: [
					{
						address: ADDR,
						name: 'Alice',
						resolved_name: null,
						resolved_source: null,
						kind: 'eoa',
						favorite: false,
						note: null,
						tx_count: 0,
						last_used_ms: 1,
						first_seen_ms: 1,
						source: 'manual'
					}
				]
			})
		);
		const stored = JSON.parse(kv.get('vela.contacts')!)[0];
		expect(stored).toEqual({
			address: ADDR,
			name: 'Alice',
			kind: 'eoa',
			favorite: false,
			txCount: 0,
			lastUsed: 1,
			firstSeen: 1,
			source: 'manual'
		});
		expect('resolvedName' in stored).toBe(false);
		expect('note' in stored).toBe(false);
	});

	it('write_dismissed stores the address→ms MAP, not a list', async () => {
		await executeContactOperation(
			effect({ type: 'write_dismissed', tombstones: [{ address: ADDR, dismissed_at_ms: 42 }] })
		);
		expect(JSON.parse(kv.get('vela.contacts.dismissed')!)).toEqual({ [ADDR]: 42 });
	});
});

describe('the 025 seams answer, never skip', () => {
	it('load_send_history is truthfully empty', async () => {
		expect(await executeContactOperation(effect({ type: 'load_send_history' }))).toEqual({
			type: 'history_loaded',
			txs: []
		});
	});
	it('resolve_identity answers no-identity', async () => {
		expect(
			await executeContactOperation(effect({ type: 'resolve_identity', address: ADDR }))
		).toEqual({ type: 'identity_resolved', address: ADDR, identity: null });
	});
	it('classify_recipient answers unknown, never a verdict', async () => {
		expect(
			await executeContactOperation(
				effect({ type: 'classify_recipient', chain_id: 1, address: ADDR })
			)
		).toEqual({ type: 'recipient_classified', chain_id: 1, address: ADDR, code: null });
	});
});

describe('the failure twin', () => {
	it('read_store failure is an empty book, still loaded', () => {
		expect(contactOperationFailure(effect({ type: 'read_store' }))).toEqual({
			type: 'store_loaded',
			contacts: [],
			tombstones: [],
			groups: []
		});
	});
	it('history failure has its own variant', () => {
		expect(contactOperationFailure(effect({ type: 'load_send_history' }))).toEqual({
			type: 'history_failed'
		});
	});
});
