/**
 * The page bridge (spec 027 T320) — isolated world.
 *
 * Ported in PART from packages/safari-extension/src/content.js @ 52ad8fa9:
 * the provider transport and the dead-worker-safe background round-trip. What
 * did not come across is the other 600 lines — an in-page consent sheet drawn
 * in a shadow root, and a Universal-Link self-heal. Both exist because Safari
 * has to hand signing to a NATIVE app inside a synchronous user gesture, so the
 * decision had to happen in the page. Here the wallet is a window this
 * extension owns (spec 027 D34), which is a better place to decide anything:
 * it cannot be styled, scrolled or overlaid by the site asking for the
 * signature.
 *
 * So this file only carries messages, and it carries exactly two facts the page
 * cannot forge: WHICH tab a request came from, and WHICH origin sent it. Both
 * are the browser's, added on this side of the boundary.
 */
import { CHANNEL, ERR, rpcError } from './lib/protocol.js';

(() => {
	const ORIGIN = window.location.origin;

	/** Answer the MAIN world. Targeted at our own origin — never a wildcard. */
	function respond(id, result) {
		window.postMessage({ ch: CHANNEL, dir: 'res', id, result }, ORIGIN);
	}
	function respondErr(id, error) {
		window.postMessage({ ch: CHANNEL, dir: 'res', id, error }, ORIGIN);
	}
	function emitEvt(event, data) {
		window.postMessage({ ch: CHANNEL, dir: 'evt', event, data }, ORIGIN);
	}

	/**
	 * A round-trip to the service worker that always settles.
	 *
	 * MV3 evicts an idle worker, and a message to a dead one can resolve with
	 * `undefined` and no error. A page promise that never settles is the worst
	 * outcome this extension can produce — the dApp spins forever and the person
	 * cannot tell whether their money moved — so every call has a deadline and
	 * every deadline produces an ANSWER (spec 027 D37).
	 */
	function withTimeout(promise, ms) {
		return Promise.race([
			promise,
			new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms))
		]);
	}

	async function ask(message, ms = 300_000) {
		try {
			const reply = await withTimeout(chrome.runtime.sendMessage(message), ms);
			if (reply && reply.__timeout) {
				return {
					error: rpcError(ERR.UNKNOWN_PENDING, 'Vela did not answer in time — check its activity')
				};
			}
			if (reply === undefined) {
				return { error: rpcError(ERR.INTERNAL, 'Vela is not running') };
			}
			return reply;
		} catch (error) {
			return { error: rpcError(ERR.INTERNAL, String(error?.message ?? error)) };
		}
	}

	// ---- page → background ---------------------------------------------------

	window.addEventListener('message', async (ev) => {
		// Same-window only, on our channel. The page shares this world's DOM but
		// not this world's scope; tagging keeps us clear of other providers and of
		// nested-iframe traffic.
		if (ev.source !== window) return;
		const d = ev.data;
		if (!d || d.ch !== CHANNEL || d.dir !== 'req') return;

		const reply = await ask({
			type: 'rpc',
			// The page supplies these; the background re-checks their shape.
			id: d.id,
			method: d.method,
			params: d.params ?? []
			// It does NOT supply the origin. `sender.origin` on the other side is
			// the browser's own fact, and that is the one a grant is keyed on.
		});
		if (reply && reply.error) respondErr(d.id, reply.error);
		else respond(d.id, reply ? reply.result : null);
	});

	// ---- background → page ---------------------------------------------------

	chrome.runtime.onMessage.addListener((message) => {
		if (!message || message.type !== 'evt') return;
		emitEvt(message.event, message.data);
	});
})();
