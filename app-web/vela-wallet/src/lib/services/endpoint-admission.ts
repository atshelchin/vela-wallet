// Ported from src/services/endpoint-admission.ts @ c13e89d4 (spec 025), verbatim.
/**
 * What may be PERSISTED as a service endpoint.
 *
 * ## Why this is a gate and not a hint
 *
 * The passkey index endpoint is where every passkey public key is uploaded and
 * where sign-in on a device with no local account looks the key back up. That
 * lookup is trusted verbatim: `login.rs` takes the record's `public_key_hex`
 * straight to `address_from_public_key_hex` and saves the result as the user's
 * account, and nothing on the way re-derives it from the assertion. An index
 * the attacker controls therefore chooses the address the user signs in to —
 * and over plain `http://` a network attacker gets the same power without
 * owning anything at all.
 *
 * So the endpoint value is a security decision, not a preference, and it needs
 * a rule at the moment it is written rather than a coloured dot afterwards.
 *
 * ## The rule
 *
 * `https://`, or the localhost-`http://` exception the core already spells out
 * for the health probe (`network_admin.rs::is_localhost_http`). Nothing else.
 * The exception is anchored on the FULL host label on purpose:
 * `http://127.0.0.1.evil.com` is a remote host wearing a familiar prefix and is
 * NOT localhost.
 *
 * ## Why the rule lives here and not in the core
 *
 * The core owns the Settings path (`network_admin`), and the Settings editor
 * runs through it. Onboarding cannot: the endpoint has to be editable before
 * any wallet exists, and routing that screen through `network_admin` would
 * change what iOS/Android do (their twin probes all four fields on different
 * timings) in a release whose rule is that native behaviour does not move. One
 * shared TypeScript predicate, applied identically on both platforms and
 * pinned to the core's wording by
 * `src/__tests__/services/endpoint-admission.test.ts`, is the version of "one
 * owner" that is available here.
 */

/**
 * `/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/` — byte-for-byte the
 * pattern `network_admin.rs::is_localhost_http` documents and implements.
 * The parity test reads both; edit one and it goes red.
 */
export const LOCALHOST_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

/** The loopback carve-out from the HTTPS requirement. */
export function isLocalhostHttp(url: string): boolean {
	return LOCALHOST_HTTP.test(url);
}

/**
 * May this value be written to storage as a service endpoint?
 *
 * Expects the CLEANED value (trimmed, CR/LF stripped) — a leading space must
 * not be what decides, and the raw-value quirk of the health probe is not a
 * quirk worth reproducing in a gate. An empty string is not admissible: it is
 * not a way to say "use the default", it is a way to leave the app pointing at
 * nothing. Callers offer "Reset to default" for that.
 */
export function isAdmissibleEndpoint(cleaned: string): boolean {
	if (!cleaned) return false;
	return cleaned.startsWith('https://') || isLocalhostHttp(cleaned);
}
