// The `dapp_permissions` core (Rust/wasm) answering the WEB popup entry.
//
// `web-request.tsx` is the only surface of this machine that renders on web
// (`browser.tsx` needs a native WebView — `isWalletWebViewSupported` is
// iOS/Android only), and everything it decides is a fund-safety decision:
//
//   - **A never-connected origin gets no address.** 4100, not a forward — the
//     popup deliberately drifts from the in-app browser here, which forwards
//     reads. Getting it wrong hands a site the wallet's address for free.
//   - **The forward is pinned to the GRANT's address.** Never the wallet's
//     active account: connect on one account, switch to another, and a silent
//     re-pin would sign from an account the site was never granted.
//   - **A request pinning some other address is refused.** 4100, never a
//     silent substitution of the signer the dApp did not ask for.
//   - **A cold/empty account read never revokes a grant.** A transient empty
//     state would otherwise log the user out of every open dApp.
//
// The rules live in Rust (`decide_popup_request` + `resolve_granted`); this
// asserts that the shell reaches the real ones, over the real wasm, with the
// real wire codec — not a TypeScript re-statement of them.

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized. Importing the web entry by explicit
// path first runs `initSync` on the planted bytes.
import '@/services/vela-core/index.web';
import { decidePopupRequest } from '@/services/wallet-state-core/dperm-popup.web';
import { dpermRejectMessage, toWireGrant } from '@/services/wallet-state-core/dperm-types';
import type { DAppGrant } from '@/services/dapp-permissions';

const ORIGIN = 'https://dapp.example';
const A1 = '0x1111111111111111111111111111111111111111';
const A2 = '0x2222222222222222222222222222222222222222';

function grant(address: string): DAppGrant {
  return { origin: ORIGIN, address, chainId: 8453, grantedAt: 1_754_700_000_000 };
}

function ask(
  method: string,
  stored: DAppGrant | null,
  currentAddresses: string[] | null,
  pinnedAddress?: string,
) {
  return decidePopupRequest({
    method,
    grant: toWireGrant(stored),
    currentAddresses,
    pinnedAddress,
  });
}

describe('dapp_permissions popup entry (web shell)', () => {
  test('a never-connected origin gets 4100 and no address', () => {
    const verdict = ask('personal_sign', null, [A1, A2]);
    expect(verdict.outcome).toEqual({
      type: 'reject',
      code: 4100,
      reason: 'not_connected',
    });
    expect(verdict.granted).toEqual([]);
    // The wording the popup has always sent, byte for byte.
    expect(dpermRejectMessage('not_connected')).toBe('Connect Vela Wallet to this site first');
  });

  test('connect on an unconnected origin asks the user instead of answering', () => {
    expect(ask('eth_requestAccounts', null, [A1]).outcome).toEqual({ type: 'consent' });
    expect(ask('wallet_requestPermissions', null, [A1]).outcome).toEqual({ type: 'consent' });
  });

  test('the forward is pinned to the granted address, not the active account', () => {
    // A2 is the wallet's first (and, on this screen, active) account; the
    // origin was granted A1.
    const verdict = ask('eth_sendTransaction', grant(A1), [A2, A1]);
    expect(verdict.outcome).toEqual({ type: 'forward_to_signing', granted_address: A1 });
    expect(verdict.granted).toEqual([A1]);
  });

  test('a pinned address that is not the granted one is refused 4100, never re-signed', () => {
    const verdict = ask('personal_sign', grant(A1), [A1, A2], A2);
    expect(verdict.outcome).toEqual({
      type: 'reject',
      code: 4100,
      reason: 'stale_authorized_address',
    });
    expect(dpermRejectMessage('stale_authorized_address')).toBe(
      'The requested account is no longer authorized',
    );

    // The SAME address in another case is the same address.
    const upper = `0x${A1.slice(2).toUpperCase()}`;
    expect(ask('personal_sign', grant(A1), [A1, A2], upper).outcome).toEqual({
      type: 'forward_to_signing',
      granted_address: A1,
    });
    // An absent pin (the SDK's empty string included) is not a mismatch.
    expect(ask('personal_sign', grant(A1), [A1, A2], '').outcome).toEqual({
      type: 'forward_to_signing',
      granted_address: A1,
    });
  });

  test('a grant whose account left the wallet exposes nothing', () => {
    const verdict = ask('eth_sendTransaction', grant(A2), [A1]);
    expect(verdict.outcome).toEqual({ type: 'reject', code: 4100, reason: 'not_connected' });
    expect(verdict.granted).toEqual([]);
  });

  test('a cold or empty account read trusts the grant instead of revoking it', () => {
    for (const addresses of [null, []]) {
      const verdict = ask('eth_sendTransaction', grant(A1), addresses);
      expect(verdict.outcome).toEqual({ type: 'forward_to_signing', granted_address: A1 });
      expect(verdict.granted).toEqual([A1]);
    }
  });

  test('connect on a granted origin answers in the shape the method asks for', () => {
    expect(ask('eth_requestAccounts', grant(A1), [A1, A2]).outcome).toEqual({
      type: 'respond',
      payload: { type: 'accounts', addresses: [A1] },
    });
    expect(ask('wallet_requestPermissions', grant(A1), [A1, A2]).outcome).toEqual({
      type: 'respond',
      payload: { type: 'permissions', granted: true },
    });
  });

  test('the grant codec carries every stored field across the wire', () => {
    expect(toWireGrant(grant(A1))).toEqual({
      origin: ORIGIN,
      address: A1,
      chain_id: 8453,
      granted_at_ms: 1_754_700_000_000,
    });
    expect(toWireGrant(null)).toBeNull();
  });
});
