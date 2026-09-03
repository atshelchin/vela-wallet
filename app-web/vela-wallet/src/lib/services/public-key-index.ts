/**
 * Ported from src/services/public-key-index.ts @ c13e89d4 — only the read the
 * identity waterfall needs (`queryByWalletRef`). The writes (create / reveal)
 * belong to onboarding, which has its own client. The base URL is the
 * configured passkey-index endpoint, read per call (a settings edit reaches
 * the next lookup).
 */
import { getPasskeyIndexURL } from './endpoints';
import { fetchWithTimeout, NET_TIMEOUTS, TimeoutError } from './net';

export interface PublicKeyRecord {
	rpId: string;
	credentialId: string;
	publicKey: string;
	name: string;
	initialCredentialId?: string;
	metadata?: string;
	createdAt: number;
}

function addressToBytes32(address: string): string {
	const stripped = address.toLowerCase().replace(/^0x/, '');
	return '0x' + stripped.padStart(64, '0');
}

/** The index record for a wallet address, or null when it has none. */
export async function queryByWalletRef(address: string): Promise<PublicKeyRecord | null> {
	if (/^0x0+$/.test(address)) return null; // the zero address has no entry — skip the doomed 404
	const baseUrl = getPasskeyIndexURL().trim().replace(/\/$/, '');
	const url = `${baseUrl}/api/query?walletRef=${encodeURIComponent(addressToBytes32(address))}`;
	try {
		const response = await fetchWithTimeout(url, {}, { timeoutMs: NET_TIMEOUTS.keyIndexRead });
		if (!response.ok) return null;
		return (await response.json()) as PublicKeyRecord;
	} catch (err) {
		// Identity lookup is best-effort enrichment. A slow or unreachable
		// index degrades to "unknown recipient", never blocks.
		if (err instanceof TimeoutError) return null;
		throw err;
	}
}
