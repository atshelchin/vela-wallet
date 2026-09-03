// Ported from src/services/erc20-meta.ts @ c13e89d4 (spec 025).
/**
 * One-shot ERC-20 identity probe for the manual "add token" flow.
 *
 * Moved verbatim out of `components/ui/AddTokenPanel.tsx` (spec 017,
 * `manage_tokens`): the panel is now a renderer over a controller pair, and
 * both the native controller and the web executor need this exact call. The
 * body is unchanged — same Multicall3 `aggregate3`, same `rpcCall` failover,
 * same `!name || !symbol → null` admission.
 *
 * Distinct from `token-metadata.ts` on purpose: that module is the *cached*
 * symbol/decimals resolver used by the transfer monitor (batched, persisted,
 * `poolRpcCall`). This one is a single uncached probe that also needs `name()`,
 * and it must stay uncached — the user is asking, right now, whether a contract
 * exists on a chain.
 */
import { MULTICALL3, SEL, decAggregate3, decString, decU8, encAggregate3 } from './abi';
// eth_call is never a bundler method, so the pool's RPC leg is the whole adapter.
import { poolRpcCall as rpcCall } from './rpc-pool';

export interface Erc20Meta {
	name: string;
	symbol: string;
	decimals: number;
}

/**
 * Fetch ERC-20 name, symbol, decimals via a single Multicall3 aggregate3 call.
 * Uses rpcCall which routes through the RPC pool with automatic failover.
 * Decoding goes through the shared `abi` helpers (`decString` handles both
 * standard string and legacy bytes32 symbols, with proper UTF-8).
 */
export async function fetchErc20Meta(
	chainId: number,
	tokenAddress: string
): Promise<Erc20Meta | null> {
	const encoded = encAggregate3([
		{ target: tokenAddress, allowFailure: true, callData: '0x' + SEL.name },
		{ target: tokenAddress, allowFailure: true, callData: '0x' + SEL.symbol },
		{ target: tokenAddress, allowFailure: true, callData: '0x' + SEL.decimals }
	]);

	const response = await rpcCall(
		'eth_call',
		[{ to: MULTICALL3, data: encoded }, 'latest'],
		chainId
	);
	if (response.error || typeof response.result !== 'string') return null;

	const results = decAggregate3(response.result);
	if (results.length < 3 || !results[0].success || !results[1].success || !results[2].success)
		return null;

	const name = decString(results[0].data);
	const symbol = decString(results[1].data);
	const decimals = decU8(results[2].data);

	if (!name || !symbol) return null;
	return { name, symbol, decimals };
}
