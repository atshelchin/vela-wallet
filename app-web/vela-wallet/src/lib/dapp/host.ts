/**
 * The one thing the request window shows before anything else (spec 027).
 *
 * A site's self-reported name and icon are CLAIMS. Its origin is a fact, put
 * there by the browser on the other side of the message boundary. The consent
 * surface leads with the fact.
 *
 * Ported from packages/safari-extension/src/lib/protocol.js @ 52ad8fa9
 * (`hostLabel`) — the same function the page-side scripts use, so both sides
 * shorten an origin identically.
 */
export function hostLabel(origin: string): string {
	try {
		return new URL(origin).host || origin;
	} catch {
		return String(origin || '');
	}
}
