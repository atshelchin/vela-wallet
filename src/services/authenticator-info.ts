/**
 * Authenticator recognition for the founding-key list: resolve a passkey's
 * AAGUID (16 bytes the authenticator model stamps into its attestation) to a
 * provider name + icon, via the AAGUID Explorer — Vela's own read-only,
 * CORS-open service regenerated from the FIDO Metadata Service and the
 * community passkey-provider list.
 *
 * A mirror of `app-web/getvela.app/src/lib/authenticators.ts`, reduced to
 * what the onboarding rows need. Resolving at runtime (rather than freezing
 * a copy in the bundle) keeps new authenticators recognized without an app
 * update; results are cached per AAGUID for the session, and every lookup
 * degrades to a semantic fallback so a row still renders offline. Names are
 * cosmetic — the attestation is the authenticator's unverified claim.
 */

const AAGUID_API = 'https://aaguid-explorer.awesometools.dev';

/** The generic label class when no (recognized) AAGUID is available — a
 *  semantic tag, so the UI picks the translated wording. */
export type AuthenticatorKind = 'security-key' | 'platform' | 'generic' | 'unknown';

export interface AuthenticatorLabel {
  /** Resolved display name (e.g. "iCloud Keychain"), or null → render the
   *  translated fallback for `kind`. */
  name: string | null;
  /** Light/dark icon URLs on the AAGUID Explorer, or null when none. */
  iconUrl: string | null;
  iconUrlDark: string | null;
  kind: AuthenticatorKind;
}

/** A generic label from the browser hints — synchronous, so a row renders
 *  before (or without) any fetch. */
export function fallbackLabel(
  attachment: string | undefined,
  transports: string | undefined,
): AuthenticatorLabel {
  if (attachment === 'cross-platform' || (transports ?? '').includes('usb')) {
    return { name: null, iconUrl: null, iconUrlDark: null, kind: 'security-key' };
  }
  if (attachment === 'platform') {
    return { name: null, iconUrl: null, iconUrlDark: null, kind: 'platform' };
  }
  return { name: null, iconUrl: null, iconUrlDark: null, kind: 'generic' };
}

// Per-AAGUID cache, shared across every row for the session's lifetime.
const cache = new Map<string, Promise<AuthenticatorLabel>>();

async function fetchLabel(aaguid: string, fallback: AuthenticatorLabel): Promise<AuthenticatorLabel> {
  try {
    const res = await fetch(`${AAGUID_API}/api/v1/authenticators/${encodeURIComponent(aaguid)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    const entry = (await res.json()) as { id?: string; name?: string; icon?: string; iconDark?: string };
    // Never trust a response for a different AAGUID than we asked for.
    if (String(entry.id ?? '').toLowerCase() !== aaguid) return fallback;
    const name = entry.name?.trim();
    if (!name) return fallback;
    return {
      name,
      iconUrl: entry.icon ? `${AAGUID_API}/data/${entry.icon}` : null,
      iconUrlDark: entry.iconDark ? `${AAGUID_API}/data/${entry.iconDark}` : null,
      kind: fallback.kind,
    };
  } catch {
    return fallback;
  }
}

/**
 * Resolve an authenticator label. With an AAGUID, queries the AAGUID
 * Explorer (cached, best-effort); without one, resolves immediately to the
 * semantic fallback.
 */
export function resolveAuthenticator(
  aaguid: string | null | undefined,
  attachment: string | undefined,
  transports: string | undefined,
): Promise<AuthenticatorLabel> {
  const fallback = fallbackLabel(attachment, transports);
  if (!aaguid) return Promise.resolve(fallback);
  const key = aaguid.toLowerCase();
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchLabel(key, { ...fallback, kind: 'unknown' });
    cache.set(key, pending);
  }
  return pending;
}
