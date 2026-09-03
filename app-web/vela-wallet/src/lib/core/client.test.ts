/**
 * The runtime loader's caching contract (spec 024 T011).
 *
 * What is pinned is the PROMISE discipline, not the wasm itself: two callers
 * share one in-flight load, and a FAILED load is forgotten so the next call
 * retries instead of constructing cores over an uninitialized module. In
 * this node environment `fetch`ing the artifact fails by construction, which
 * is exactly the failure path the retry rule exists for.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadCore, resetCoreForTests } from './client';

describe('loadCore', () => {
	beforeEach(() => {
		resetCoreForTests();
	});

	it('two immediate callers share one in-flight initialization', () => {
		const first = loadCore();
		const second = loadCore();
		expect(second).toBe(first);
		// Settle the rejection so nothing leaks past the test.
		return first.catch(() => undefined);
	});

	it('a failed load is not cached — the next call is a fresh attempt', async () => {
		const first = loadCore();
		await expect(first).rejects.toBeTruthy();
		const second = loadCore();
		expect(second).not.toBe(first);
		await second.catch(() => undefined);
	});
});
