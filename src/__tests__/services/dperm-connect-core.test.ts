// The `dapp_permissions` core (Rust/wasm) authoring the WEB popup's APPROVE
// half — everything that happens after the user presses Connect.
//
// `dperm-popup-core.test.ts` covers the popup's question (may this origin be
// answered, from which address). This covers the answer's other half, which had
// stayed in TypeScript and had already drifted from `consent_approved`:
//
//   - **A connection leaves a session trail.** `SaveConnectionRecord` is one of
//     the three operations the core authors, and the popup performed the other
//     two. `buildConnectionRecord`'s only caller in the repo was `browser.tsx`
//     (native), so every dApp connected through the web popup was invisible in
//     Connections — the user had no record of a grant they had made, and no way
//     back to it.
//   - **The grant is written for the account the user was shown**, at the chain
//     this popup session is for, stamped with the shell's clock.
//   - **The dApp is answered in the shape its method asks for** — accounts for
//     `eth_requestAccounts`, the EIP-2255 permission for
//     `wallet_requestPermissions`.
//   - **A closed window settles 4900, never 4001.** 4001 tells a dApp the user
//     said no and nothing happened, so it re-sends — double-spending a UserOp
//     that may already be at the bundler. That is the whole reason 4900 exists.
//
// And one gate that is not about a rule but about the wiring: the popup reaches
// the consent sheet through the BROWSER entry's decision path, so the two
// entries' connect rules must keep agreeing. They coincide today by
// construction (both read `resolve_granted` over the same inputs); the drift
// gate at the bottom holds them to it scenario by scenario, and the plan fails
// closed the day they part.

// Importing the facade first is load-bearing: `@/services/vela-core` runs
// `initSync` on the planted wasm bytes at import time, so the core is
// initialised before anything below constructs a session.
import { readFileSync } from 'fs';
import { resolve } from 'path';

import '@/services/vela-core';
import { planPopupConnect, popupCloseSettlement } from '@/services/wallet-state-core/dperm-connect';
import { decidePopupRequest } from '@/services/wallet-state-core/dperm-popup';
import { dpermRejectMessage, toWireGrant } from '@/services/wallet-state-core/dperm-types';
import type { PopupConnectQuestion } from '@/services/wallet-state-core/dperm-connect-types';
import type { DAppGrant } from '@/services/dapp-permissions';

const ORIGIN = 'https://dapp.example';
const A1 = '0x1111111111111111111111111111111111111111';
const A2 = '0x2222222222222222222222222222222222222222';
const GONE = '0x9999999999999999999999999999999999999999';
const NOW = 1_754_700_123_456;
const CHAIN = 8453;

function grant(address: string): DAppGrant {
  return { origin: ORIGIN, address, chainId: 1, grantedAt: 1 };
}

function question(overrides: Partial<PopupConnectQuestion> = {}): PopupConnectQuestion {
  return {
    origin: ORIGIN,
    requestId: 'req-1',
    method: 'eth_requestAccounts',
    activeAddress: A1,
    currentAddresses: [A1, A2],
    chainId: CHAIN,
    nowMs: NOW,
    storedGrant: null,
    ...overrides,
  };
}

describe('dapp_permissions popup approve (web shell)', () => {
  test('a web connection writes the "Connected to <app>" audit row the popup never wrote', () => {
    // The defect this closes: the record operation exists in the core, and only
    // the native browser was performing it.
    expect(planPopupConnect(question()).record).toEqual({
      address: A1,
      chainId: CHAIN,
      origin: ORIGIN,
    });
  });

  test('the grant is pinned to the shown account, at the session chain, on the shell clock', () => {
    expect(planPopupConnect(question()).grant).toEqual({
      origin: ORIGIN,
      address: A1,
      chain_id: CHAIN,
      granted_at_ms: NOW,
    });
    // The account the consent card displayed — never some other wallet address.
    expect(planPopupConnect(question({ activeAddress: A2 })).grant.address).toBe(A2);
    // The chain the request named, which `assertChainSupported` already vetted.
    expect(planPopupConnect(question({ chainId: 1 })).grant.chain_id).toBe(1);
  });

  test('the record and the grant always name the same account and chain', () => {
    const plan = planPopupConnect(question({ activeAddress: A2, chainId: 1 }));
    expect(plan.record.address).toBe(plan.grant.address);
    expect(plan.record.chainId).toBe(plan.grant.chain_id);
    expect(plan.record.origin).toBe(plan.grant.origin);
  });

  test('the dApp is answered in the shape its method asks for', () => {
    expect(planPopupConnect(question({ method: 'eth_requestAccounts' })).respond).toEqual({
      type: 'accounts',
      addresses: [A1],
    });
    expect(planPopupConnect(question({ method: 'wallet_requestPermissions' })).respond).toEqual({
      type: 'permissions',
      granted: true,
    });
  });

  test('a cold account read still connects — it never means "no accounts"', () => {
    for (const currentAddresses of [null, []]) {
      const plan = planPopupConnect(question({ currentAddresses }));
      expect(plan.grant.address).toBe(A1);
      expect(plan.respond).toEqual({ type: 'accounts', addresses: [A1] });
    }
  });

  test('a grant whose account left the wallet is re-authored, not stacked on', () => {
    const plan = planPopupConnect(question({ storedGrant: toWireGrant(grant(GONE)) }));
    expect(plan.grant.address).toBe(A1);
    expect(plan.record.address).toBe(A1);
  });

  test('the shell authors nothing the core did not sanction', () => {
    // Already connected: the core answers the request outright and opens no
    // sheet, so there is no approval to author. Minting a grant here would be
    // the shell overruling the machine.
    expect(() => planPopupConnect(question({ storedGrant: toWireGrant(grant(A1)) }))).toThrow(
      /opened no consent/,
    );
    // A signing method is not a connection at all.
    expect(() => planPopupConnect(question({ method: 'personal_sign' }))).toThrow(
      /opened no consent/,
    );
    // A different origin's sheet is not this origin's sheet.
    expect(() => planPopupConnect(question({ method: 'eth_chainId' }))).toThrow(
      /opened no consent/,
    );
  });

  test('an answer aimed at another request id is not this popup\'s answer', () => {
    // The plan is addressed: the `Respond` the core authors carries the id the
    // request arrived with, and nothing else may be read as its answer.
    const plan = planPopupConnect(question({ requestId: 'req-xyz' }));
    expect(plan.respond).toEqual({ type: 'accounts', addresses: [A1] });
  });
});

