/**
 * The `window.vela` dev/e2e console — WEB (spec 025 T117; the fault-harness
 * doctrine: every failure-state UX must be reachable without breaking real
 * infrastructure).
 *
 * Installed only when `localStorage['vela.dev.console'] === '1'` (dev builds
 * set it themselves below; e2e seeds it via addInitScript; a production
 * visitor never has it). Everything here is diagnostics or SELF-harm on the
 * local session — no capability a page script could not already exercise
 * against its own storage.
 */

import { installFaultConsole } from './fault-injection';
import { getFailedRpcChains, getRateLimitedChains, poolRpcCall } from './rpc-pool';

const GATE_KEY = 'vela.dev.console';

export function maybeInstallDevConsole(): void {
	if (typeof window === 'undefined') return;
	try {
		if (!import.meta.env.DEV && window.localStorage.getItem(GATE_KEY) !== '1') return;
	} catch {
		return;
	}

	installFaultConsole();
	// The parallel space's own verbs, behind the same gate and one more dynamic
	// import: `vela.parallel.enter()` is how a test (or a developer) swaps in the
	// fixture wallet without visiting its page. The fixture keys ride along with
	// THIS import, never with a product chunk.
	void import('$lib/dev/parallel-space').then((m) => m.installParallelConsole());
	const vela = (window as unknown as { vela?: Record<string, unknown> }).vela ?? {};
	Object.assign(vela, {
		/** Drive one pool-routed read — the harness's entry into the router. */
		poolCall: (method: string, params: unknown[], chainId: number) =>
			poolRpcCall(method, params, chainId),
		rpcState: () => ({
			failed: [...getFailedRpcChains()],
			rateLimited: [...getRateLimitedChains()]
		})
	});
	(window as unknown as { vela: Record<string, unknown> }).vela = vela;
}
