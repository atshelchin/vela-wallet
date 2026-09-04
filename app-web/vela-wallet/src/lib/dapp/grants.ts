/**
 * Where a per-origin grant is kept (spec 027 T330).
 *
 * Ported from src/services/dapp-permissions.ts @ 52ad8fa9 — the STORAGE half
 * only. That file also carries `resolveGranted` and `shouldDropGrant`, which
 * are TypeScript twins of rules `dapp_permissions` owns in Rust; they are not
 * ported for the same reason 026 left `clear-signing`'s twin behind. The core
 * is asked (`decidePopupRequest`), never re-implemented.
 *
 * The key shape `vela.perm.<origin>` is deliberately the one the Safari
 * extension already uses, so the two extensions describe a grant identically.
 *
 * It lives in `chrome.storage.local` rather than the app's IndexedDB because
 * BOTH sides need it: the wallet writes a grant, and the service worker reads
 * it to answer an already-connected origin without opening a window. It is the
 * one piece of wallet state the worker may see, and it is a fact the core
 * authored — never a decision the worker makes.
 */
import { PERM_PREFIX } from './keys';

/** The stored grant. `grantedAt` is kept even though no rule reads it — a wire
 *  shape that drops what is persisted is a wire shape that lies. */
export interface DAppGrant {
	origin: string;
	address: string;
	chainId: number;
	grantedAt: number;
}

export function grantKey(origin: string): string {
	return PERM_PREFIX + origin;
}

interface StorageAreaLike {
	get(keys: string | string[]): Promise<Record<string, unknown>>;
	set(items: Record<string, unknown>): Promise<void>;
	remove(keys: string | string[]): Promise<void>;
}

function area(): StorageAreaLike | null {
	const local = (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome?.storage
		?.local;
	return (local as StorageAreaLike | undefined) ?? null;
}

export async function getGrant(origin: string): Promise<DAppGrant | null> {
	const store = area();
	if (!store) return null;
	try {
		const key = grantKey(origin);
		const all = await store.get(key);
		const value = all[key];
		return isGrant(value) ? value : null;
	} catch {
		return null;
	}
}

export async function setGrant(grant: DAppGrant): Promise<void> {
	const store = area();
	if (!store) return;
	try {
		await store.set({ [grantKey(grant.origin)]: grant });
	} catch {
		/* best-effort persist */
	}
}

export async function revokeGrant(origin: string): Promise<void> {
	const store = area();
	if (!store) return;
	try {
		await store.remove(grantKey(origin));
	} catch {
		/* best-effort */
	}
}

function isGrant(value: unknown): value is DAppGrant {
	if (!value || typeof value !== 'object') return false;
	const v = value as Partial<DAppGrant>;
	return (
		typeof v.origin === 'string' &&
		typeof v.address === 'string' &&
		typeof v.chainId === 'number' &&
		typeof v.grantedAt === 'number'
	);
}
