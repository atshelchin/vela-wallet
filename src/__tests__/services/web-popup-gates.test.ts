/**
 * The web popup's two front-door gates, each pinned to ONE statement of itself.
 *
 * The popup (`app/web-request.tsx`) is the only surface where a page the wallet
 * does not control hands it a request over `postMessage`, so both of its
 * pre-checks are fund-safety code:
 *
 * **1. The origin gate.** `isAllowedWebDAppOrigin` decides which origins may
 * drive the popup at all: https, or http on a loopback host (dev). It was
 * written a second time inside `web-request.tsx` for the dApp's logo, and the
 * copy had already drifted — it never learned `[::1]`. The copy is gone; this
 * asserts both that the predicate still means what it must AND that the second
 * list has not grown back.
 *
 * A third https-or-localhost check exists in `packages/vela-sdk/src/index.ts`,
 * and it is deliberately NOT unified here: it validates the WALLET url the
 * dApp was configured with (a different subject, in a package that ships to
 * third-party sites and may not import wallet code). Sharing an allowlist
 * across that boundary would be the wrong kind of coupling.
 *
 * **2. The 4902 pre-check.** An unsupported chain is refused before any
 * transport is built, so the popup can show its own "unsupported network"
 * screen instead of answering the dApp with a bare error. The core refuses the
 * same request the same way (`sign_request.rs`, `on_request_arrived`) if one
 * ever gets past — two evaluations of one rule, kept honest by the fact that
 * the supported-chain TABLE is single-sourced (`getAllNetworksSync()` feeds
 * both) and the error CODE is asserted equal below.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { isAllowedWebDAppOrigin } from '@/services/web-popup-transport';

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const POPUP_PATH = 'src/app/web-request.tsx';
const SIGNING_PATH = 'src/hooks/use-dapp-signing.ts';
const SIGN_REQUEST_PATH = 'rust/crates/vela-core/src/app/sign_request.rs';
const RESIDENT_PATH = 'src/services/wallet-state-core/sign-resident.ts';

const popup = read(POPUP_PATH);
const signing = read(SIGNING_PATH);
const signRequest = read(SIGN_REQUEST_PATH);
const resident = read(RESIDENT_PATH);

describe('web popup origin gate', () => {
  it('accepts https on any host', () => {
    expect(isAllowedWebDAppOrigin('https://app.example')).toBe(true);
    expect(isAllowedWebDAppOrigin('https://app.example:8443')).toBe(true);
  });

  it('accepts http only on a loopback host (dev)', () => {
    expect(isAllowedWebDAppOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedWebDAppOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isAllowedWebDAppOrigin('http://[::1]:3000')).toBe(true);
  });

  it('refuses public http and anything it cannot parse', () => {
    // A MITM on the page that asked is exactly the threat.
    expect(isAllowedWebDAppOrigin('http://evil.io')).toBe(false);
    // A hostname that merely STARTS with a loopback name is a public FQDN.
    expect(isAllowedWebDAppOrigin('http://localhost.evil.io')).toBe(false);
    expect(isAllowedWebDAppOrigin('http://127.0.0.1.evil.io')).toBe(false);
    expect(isAllowedWebDAppOrigin('file:///etc/passwd')).toBe(false);
    expect(isAllowedWebDAppOrigin('javascript:alert(1)')).toBe(false);
    expect(isAllowedWebDAppOrigin('not a url')).toBe(false);
    expect(isAllowedWebDAppOrigin('')).toBe(false);
  });

  it('the popup screen states the allowlist NOWHERE of its own', () => {
    // The drifted copy this replaced. If a protocol/loopback list reappears in
    // the screen, it will drift again — route it through the gate instead.
    expect(popup).toContain('isAllowedWebDAppOrigin');
    expect(popup).not.toMatch(/protocol\s*===\s*'https:'/);
    expect(popup).not.toMatch(/hostname\s*===\s*'localhost'/);
    expect(popup).not.toMatch(/hostname\s*===\s*'127\.0\.0\.1'/);
  });
});

describe('web popup unsupported-chain (4902) pre-check', () => {
  it('uses the same EIP-3085 code the core answers with', () => {
    const ts = /UNSUPPORTED_CHAIN_ERROR_CODE = (\d+)/.exec(signing);
    if (!ts) throw new Error(`UNSUPPORTED_CHAIN_ERROR_CODE not found in ${SIGNING_PATH}`);
    const rust = /pub const CODE_UNSUPPORTED_CHAIN:\s*i32\s*=\s*(\d+)\s*;/.exec(signRequest);
    if (!rust) throw new Error(`CODE_UNSUPPORTED_CHAIN not found in ${SIGN_REQUEST_PATH}`);
    expect(Number(ts[1])).toBe(Number(rust[1]));
    expect(Number(rust[1])).toBe(4902);
    // The popup falls back to the same number when the thrown error carries none.
    expect(popup).toContain('4902');
  });

  it('both evaluations read the SAME supported-chain list', () => {
    // This is what keeps the double check harmless: the shell's
    // `assertChainSupported` and the core's `chain_supported` are two
    // predicates over one table. If either stopped sourcing
    // `getAllNetworksSync()`, the popup could refuse a chain the core accepts
    // (or worse, the reverse).
    expect(signing).toMatch(/export function assertChainSupported[\s\S]{0,200}getAllNetworksSync\(\)/);
    expect(resident).toMatch(/function supportedChainIds\(\)[\s\S]{0,160}getAllNetworksSync\(\)/);
    expect(resident).toContain("type: 'networks_changed'");
  });
});
