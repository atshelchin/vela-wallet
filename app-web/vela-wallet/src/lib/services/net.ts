/**
 * Network primitives — WEB.
 *
 * Ported (trimmed) from src/services/net.ts @ e78afdfa (spec 024): only what
 * this app's executors call today. The full timeout table rides along
 * verbatim so later waves add call sites, not values.
 */

/** One timeout per traffic class — the Expo table, unchanged. */
export const NET_TIMEOUTS = {
	/** Read-only JSON-RPC (eth_call / getBalance / getLogs) — fail over fast. */
	rpcRead: 8_000,
	/** Bundler JSON-RPC (sendUserOp / estimate) — submission can be legitimately slow. */
	bundlerRpc: 15_000,
	/** Parallel RPC ping race for the fastest-endpoint pick. */
	rpcPing: 3_000,
	/** Bundler REST account lookup (/v1/account). */
	bundlerRest: 10_000,
	/** Bundler REST sponsorship (/v1/sponsor) — treasury write, give it room. */
	bundlerSponsor: 20_000,
	/** ethereum-data chain info / token lists / search index. */
	ethereumData: 5_000,
	/** Fiat FX rates endpoint. */
	fiatRates: 8_000,
	/** Clear-signing ERC-7730 descriptor fetch. */
	descriptor: 5_000,
	/** Public-key index reads (query / queryByWalletRef). */
	keyIndexRead: 8_000,
	/** Public-key index writes (create) — an on-chain write sits behind it. */
	keyIndexWrite: 15_000,
	/** dApp transport response POST (relay). */
	dappPost: 10_000,
	/** SSE / EventSource initial connection open. */
	sseOpen: 10_000,
	/** Custom-network RPC validation probe. */
	networkCheck: 10_000,
	/** Deployer receipt poll — per single attempt. */
	deployerPoll: 10_000
} as const;

export type NetTimeoutKey = keyof typeof NET_TIMEOUTS;

/** The request outlived its budget. The outcome is UNKNOWN, not failed. */
export class TimeoutError extends Error {
	constructor(timeoutMs: number, url: string) {
		super(`request timed out after ${timeoutMs}ms: ${url}`);
		this.name = 'TimeoutError';
	}
}

export function isAbortError(e: unknown): boolean {
	return e instanceof DOMException && e.name === 'AbortError';
}

export interface FetchTimeoutOptions {
	/** Per-attempt timeout in ms. Required — pick a value from {@link NET_TIMEOUTS}. */
	timeoutMs: number;
	/** Optional caller signal — aborting it cancels the in-flight request too. */
	signal?: AbortSignal;
}

/**
 * `fetch` that can never hang: it aborts after `timeoutMs` and rejects with a
 * {@link TimeoutError}. If a caller `signal` is supplied, aborting it also
 * cancels the request (and surfaces as an `AbortError`, not a timeout).
 */
export async function fetchWithTimeout(
	input: string,
	init: RequestInit = {},
	opts: FetchTimeoutOptions
): Promise<Response> {
	const { timeoutMs, signal: callerSignal } = opts;
	const controller = new AbortController();
	let timedOut = false;

	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	const onCallerAbort = () => controller.abort();
	if (callerSignal) {
		if (callerSignal.aborted) controller.abort();
		else callerSignal.addEventListener('abort', onCallerAbort);
	}

	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} catch (err) {
		// Our timer firing surfaces as an AbortError from fetch — remap it so the
		// caller sees a TimeoutError and can treat the outcome as *unknown*.
		if (timedOut && isAbortError(err)) throw new TimeoutError(timeoutMs, input);
		throw err;
	} finally {
		clearTimeout(timer);
		if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
	}
}
