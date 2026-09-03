/**
 * The async KV over IndexedDB (spec 024 T009).
 *
 * The `.svelte.test.ts` name is the browser-project selector in
 * vite.config.ts, not a Svelte dependency: these tests need a real
 * `indexedDB`, which the node project does not have.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getItem, removeItem, resetStorageForTests, setItem } from './storage';

describe('storage: the AsyncStorage-shaped KV', () => {
	beforeEach(async () => {
		resetStorageForTests();
		await new Promise<void>((resolve, reject) => {
			const req = indexedDB.deleteDatabase('vela');
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
			// A hanging handle from a previous test file would block deletion
			// forever; blocked still means the delete will land, so move on.
			req.onblocked = () => resolve();
		});
	});

	it('round-trips a value', async () => {
		await setItem('vela.test', '{"a":1}');
		expect(await getItem('vela.test')).toBe('{"a":1}');
	});

	it('answers null for a key never written', async () => {
		expect(await getItem('vela.never')).toBeNull();
	});

	it('removeItem makes the key read as never written', async () => {
		await setItem('vela.gone', 'x');
		await removeItem('vela.gone');
		expect(await getItem('vela.gone')).toBeNull();
	});

	it('removeItem of an absent key is not an error', async () => {
		await expect(removeItem('vela.absent')).resolves.toBeUndefined();
	});

	it('holds a large value (past any localStorage comfort zone)', async () => {
		const big = 'x'.repeat(6 * 1024 * 1024);
		await setItem('vela.big', big);
		expect((await getItem('vela.big'))?.length).toBe(big.length);
	});

	it('concurrent writes to one key settle on the last', async () => {
		await Promise.all(Array.from({ length: 20 }, (_, i) => setItem('vela.race', String(i))));
		// IDB serializes readwrite transactions on a store; the point pinned
		// here is that nothing tears and SOME complete write wins.
		expect(await getItem('vela.race')).toBe('19');
	});

	it('survives a dropped connection cache (fresh open, same data)', async () => {
		await setItem('vela.persist', 'kept');
		resetStorageForTests();
		expect(await getItem('vela.persist')).toBe('kept');
	});
});
