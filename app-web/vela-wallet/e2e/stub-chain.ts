/**
 * The hermetic chain harness (spec 025 D11 / FR-108).
 *
 * Every read-path e2e runs against THIS, never a live chain: a default-deny
 * interception net over all off-origin traffic, with per-suite JSON-RPC and
 * HTTP handlers layered on top. 026's parallel-space port extends the same
 * seams with bundler stubs.
 */
import type { Page, Route } from '@playwright/test';

export type RpcHandler = (method: string, params: unknown[], url: string) => unknown | undefined;

/**
 * Deny-by-default for everything that is not the app itself. Register BEFORE
 * any page.goto: silence about a missed stub must be a failed request, never
 * a live call escaping CI.
 */
export async function denyOffOrigin(page: Page): Promise<void> {
	await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort('failed'));
}

/** Answer JSON-RPC POSTs on matching URLs; non-matching methods 500. */
export async function stubJsonRpc(
	page: Page,
	urlPattern: RegExp,
	handle: RpcHandler
): Promise<void> {
	await page.route(urlPattern, async (route: Route) => {
		const request = route.request();
		if (request.method() !== 'POST') return route.abort('failed');
		let body: { method?: string; params?: unknown[]; id?: number };
		try {
			body = JSON.parse(request.postData() ?? '{}');
		} catch {
			return route.fulfill({ status: 400, body: 'bad json' });
		}
		const result = handle(body.method ?? '', body.params ?? [], request.url());
		if (result === undefined) return route.fulfill({ status: 500, body: 'unhandled method' });
		return route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, result })
		});
	});
}

/** A fixed non-JSON failure (auth wall, rate limit…) on matching URLs. */
export async function stubHttpFailure(
	page: Page,
	urlPattern: RegExp,
	status: number
): Promise<void> {
	await page.route(urlPattern, (route) => route.fulfill({ status, body: 'no' }));
}

/** Read a key from the app's IndexedDB KV (the executors' storage). */
export async function readKv(page: Page, key: string): Promise<string | null> {
	return page.evaluate(
		(k) =>
			new Promise<string | null>((resolve, reject) => {
				const open = indexedDB.open('vela', 1);
				open.onupgradeneeded = () => open.result.createObjectStore('kv');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('kv', 'readonly');
					const get = tx.objectStore('kv').get(k);
					get.onsuccess = () => resolve(typeof get.result === 'string' ? get.result : null);
					get.onerror = () => reject(get.error);
				};
			}),
		key
	);
}

/** Drive one pool-routed read through the gated dev console. */
export async function poolCall(
	page: Page,
	method: string,
	params: unknown[],
	chainId: number
): Promise<unknown> {
	return page.evaluate(
		async ({ method, params, chainId }) => {
			const vela = (
				window as unknown as {
					vela?: { poolCall(m: string, p: unknown[], c: number): Promise<unknown> };
				}
			).vela;
			if (!vela) throw new Error('dev console not installed — seed vela.dev.console');
			return vela.poolCall(method, params, chainId);
		},
		{ method, params, chainId }
	);
}
