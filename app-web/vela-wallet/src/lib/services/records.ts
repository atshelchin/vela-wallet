/**
 * Readers/writers for the stored records the services share — WEB (spec 025).
 *
 * The Expo client keeps these in `services/storage.ts`; here they live in one
 * small module over the IndexedDB KV so every consumer reads the same bytes
 * the settings executors write (same keys, same camelCase shapes — the
 * cross-client compatibility contract). Readers trust like the Expo loaders
 * did: absent/corrupt reads as empty, never throws.
 */

import { getItem, setItem } from './storage';
import type { CustomToken } from './tokens-model';

/** The Expo `CustomNetwork` stored shape (camelCase), verbatim. */
export interface CustomNetworkRecord {
	id: string;
	displayName: string;
	chainId: number;
	iconLabel: string;
	iconColor: string;
	iconBg: string;
	logoURL: string;
	isL2: boolean;
	rpcURL: string;
	explorerURL: string;
	bundlerURL: string;
	nativeSymbol: string;
	addedAt: string;
}

export interface NetworkConfigRecord {
	chainId: number;
	rpcURL?: string;
	explorerURL?: string;
	bundlerURL?: string;
}

export type RpcProviderKeys = Partial<Record<'alchemy' | 'drpc' | 'ankr', string>>;

async function loadArray<T>(key: string): Promise<T[]> {
	try {
		const raw = await getItem(key);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

export async function loadCustomNetworks(): Promise<CustomNetworkRecord[]> {
	return loadArray<CustomNetworkRecord>('vela.customNetworks');
}

export async function getNetworkConfig(chainId: number): Promise<NetworkConfigRecord | null> {
	const configs = await loadArray<NetworkConfigRecord>('vela.networkConfig');
	return configs.find((c) => c.chainId === chainId) ?? null;
}

export async function getRpcProviderKeys(): Promise<RpcProviderKeys> {
	try {
		const raw = await getItem('vela.rpcProviders');
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		return parsed !== null && typeof parsed === 'object' ? (parsed as RpcProviderKeys) : {};
	} catch {
		return {};
	}
}

/** The Expo `LocalTransaction` store (spec 025 D14: real seam, 026 writes). */
export async function loadTransactions<T>(): Promise<T[]> {
	return loadArray<T>('vela.transactionHistory');
}

export async function saveTransactions(records: unknown[]): Promise<void> {
	await setItem('vela.transactionHistory', JSON.stringify(records));
}

export async function loadCustomTokens(): Promise<CustomToken[]> {
	return loadArray<CustomToken>('vela.customTokens');
}

/** Upsert by id — the Expo `saveCustomToken` contract. */
export async function saveCustomToken(token: CustomToken): Promise<void> {
	const tokens = await loadCustomTokens();
	const rest = tokens.filter((t) => t.id !== token.id);
	rest.push(token);
	await setItem('vela.customTokens', JSON.stringify(rest));
}

export async function removeCustomToken(id: string): Promise<void> {
	const tokens = await loadCustomTokens();
	await setItem('vela.customTokens', JSON.stringify(tokens.filter((t) => t.id !== id)));
}
