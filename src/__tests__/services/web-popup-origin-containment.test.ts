/**
 * The web popup's origin allowlist vs the core's insecure-origin rule.
 *
 * `isAllowedWebDAppOrigin` (web-popup-transport.ts) decides who may open the
 * wallet popup and hand it a request over `postMessage`. The Rust core has a
 * NEIGHBOURING rule — `dapp_permissions::is_insecure_public_origin` — that
 * decides whether an origin may SIGN in the native in-app browser. Two rules,
 * two subjects, no shared owner: neither is a copy of the other, so neither
 * can be deleted.
 *
 * What MUST hold between them is containment, and that is what this asserts,
 * against the REAL core over the real wasm — not a TypeScript restatement of
 * it:
 *
 *     admitted by the popup  ⟹  NOT an insecure public origin to the core
 *
 * If that ever inverts, the popup would be handing a MITM-able http page a
 * surface the wallet's own browser refuses to sign on. The reverse gap is
 * deliberate and is asserted below too (a LAN-served http dApp reaches the
 * native browser but not the web popup), so that "make them equal" is not
 * mistaken for a fix.
 *
 * Load-bearing import order, same as `dperm-popup-core.test.ts`: jest lists no
 * `.ts` in `moduleFileExtensions`, so the web entry must be imported by
 * explicit path first to run `initSync` on the planted wasm bytes.
 */
import '@/services/vela-core';
import { DappPermissionsCore } from '../../../rust/pkg-web/vela_core.js';

import { isAllowedWebDAppOrigin } from '@/services/web-popup-transport';

type Verdict = 'insecure_origin' | 'unauthorized_frame' | string;

/**
 * Ask the REAL core how it classifies this origin.
 *
 * `personal_sign` from a subframe is the cheapest path that reaches
 * `should_block_insecure_signing`: the insecure check runs BEFORE the frame
 * check in `decide_browser_request`, and a subframe skips the grant read
 * entirely, so one dispatch answers with no effect round trip and no seeding.
 * The reason therefore separates the two cases exactly:
 *   `insecure_origin`     → the core calls this origin an insecure public one
 *   `unauthorized_frame`  → it does not (it got past the insecure gate)
 */
function coreRejectReason(origin: string): Verdict {
  const core = new DappPermissionsCore();
  try {
    const out = JSON.parse(
      core.dispatch(
        JSON.stringify({
          type: 'provider_request',
          id: 'probe',
          method: 'personal_sign',
          params_json: '[]',
          origin,
          is_main_frame: false,
        }),
      ),
    ) as { effects: { operation: { type: string; payload?: { type: string; reason?: string } } }[] };

    const responds = out.effects.map((e) => e.operation).filter((o) => o.type === 'respond');
    if (responds.length !== 1) {
      throw new Error(`expected exactly one respond, got ${responds.length} for ${origin}`);
    }
    const payload = responds[0].payload;
    if (!payload || payload.type !== 'error' || !payload.reason) {
      throw new Error(`expected an error payload for ${origin}, got ${JSON.stringify(payload)}`);
    }
    return payload.reason;
  } finally {
    core.free();
  }
}

const coreCallsInsecure = (origin: string) => coreRejectReason(origin) === 'insecure_origin';

/** Everything the popup admits today, plus the shapes an attacker would try. */
const ADMITTED = [
  'https://app.example',
  'https://app.example:8443',
  'https://getvela.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
];

/** Refused by the popup. Mixed on purpose: some the core also refuses, some not. */
const REFUSED = [
  'http://evil.io',
  'http://localhost.evil.io',
  'http://127.0.0.1.evil.io',
  'http://10.0.0.1.evil.com',
  'http://999.1.1.1',
  'http://172.32.0.1',
  'file:///etc/passwd',
  'javascript:alert(1)',
  'not a url',
  '',
  // The private-LAN space: refused HERE, exempt in the core. The documented
  // one-directional gap.
  'http://10.0.0.1',
  'http://192.168.0.10',
  'http://172.31.255.255',
  'http://169.254.1.1',
  'http://dev.local',
  'http://[fd12::1]',
  'http://[fe80::2]',
];

describe('web popup origin gate ⊆ the core\'s secure origins', () => {
  it('the probe really reaches the core\'s insecure-origin branch', () => {
    // If this stopped discriminating, every containment assertion below would
    // pass vacuously.
    expect(coreRejectReason('http://evil.io')).toBe('insecure_origin');
    expect(coreRejectReason('https://app.example')).toBe('unauthorized_frame');
  });

  it.each(ADMITTED)('%s is admitted, and the core does NOT call it insecure', (origin) => {
    expect(isAllowedWebDAppOrigin(origin)).toBe(true);
    expect(coreCallsInsecure(origin)).toBe(false);
  });

  it.each(REFUSED)('%s is refused by the popup', (origin) => {
    expect(isAllowedWebDAppOrigin(origin)).toBe(false);
  });

  it('containment holds over the whole corpus', () => {
    for (const origin of [...ADMITTED, ...REFUSED]) {
      if (isAllowedWebDAppOrigin(origin)) {
        expect([origin, coreCallsInsecure(origin)]).toEqual([origin, false]);
      }
    }
  });

  it('the gap runs ONE way only — the popup is the stricter of the two', () => {
    // Private-LAN http: the native browser signs there (the on-device test dApp
    // is served over the LAN), the web popup does not. This asserts the
    // difference is real and in the safe direction, so nobody "fixes" it by
    // widening the popup.
    for (const origin of ['http://10.0.0.1', 'http://192.168.0.10', 'http://dev.local', 'http://[fe80::2]']) {
      expect([origin, isAllowedWebDAppOrigin(origin)]).toEqual([origin, false]);
      expect([origin, coreCallsInsecure(origin)]).toEqual([origin, false]);
    }
    // And where BOTH refuse, they refuse for the same reason.
    for (const origin of ['http://evil.io', 'http://127.0.0.1.evil.io', 'not a url']) {
      expect([origin, isAllowedWebDAppOrigin(origin)]).toEqual([origin, false]);
      expect([origin, coreCallsInsecure(origin)]).toEqual([origin, true]);
    }
  });
});
