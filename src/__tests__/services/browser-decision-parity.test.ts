/**
 * The in-app dApp browser's provider decision, TypeScript ↔ Rust core.
 *
 * Two implementations exist and exactly ONE of them runs anywhere today:
 *
 * - `services/wallet-browser-router.ts::decideBrowserRequest` is executed by
 *   `app/browser.tsx`, which renders a native WebView. `isWalletWebViewSupported`
 *   is `ios || android` (`modules/webview/index.tsx`), so on web the screen
 *   short-circuits to a fallback and this decision is unreachable there.
 * - `dapp_permissions.rs::decide_browser_request` is reached only through
 *   `DpermEvent::provider_request`, which NO shell dispatches — the one live
 *   consumer of that core is the popup's `popup_request`
 *   (`wallet-state-core/dperm-popup.web.ts`). It is authored, tested and
 *   currently unexecuted.
 *
 * That is the hazard worth guarding: an unexecuted rule that LOOKS like the
 * source of truth is where the next edit lands, and the platform that actually
 * ships keeps deciding out of the other copy. Since the browser can only exist
 * on native (Hermes, no wasm), neither side can be deleted — so this pins the
 * shared vocabulary instead.
 *
 * ONE structural difference is deliberate and asserted below rather than
 * smoothed over: for a FORWARDED request the Rust decision rejects a
 * cross-origin iframe itself, while the TypeScript decision returns `forward`
 * and lets `WebViewTransport` refuse it one layer down. Same outcome, two
 * layers — so this test requires BOTH to keep existing, because deleting either
 * one silently opens iframe traffic into the signing pipeline.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { decideBrowserRequest } from '@/services/wallet-browser-router';

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const DPERM_PATH = 'rust/crates/vela-core/src/app/dapp_permissions.rs';
const ROUTER_PATH = 'src/services/wallet-browser-router.ts';
const WEBVIEW_PATH = 'src/modules/webview/index.tsx';
const TRANSPORT_PATH = 'src/services/webview-transport.ts';

const dperm = read(DPERM_PATH);
const router = read(ROUTER_PATH);

/** `pub const NAME: u32 = 1234;` */
function rustCode(name: string): number {
  const match = new RegExp(`pub const ${name}:\\s*u32\\s*=\\s*(\\d+)\\s*;`).exec(dperm);
  if (!match) throw new Error(`${name} not found in ${DPERM_PATH}`);
  return Number(match[1]);
}

const BASE = {
  origin: 'https://a.io',
  isMainFrame: true,
  granted: [] as string[],
  hasActiveAccount: true,
  pendingConsentOrigin: null as string | null,
};

