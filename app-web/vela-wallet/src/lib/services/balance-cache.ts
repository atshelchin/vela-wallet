/**
 * Per-account total USD balance cache — WEB.
 *
 * Ported from src/services/balance-cache.ts @ c13e89d4 (spec 025): in-memory
 * map hydrated once from the KV (`vela.balanceCache`, Expo bytes), 24h TTL,
 * persisted fire-and-forget after every write.
 */
import { getItem, setItem } from './storage';

const STORAGE_KEY = 'vela.balanceCache';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
	usd: number;
	at: number;
}

const mem = new Map<string, CacheEntry>();
let loaded: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
	if (!loaded) {
		loaded = (async () => {
			try {
				const raw = await getItem(STORAGE_KEY);
				if (raw) {
					const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
					for (const [addr, entry] of Object.entries(parsed)) mem.set(addr.toLowerCase(), entry);
				}
			} catch {
				// corrupt cache reads as empty
			}
		})();
	}
	return loaded;
}

async function persist(): Promise<void> {
	try {
		const obj: Record<string, CacheEntry> = {};
		for (const [k, v] of mem) obj[k] = v;
		await setItem(STORAGE_KEY, JSON.stringify(obj));
	} catch {
		// best-effort
	}
}

export async function setAccountBalance(address: string, usd: number): Promise<void> {
	await ensureLoaded();
	mem.set(address.toLowerCase(), { usd, at: Date.now() });
	void persist();
}

/** Cached balance, or null when missing or expired. */
export async function getAccountBalance(address: string): Promise<number | null> {
	await ensureLoaded();
	const entry = mem.get(address.toLowerCase());
	if (!entry) return null;
	if (Date.now() - entry.at > TTL_MS) return null;
	return entry.usd;
}

export async function getAccountBalances(addresses: string[]): Promise<Map<string, number>> {
	await ensureLoaded();
	const now = Date.now();
	const result = new Map<string, number>();
	for (const addr of addresses) {
		const entry = mem.get(addr.toLowerCase());
		if (entry && now - entry.at <= TTL_MS) result.set(addr, entry.usd);
	}
	return result;
}
