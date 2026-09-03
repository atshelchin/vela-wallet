/**
 * Token model — WEB (spec 025).
 *
 * The `APIToken` shape and its computed helpers, ported (trimmed) from
 * src/models/types.ts @ c13e89d4. Everything else in that file belongs to
 * other domains and stays with them.
 */

import { checksumAddress } from '$lib/core/client';
import { apiNetworkToChainId } from './chains';
import { getEthereumDataURL } from './endpoints';

export interface APIToken {
	network: string;
	chainName: string;
	symbol: string;
	balance: string;
	decimals: number;
	logo: string | null;
	name: string;
	tokenAddress: string | null;
	priceUsd: number | null;
	spam: boolean;
}

export function tokenId(t: APIToken): string {
	return `${t.network}_${t.tokenAddress ?? 'native'}_${t.symbol}`;
}

export function isNativeToken(t: APIToken): boolean {
	return t.tokenAddress == null;
}

export function tokenBalanceDouble(t: APIToken): number {
	return parseFloat(t.balance) || 0;
}

export function tokenUsdValue(t: APIToken): number {
	return tokenBalanceDouble(t) * (t.priceUsd ?? 0);
}

export function tokenChainId(t: APIToken): number {
	// Inverse of networkId(); both derive from CHAINS, one table entry each way.
	return apiNetworkToChainId(t.network);
}

/**
 * The chain whose logo represents a native coin — the COIN's identity, not
 * the chain it sits on (ETH on Base is still Ethereum's logo).
 */
export function nativeCoinLogoChainId(symbol: string, fallbackChainId: number): number {
	switch (symbol.toUpperCase()) {
		case 'ETH':
			return 1;
		case 'BNB':
			return 56;
		case 'POL':
		case 'MATIC':
			return 137;
		case 'AVAX':
			return 43114;
		case 'XDAI':
			return 100;
		default:
			return fallbackChainId;
	}
}

/** The badge chain, or null when it would duplicate the main logo. */
export function tokenBadgeChainId(t: APIToken): number | null {
	const cid = tokenChainId(t);
	if (isNativeToken(t) && nativeCoinLogoChainId(t.symbol, cid) === cid) return null;
	return cid;
}

/** A user-added ERC-20 (`vela.customTokens` record, Expo shape verbatim). */
export interface CustomToken {
	id: string; // "{chainId}_{contractAddress}"
	chainId: number;
	contractAddress: string;
	symbol: string;
	name: string;
	decimals: number;
	networkName: string;
}

/** The core's `is_address` shape — 0x + 40 hex. */
export function isAddress(value: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** A native coin's logo — the COIN's chain, not the chain it sits on. */
export function nativeLogoURLs(chainId: number, symbol: string): string[] {
	const logoChain = nativeCoinLogoChainId(symbol, chainId);
	return [`${getEthereumDataURL()}/chainlogos/eip155-${logoChain}.png`];
}

/**
 * Logo candidates for a raw (chainId, address): checksummed first, lowercase
 * fallback. Never throws — a malformed address yields no URLs.
 */
export function tokenLogoURLsByAddress(chainId: number, tokenAddress: string): string[] {
	if (!isAddress(tokenAddress)) return [];
	const base = `${getEthereumDataURL()}/assets/eip155-${chainId}`;
	const cs = checksumAddress(tokenAddress);
	const lc = tokenAddress.toLowerCase();
	const urls = [`${base}/${cs}/logo.png`];
	if (lc !== cs) urls.push(`${base}/${lc}/logo.png`);
	return urls;
}
