/**
 * The five-way connect-entry classification — NATIVE.
 *
 * One scanned/pasted string, five outcomes: a WalletPair pairing URI, a
 * remote-inject connect link, a full http(s) URL, a bare host, or invalid. The
 * ORDER is load-bearing and always has been: a remote-inject link IS an
 * `https://` URL (it carries `n`+`k`), so the browser fallback may only run
 * once `parseRemoteInjectURL` returned null (docs/dapp-browser/ARCHITECTURE.md
 * §7).
 *
 * Why this module exists: the same three-step decision was written out by hand
 * at every entry point (`ConnectScreen.handleConnect`, `useHomeController`'s
 * `connectFromUri`) while the Rust core made the identical decision again in
 * `dapp_session.rs::classify_connect_input` — the shell classified, threw the
 * classification away, re-serialised, and the core classified a second time.
 * Two implementations of one rule is one implementation too many, so on web
 * this module's `.web.ts` twin asks the CORE and nothing here runs
 * (`connect-entry.web.ts`).
 *
 * On iOS/Android it stays exactly as it was: Hermes has no WebAssembly, so this
 * TypeScript body is the only implementation native has and it may not be
 * deleted (FR-202 — native behaviour is unchanged by spec 017). It is a
 * call-for-call move of the code that used to sit inline at the two entry
 * points, so the native decision is byte-for-byte the one it always made.
 *
 * `src/__tests__/services/connect-entry-parity.test.ts` pins this body against
 * the core's over the real wasm, so the two can never answer differently for
 * the same input.
 */

import { coerceBrowserUrl, parseRemoteInjectURL, type RemoteInjectSession } from '@/services/dapp-transport';
import { isWalletPairURI } from '@/services/walletpair-transport';

/**
 * What one connect input turned out to be. Mirrors the core's `DsessInput`
 * (`rust/crates/vela-core/src/app/dapp_session.rs`) one variant for one variant
 * — the web twin returns the core's own answer mapped into this shape.
 */
export type ConnectEntry =
  /** A WalletPair pairing URI, trimmed exactly as the transports expect it. */
  | { kind: 'walletpair'; uri: string }
  /** A remote-inject connect link, already parsed into its four fields. */
  | { kind: 'remote-inject'; session: RemoteInjectSession }
  /** A web address (full URL or bare host) for the in-app browser, normalized. */
  | { kind: 'browser'; url: string }
  /** Not a pairing link and not a web address. */
  | { kind: 'invalid' };

export function classifyConnectEntry(raw: string): ConnectEntry {
  const trimmed = raw.trim();
  if (isWalletPairURI(trimmed)) return { kind: 'walletpair', uri: trimmed };
  const session = parseRemoteInjectURL(trimmed);
  if (session) return { kind: 'remote-inject', session };
  const url = coerceBrowserUrl(trimmed);
  if (url) return { kind: 'browser', url };
  return { kind: 'invalid' };
}