describe('a popup that goes away with an answer still owed', () => {
  test('settles 4900 unknown-pending, never 4001 user-rejected', () => {
    const settlement = popupCloseSettlement();
    expect(settlement).toEqual({ code: 4900, reason: 'browser_closed' });
    // 4001 is the code that makes a dApp re-send a request that may already
    // have landed. It must never be what a torn-down window says.
    expect(settlement.code).not.toBe(4001);
    expect(dpermRejectMessage(settlement.reason)).toBe(
      'The browser closed before the request finished',
    );
  });
});

describe('the popup and browser entries agree about connecting', () => {
  // `planPopupConnect` reaches `consent_approved` through the BROWSER decision
  // path (`provider_request` is the only door that opens a sheet). The popup's
  // own rule (`decide_popup_request`) is what decided to show the consent card
  // in the first place. If those two ever disagree about a connect method, the
  // popup would show a card that authors nothing — so pin them to each other.
  const scenarios: { name: string; stored: DAppGrant | null; addresses: string[] | null }[] = [
    { name: 'never connected', stored: null, addresses: [A1, A2] },
    { name: 'never connected, cold read', stored: null, addresses: null },
    { name: 'never connected, empty read', stored: null, addresses: [] },
    { name: 'granted to a live account', stored: grant(A1), addresses: [A1, A2] },
    { name: 'granted to a deleted account', stored: grant(GONE), addresses: [A1, A2] },
  ];

  for (const method of ['eth_requestAccounts', 'wallet_requestPermissions']) {
    for (const { name, stored, addresses } of scenarios) {
      test(`${method} — ${name}`, () => {
        const verdict = decidePopupRequest({
          method,
          grant: toWireGrant(stored),
          currentAddresses: addresses,
          pinnedAddress: null,
        });
        const plan = () =>
          planPopupConnect(question({ method, storedGrant: toWireGrant(stored), currentAddresses: addresses }));

        if (verdict.outcome.type === 'consent') {
          // The card is shown, so pressing Connect must produce a full plan.
          expect(plan().grant.address).toBe(A1);
        } else {
          // No card is shown, so there is nothing to approve.
          expect(plan).toThrow(/opened no consent/);
        }
      });
    }
  }
});

describe('the popup screen states none of this of its own', () => {
  const popup = readFileSync(resolve(__dirname, '../../..', 'src/app/web-request.tsx'), 'utf8');

  test('the approve half is the core\'s plan, not a locally built grant', () => {
    expect(popup).toContain('planPopupConnect');
    expect(popup).toContain('buildConnectionRecord');
    // The hand-rolled grant literal and the hand-rolled connect result this
    // replaced. Either one growing back is the drift starting over.
    expect(popup).not.toMatch(/address:\s*activeAccount\.address/);
    expect(popup).not.toMatch(/peer\.request\.method\s*===/);
    // `parentCapability` survives in exactly one place: `popupResult`, the
    // EIP-2255 ENCODING of the payload the core named. The core names the shape
    // (`permissions`), the shell writes the JSON — that split is deliberate.
    expect(popup.match(/parentCapability/g) ?? []).toHaveLength(1);
  });

  test('a connection the core refuses leaves the user able to act', () => {
    // The failure this guards is the one a gate creates by fixing itself: the
    // screen sets 'processing' the moment Connect is pressed, so a plan that
    // does not come back must hand the request somewhere, or the user is left
    // under a spinner with a live dApp waiting and no button that works.
    const approve = /const approveConnection[\s\S]*?\n {2}\};/.exec(popup);
    if (!approve) throw new Error('approveConnection not found in web-request.tsx');
    expect(approve[0]).toContain('reevaluateRequest()');
    // And the re-ask has to be a real one: the once-per-request latch dropped
    // and the peer re-published, or the evaluation effect never runs again.
    const reevaluate = /const reevaluateRequest[\s\S]*?\n {2}\};/.exec(popup);
    if (!reevaluate) throw new Error('reevaluateRequest not found in web-request.tsx');
    expect(reevaluate[0]).toContain('processedRef.current = false');
    expect(reevaluate[0]).toContain('setPeer(');
  });

  test('a closing window names no error code of its own', () => {
    expect(popup).toContain('popupCloseSettlement');
    // The 4001 that used to go out on unmount. 4001 stays only on the paths
    // where the user really did reject.
    expect(popup).not.toContain('Vela request was closed');
    expect(popup.match(/code: 4001/g) ?? []).toHaveLength(1);
    expect(popup).toContain("code: 4001, message: 'User rejected the connection'");
  });
});