describe('browser provider decision: shared vocabulary, TypeScript ↔ Rust core', () => {
  it('finds both sides (a moved file must not turn this suite into a no-op)', () => {
    expect(dperm).toContain('pub fn decide_browser_request');
    expect(router).toContain('export function decideBrowserRequest');
  });

  it('the browser decision is unreachable on web — the WebView is iOS/Android only', () => {
    // If this ever becomes true on web, `decideBrowserRequest` starts running
    // in the browser build and the "which copy decides" question above stops
    // being academic.
    expect(read(WEBVIEW_PATH)).toContain(
      "export const isWalletWebViewSupported = Platform.OS === 'ios' || Platform.OS === 'android'",
    );
  });

  it('the connect-method table is the same on both sides', () => {
    const rust = /pub const CONNECT_METHODS:\s*\[&str;\s*\d+\]\s*=\s*\[([\s\S]*?)\];/.exec(dperm);
    if (!rust) throw new Error(`CONNECT_METHODS not found in ${DPERM_PATH}`);
    const rustNames = [...rust[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const ts = /const CONNECT_METHODS = new Set\(\[([\s\S]*?)\]\);/.exec(router);
    if (!ts) throw new Error(`CONNECT_METHODS not found in ${ROUTER_PATH}`);
    const tsNames = [...ts[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(tsNames).toEqual(rustNames);
    expect(tsNames).toEqual(['eth_requestAccounts', 'wallet_requestPermissions']);
  });

  it('every refusal carries the SAME EIP-1193 code on both sides', () => {
    // 4900 vs 4001 is the load-bearing one: a dApp treats 4001 as safe to
    // retry, so answering an unknown-pending request with it invites a double
    // spend. The browser's own 4900 sites are asserted where they live
    // (`browser.tsx` NAV_SETTLE_ERROR); these three are the decision's.
    expect(rustCode('CODE_UNAUTHORIZED')).toBe(4100);
    expect(rustCode('CODE_USER_REJECTED')).toBe(4001);
    expect(rustCode('CODE_UNKNOWN_PENDING')).toBe(4900);

    // UnauthorizedFrame / InsecureOrigin → 4100
    expect(decideBrowserRequest({ ...BASE, method: 'eth_requestAccounts', isMainFrame: false }))
      .toEqual({ kind: 'reject', code: rustCode('CODE_UNAUTHORIZED'), message: 'Unauthorized frame' });
    expect(decideBrowserRequest({ ...BASE, method: 'personal_sign', origin: 'http://evil.io' }))
      .toEqual({
        kind: 'reject',
        code: rustCode('CODE_UNAUTHORIZED'),
        message: 'Signing is disabled on insecure (http) sites',
      });

    // NoAccountAvailable / ConsentBusy → 4001
    expect(decideBrowserRequest({ ...BASE, method: 'eth_requestAccounts', hasActiveAccount: false }))
      .toEqual({ kind: 'reject', code: rustCode('CODE_USER_REJECTED'), message: 'No account available' });
    expect(decideBrowserRequest({ ...BASE, method: 'eth_requestAccounts', pendingConsentOrigin: 'https://b.io' }))
      .toEqual({
        kind: 'reject',
        code: rustCode('CODE_USER_REJECTED'),
        message: 'Another connection request is pending',
      });
  });

  it('the Rust reason → code mapping still groups the reasons the same way', () => {
    const arms = /impl DpermRejectReason \{[\s\S]*?pub fn code\(self\) -> u32 \{([\s\S]*?)\n {4}\}/.exec(dperm);
    if (!arms) throw new Error(`DpermRejectReason::code not found in ${DPERM_PATH}`);
    const body = arms[1];
    // A reason quietly moving arm is exactly how a 4900 becomes a retryable
    // 4001 without anyone editing a number.
    expect(body).toMatch(/UnauthorizedFrame[\s\S]*?InsecureOrigin[\s\S]*?=> CODE_UNAUTHORIZED/);
    expect(body).toMatch(/NoAccountAvailable \| Self::ConsentBusy \| Self::UserRejected => CODE_USER_REJECTED/);
    expect(body).toMatch(/NavigatedAway \| Self::BrowserClosed => CODE_UNKNOWN_PENDING/);
  });

  it('the decision branches run in the same order on both sides', () => {
    // Order is a rule, not a style: `eth_accounts` must answer before the
    // connect branch (it never prompts), and the insecure-signing block must
    // run on the forward path rather than inside the consent branch.
    const rustOrder = [
      dperm.indexOf('if method == "eth_accounts"', dperm.indexOf('pub fn decide_browser_request')),
      dperm.indexOf('if method == "wallet_getPermissions"', dperm.indexOf('pub fn decide_browser_request')),
      dperm.indexOf('if is_connect_method(method)'),
      dperm.indexOf('if should_block_insecure_signing(method, origin)'),
    ];
    expect(rustOrder.every((i) => i > 0)).toBe(true);
    expect([...rustOrder].sort((a, b) => a - b)).toEqual(rustOrder);

    const tsOrder = [
      router.indexOf("if (method === 'eth_accounts')"),
      router.indexOf("if (method === 'wallet_getPermissions')"),
      router.indexOf('if (CONNECT_METHODS.has(method))'),
      router.indexOf('if (shouldBlockInsecureSigning(method, origin))'),
    ];
    expect(tsOrder.every((i) => i > 0)).toBe(true);
    expect([...tsOrder].sort((a, b) => a - b)).toEqual(tsOrder);
  });

  it('the iframe rule on the FORWARD path exists on both sides, at their two different layers', () => {
    // Rust folds it into the decision; TypeScript keeps it in the transport.
    // Deleting either one lets cross-origin iframe traffic into the signing
    // pipeline on that platform.
    expect(dperm).toMatch(/if should_block_insecure_signing[\s\S]{0,400}if !is_main_frame[\s\S]{0,120}UnauthorizedFrame/);
    expect(decideBrowserRequest({ ...BASE, method: 'eth_call', isMainFrame: false }))
      .toEqual({ kind: 'forward' });
    expect(read(TRANSPORT_PATH)).toMatch(/isMainFrame[\s\S]{0,400}4100/);
  });
});
