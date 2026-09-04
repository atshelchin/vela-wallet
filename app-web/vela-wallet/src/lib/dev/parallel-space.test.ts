/**
 * Entering and leaving the parallel space (spec 026 T221).
 *
 * The safety property is the round trip: a person's real wallet cache must
 * come back exactly as it was, and re-entering must never overwrite the backup
 * with fixture data. The signer swap is the other half — after entry, every
 * passkey ceremony is served by the fixed keys, and after exit, none is.
 */
import '$lib/i18n/wasm-init.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = new Map<string, string>();
vi.mock('$lib/services/storage', () => ({
	getItem: vi.fn(async (key: string) => kv.get(key) ?? null),
	setItem: vi.fn(async (key: string, value: string) => void kv.set(key, value)),
	removeItem: vi.fn(async (key: string) => void kv.delete(key))
}));

const local = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => local.get(key) ?? null,
	setItem: (key: string, value: string) => void local.set(key, value),
	removeItem: (key: string) => void local.delete(key),
	clear: () => local.clear()
});

import { hasPasskeyOverride, signWithAny } from '$lib/onboarding/core/passkey';
import { verifySafeWebAuthn } from '$lib/core/kernels';
import { parallelFlagSet } from './parallel-flag.svelte';
import {
	applyParallelSpaceOnBoot,
	enterParallelSpace,
	exitParallelSpace,
	fixtureStoredAccounts,
	uninstallFixtureSigner
} from './parallel-space';

const REAL_ACCOUNTS = JSON.stringify([
	{
		id: 'real-cred',
		name: 'My Wallet',
		address: '0x14fb1f4e2b9c7a5d8e3f6a1b4c7d9e2f5a8b1d1e',
		public_key_hex: '04' + 'ab'.repeat(64),
		created_at_iso: '2026-01-01T00:00:00.000Z',
		keys: []
	}
]);

beforeEach(() => {
	kv.clear();
	local.clear();
	uninstallFixtureSigner();
});

describe('the fixture wallets', () => {
	it('are three single-key Safes plus the golden multi-key one', () => {
		const accounts = fixtureStoredAccounts();
		expect(accounts).toHaveLength(4);
		expect(accounts.slice(0, 3).every((a) => a.keys.length === 1)).toBe(true);
		expect(accounts[3].keys).toHaveLength(3);
		expect(accounts[3].address).toBe('0x88cCA0EeDbF2C4426110bbFc998F048689266894');
		// keys[0] mirrors the scalar fields — the stored shape's invariant.
		for (const account of accounts) {
			expect(account.keys[0].credential_id).toBe(account.id);
			expect(account.keys[0].public_key_hex).toBe(account.public_key_hex);
		}
	});
});

describe('the round trip', () => {
	it('swaps the wallet in, and gives the real one back untouched', async () => {
		local.set('vela.accounts', REAL_ACCOUNTS);
		local.set('vela.activeAccountIndex', '2');

		await enterParallelSpace();
		expect(parallelFlagSet()).toBe(true);
		expect(local.get('vela.accounts')).not.toBe(REAL_ACCOUNTS);
		expect(local.get('vela.activeAccountIndex')).toBe('0');
		expect(JSON.parse(local.get('vela.accounts')!)).toHaveLength(4);

		await exitParallelSpace();
		expect(parallelFlagSet()).toBe(false);
		expect(local.get('vela.accounts')).toBe(REAL_ACCOUNTS);
		expect(local.get('vela.activeAccountIndex')).toBe('2');
		expect(local.has('vela.parallelSpace.realWalletBackup')).toBe(false);
	});

	it('re-entering does not overwrite the backup with fixture data', async () => {
		local.set('vela.accounts', REAL_ACCOUNTS);
		await enterParallelSpace();
		await enterParallelSpace();
		await exitParallelSpace();
		expect(local.get('vela.accounts')).toBe(REAL_ACCOUNTS);
	});

	it('a visitor with no wallet gets no wallet back', async () => {
		await enterParallelSpace();
		expect(JSON.parse(local.get('vela.accounts')!)).toHaveLength(4);
		await exitParallelSpace();
		expect(local.has('vela.accounts')).toBe(false);
		expect(local.has('vela.activeAccountIndex')).toBe(false);
	});

	it('seeds one fixture contact and removes exactly that one', async () => {
		kv.set('vela.contacts', JSON.stringify([{ address: '0xmine', name: 'Mine', kind: 'eoa' }]));
		await enterParallelSpace();
		const seeded = JSON.parse(kv.get('vela.contacts')!) as { address: string }[];
		expect(seeded).toHaveLength(2);
		await enterParallelSpace(); // idempotent
		expect(JSON.parse(kv.get('vela.contacts')!)).toHaveLength(2);
		await exitParallelSpace();
		const left = JSON.parse(kv.get('vela.contacts')!) as { address: string }[];
		expect(left).toEqual([{ address: '0xmine', name: 'Mine', kind: 'eoa' }]);
	});
});

describe('the signer swap', () => {
	it('installs the fixed keys on entry and takes them away on exit', async () => {
		expect(hasPasskeyOverride()).toBe(false);
		await enterParallelSpace();
		expect(hasPasskeyOverride()).toBe(true);

		// The ceremony a send would run, answered by a fixture key.
		const assertion = await signWithAny('0x' + '11'.repeat(32), [
			{ id: fixtureStoredAccounts()[0].id }
		]);
		expect(verifySafeWebAuthn(assertion)).toEqual({ ok: true });

		await exitParallelSpace();
		expect(hasPasskeyOverride()).toBe(false);
	});

	it('re-arms on boot only when the flag is set', async () => {
		await applyParallelSpaceOnBoot();
		expect(hasPasskeyOverride()).toBe(false);

		local.set('vela.parallelSpace', '1');
		await applyParallelSpaceOnBoot();
		expect(hasPasskeyOverride()).toBe(true);
	});
});
