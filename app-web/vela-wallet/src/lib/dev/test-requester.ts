/**
 * The in-page signing requester — the web's stand-in for a dApp (spec 026 D22).
 *
 * The Expo app drives its signing sheet from a real transport: a local relay
 * bridging a test dApp page to the wallet. On the web there is no transport to
 * bridge yet — WalletPair and the remote-inject relay are 027 — so this module
 * IS the requester: it posts requests into the same seam a transport would,
 * and receives the same answers a dApp would.
 *
 * That order is deliberate. The signing sheet must be proven against the real
 * machines BEFORE a transport is attached, or 027 would be debugging UI and
 * transport at once.
 *
 * Dev-gated like the rest of `lib/dev`: reached only through a dynamic import
 * behind the console gate, so no production page carries it.
 */

/** A request as a dApp would send it. */
export interface TestRequest {
	id: string;
	method: string;
	params: unknown[];
	origin: string;
}

/** What a transport must be able to do: answer the request it delivered. */
export interface RequesterTransport {
	id: string;
	sendResponse(id: string, result: unknown, error?: { code: number; message: string }): void;
}

type Deliver = (request: TestRequest) => void;

let deliver: Deliver | null = null;
const pending = new Map<
	string,
	{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();
let counter = 0;

/**
 * The transport id the requester registers under. Fixed so a test can name it
 * and the resident can look it up.
 */
export const TEST_TRANSPORT_ID = 'vela-test-requester';

/**
 * Bind the requester to whatever consumes requests (Phase 5: the
 * `sign_request` resident). Returns the transport the consumer answers on, and
 * an unbind function.
 */
export function bindRequester(onRequest: Deliver): {
	transport: RequesterTransport;
	unbind: () => void;
} {
	deliver = onRequest;
	const transport: RequesterTransport = {
		id: TEST_TRANSPORT_ID,
		sendResponse(id, result, error) {
			const waiter = pending.get(id);
			if (!waiter) return;
			pending.delete(id);
			if (error) waiter.reject(error);
			else waiter.resolve(result);
		}
	};
	return {
		transport,
		unbind: () => {
			if (deliver === onRequest) deliver = null;
			for (const [id, waiter] of pending) {
				waiter.reject({ code: 4900, message: 'requester unbound' });
				pending.delete(id);
			}
		}
	};
}

/**
 * Fire a request and wait for the wallet's answer — resolves with the result,
 * rejects with the provider error (4001 for a rejection, exactly as a dApp
 * would see it).
 */
export function fire(
	method: string,
	params: unknown[] = [],
	origin = 'https://test.dapp'
): Promise<unknown> {
	if (!deliver) return Promise.reject(new Error('no signing surface is listening'));
	counter += 1;
	const id = `test-${counter}`;
	const request: TestRequest = { id, method, params, origin };
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		deliver?.(request);
	});
}

/** How many requests are still waiting for an answer. */
export function pendingCount(): number {
	return pending.size;
}

/** Install `vela.requester.*` (dev gate only — the caller has already checked). */
export function installRequesterConsole(): void {
	if (typeof window === 'undefined') return;
	const api = {
		fire,
		pending: pendingCount,
		bound: () => deliver !== null
	};
	const g = window as unknown as { vela?: Record<string, unknown> };
	g.vela = Object.assign(g.vela ?? {}, { requester: api });
}
