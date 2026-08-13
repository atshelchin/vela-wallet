/**
 * The F9 caution banner, evaluated over the REAL Rust core's projection.
 *
 * `isPossibleDisguisedTransaction` is the one verdict `MessageSignView` still
 * decides for itself (it is a banner rule over a rendered string, not a gate —
 * see the ruling recorded in `services/decode-sign-message.ts`). Its existing
 * coverage, `sign-message-disguise-warning.test.ts`, builds the core's
 * projection out of the TypeScript `decodeSignMessage`. That is fine as far as
 * it goes, but it leaves the load-bearing sentence in that file's doc comment —
 * "web (Rust `analyze_message`) and native (the TS decode) feed it the
 * identical two fields" — asserted by construction only.
 *
 * This closes it from the other end: drive `clear_signing` for real, over the
 * real wasm, take `view.message` as the web build actually receives it, and put
 * the banner predicate on THAT.
 *
 * The two things it must never do are the reasons it exists:
 *   - go quiet where the core says the payload is opaque (`non_printable`), and
 *   - shout at a payload the signer treats as text (emoji / CJK are shown
 *     verbatim; a false alarm there trains users past the real one).
 */

// The clear-signing core asks the shell for descriptors / RPC / selectors. None
// of that is reachable (or wanted) for a `message_presented`, which the core
// answers synchronously — stubbed exactly as the adjudication parity suite does.
jest.mock('@/services/net', () => ({
  fetchWithTimeout: jest.fn(async () => ({ ok: false, text: async () => '' })),
  NET_TIMEOUTS: { descriptor: 5000 },
}));
jest.mock('@/services/rpc-pool', () => ({
  poolRpcCall: jest.fn(async () => ({ result: null })),
}));
jest.mock('@/services/selector-registry', () => ({
  lookupSelector: jest.fn(async () => []),
}));
jest.mock('@/services/storage', () => ({
  getEthereumDataURL: () => 'https://data.example',
}));

import '@/services/vela-core';
import { isPossibleDisguisedTransaction } from '@/services/decode-sign-message';
import { createClearSigningSession } from '@/services/wallet-state-core/clear-session';
import type { ClearMessageView } from '@/services/wallet-state-core/generated/ClearMessageView';
import type { ClearSigningView } from '@/services/wallet-state-core/generated/ClearSigningView';

const hexOf = (s: string) => `0x${Buffer.from(s, 'utf8').toString('hex')}`;

/** `personal_sign(payload)` through the real core; the view it commits. */
function coreMessage(payload: string): ClearMessageView {
  let view: ClearSigningView | null = null;
  const session = createClearSigningSession({
    onView: (next) => { view = next; },
    onError: (error) => { throw error; },
  });
  session.start({ type: 'message_presented', method: 'personal_sign', params: [payload], request_origin: null });
  const committed = view as ClearSigningView | null;
  session.dispose();
  if (!committed?.message) throw new Error(`no adjudication for ${payload}`);
  return committed.message;
}

/** Payloads chosen to straddle every branch of the predicate. */
const CORPUS: { name: string; payload: string; flagged: boolean }[] = [
  // Not `0x`-prefixed even-length hex → the signer signs the letters → never flagged.
  { name: 'plain prose', payload: 'Confirm you own this wallet — nonce 8f2a41cd', flagged: false },
  { name: 'CJK text', payload: '签名消息', flagged: false },
  { name: 'a hexish word with no 0x', payload: 'deadbeef', flagged: false },
  { name: 'an odd-length 0x payload', payload: '0xabc', flagged: false },
  // Hex the signer treats as bytes.
  { name: 'the empty payload', payload: '0x', flagged: false },
  { name: 'hex-encoded plain ASCII', payload: hexOf('Sign in to Uniswap. Nonce: 8f2a41cd'), flagged: false },
  { name: 'hex-encoded multi-line SIWE', payload: hexOf('example.com wants you to sign in\n\nURI: https://example.com'), flagged: false },
  { name: 'hex-encoded emoji', payload: hexOf('Hello from biubiu.tools 👋'), flagged: true },
  { name: 'hex-encoded CJK', payload: hexOf('签名消息'), flagged: true },
  { name: 'hex-encoded NBSP (invisible, not ASCII)', payload: hexOf('Sign in now'), flagged: true },
  { name: 'a disguised 32-byte hash', payload: `0x${'de1a'.repeat(16)}`, flagged: true },
  { name: 'disguised transfer calldata', payload: '0xa9059cbb00000000000000000000000000000000000000000000000000000000deadbeef', flagged: true },
];

describe('F9 disguise banner over the real clear_signing projection', () => {
  it.each(CORPUS)('$name', ({ payload, flagged }) => {
    expect(isPossibleDisguisedTransaction(coreMessage(payload))).toBe(flagged);
  });

  it('never goes quiet where the core itself calls the payload opaque', () => {
    // The banner is a superset of `non_printable` by construction. Asserted here
    // against the core's OWN flag, not a TypeScript re-derivation of it.
    let sawOpaque = false;
    for (const { payload } of CORPUS) {
      const view = coreMessage(payload);
      if (!view.non_printable) continue;
      sawOpaque = true;
      expect([payload, isPossibleDisguisedTransaction(view)]).toEqual([payload, true]);
    }
    expect(sawOpaque).toBe(true); // the corpus must keep exercising that branch
  });

  it('a payload the core renders as text is still shown as text', () => {
    // Issue #82 stands on the core side too: flagged and readable are not the
    // same axis, and the banner never forces the raw-hex fallback.
    const view = coreMessage(hexOf('Hello from biubiu.tools 👋'));
    expect(view.decoded_text).toBe('Hello from biubiu.tools 👋');
    expect(view.non_printable).toBe(false);
    expect(isPossibleDisguisedTransaction(view)).toBe(true);
  });
});
