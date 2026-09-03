/**
 * Dev/e2e fault injection — WEB (spec 025; the `vela.*` console harness the
 * fault-resilience playbook mandates, trimmed to the read-path seams this
 * feature ships; later specs add their own arms).
 *
 * Ported (trimmed) from src/services/dev/fault-injection.ts @ c13e89d4.
 * Every check is a cheap no-op in production: the console is only installed
 * in dev/e2e builds, and unset faults never trigger.
 */

type FaultState = {
	failRpcChains: Set<number>;
	rateLimitRpcChains: Set<number>;
	rpcLatencyMs: number;
	nullPriceChains: Set<number>;
};

const state: FaultState = {
	failRpcChains: new Set(),
	rateLimitRpcChains: new Set(),
	rpcLatencyMs: 0,
	nullPriceChains: new Set()
};

export function rpcShouldFail(chainId: number): boolean {
	return state.failRpcChains.has(chainId);
}

export function rpcShouldRateLimit(chainId: number): boolean {
	return state.rateLimitRpcChains.has(chainId);
}

export function rpcLatencyMs(): number {
	return state.rpcLatencyMs;
}

export function priceShouldNull(chainId: number): boolean {
	return state.nullPriceChains.has(chainId);
}

/**
 * Install `window.vela.*` (dev builds and the e2e worker only — callers gate;
 * the deployed production Worker never runs this).
 */
export function installFaultConsole(): void {
	if (typeof window === 'undefined') return;
	const api = {
		failRpc: (chainId: number) => state.failRpcChains.add(chainId),
		rateLimitRpc: (chainId: number) => state.rateLimitRpcChains.add(chainId),
		slowRpc: (ms: number) => (state.rpcLatencyMs = ms),
		nullPrice: (chainId: number) => state.nullPriceChains.add(chainId),
		clearFaults: () => {
			state.failRpcChains.clear();
			state.rateLimitRpcChains.clear();
			state.nullPriceChains.clear();
			state.rpcLatencyMs = 0;
		}
	};
	(window as unknown as { vela?: typeof api }).vela = api;
}
