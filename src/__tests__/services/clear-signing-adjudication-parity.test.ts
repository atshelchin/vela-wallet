// The message adjudication exists TWICE on purpose, and this pins the two together.
//
// Web runs the Rust `clear_signing` machine; iOS/Android cannot (Hermes has no
// WebAssembly) and run `services/clear-signing-adjudication.ts` instead. Neither
// copy can be deleted — so the thing to remove is not the duplication but the
// DRIFT. Same spirit as `approval-guard-parity.test.ts`.
//
// A red test here means the two platforms would disagree about a PHISHING
// verdict: relax the TS side and native stops painting the red banner (and stops
// buzzing) on a SIWE prompt web flags; relax the Rust side and the reverse.
//
// The Rust core is driven for real (through the web session), not transcribed
// into a snapshot someone can regenerate without looking at the other side.

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
import { adjudicateMessage, projectBlindTyped } from '@/services/clear-signing-adjudication';
import { createClearSigningSession } from '@/services/wallet-state-core/clear-session';
import type { ClearBlindTyped } from '@/services/wallet-state-core/generated/ClearBlindTyped';
import type { ClearMessageView } from '@/services/wallet-state-core/generated/ClearMessageView';
import type { ClearSigningEvent } from '@/services/wallet-state-core/generated/ClearSigningEvent';
import type { ClearSigningView } from '@/services/wallet-state-core/generated/ClearSigningView';

const LOCALE = {
  number_format: 'comma_dot',
  date_format: 'mdy_slash',
  time_format: 'h24',
  tz_offset_minutes: 0,
} as const;

const ME = '0x00000000000000000000000000000000000000aa';
const hexOf = (s: string) => `0x${Buffer.from(s, 'utf8').toString('hex')}`;

/** Drive the core once and take the view it commits synchronously. */
function coreView(event: ClearSigningEvent): ClearSigningView {
  let view: ClearSigningView | null = null;
  const session = createClearSigningSession({
    onView: (next) => { view = next; },
    onError: (error) => { throw error; },
  });
  session.start(event);
  const committed = view;
  session.dispose();
  if (!committed) throw new Error('no view committed');
  return committed;
}

function coreMessage(
  method: 'personal_sign' | 'eth_sign',
  params: string[],
  origin: string | null,
): ClearMessageView {
  const view = coreView({ type: 'message_presented', method, params, request_origin: origin });
  if (!view.message) throw new Error('no adjudication');
  return view.message;
}

function coreBlindTyped(json: string): ClearBlindTyped {
  const view = coreView({
    type: 'resolve_typed_data',
    typed_data_json: json,
    chain_id: 1,
    locale: LOCALE,
  });
  if (!view.blind_typed) throw new Error('no projection');
  return view.blind_typed;
}

const SIWE = [
  'app.uniswap.org wants you to sign in with your Ethereum account:',
  ME,
  '',
  'Sign in to Uniswap. This request will not trigger a blockchain transaction.',
  '',
  'URI: https://app.uniswap.org',
  'Version: 1',
  'Chain ID: 1',
  'Nonce: 8f2a41cd',
].join('\n');

// Every vector is a decision the two implementations must reach identically.
const MESSAGE_VECTORS: {
  name: string;
  method: 'personal_sign' | 'eth_sign';
  params: string[];
  origin: string | null;
}[] = [
  { name: 'SIWE bound to its origin', method: 'personal_sign', params: [hexOf(SIWE), ME], origin: 'https://app.uniswap.org' },
  { name: 'SIWE on a lookalike origin (phishing)', method: 'personal_sign', params: [hexOf(SIWE), ME], origin: 'https://uniswap-airdrop.xyz' },
  { name: 'SIWE with an unknown origin', method: 'personal_sign', params: [hexOf(SIWE), ME], origin: null },
  { name: 'SIWE with CRLF line endings', method: 'personal_sign', params: [hexOf(SIWE.replace(/\n/g, '\r\n')), ME], origin: 'https://uniswap-airdrop.xyz' },
  { name: 'a userinfo domain is not SIWE at all', method: 'personal_sign', params: [hexOf(SIWE.replace('app.uniswap.org wants', 'app.uniswap.org@evil.com wants')), ME], origin: 'https://evil.com' },
  { name: 'plain ASCII prose', method: 'personal_sign', params: [hexOf('Confirm you own this wallet — nonce 8f2a41cd')], origin: 'https://getvela.app' },
  { name: 'emoji + CJK message reads as text', method: 'personal_sign', params: [hexOf('Hello from biubiu.tools 👋 签名消息')], origin: 'https://getvela.app' },
  { name: 'a bare non-prefixed hexish word is TEXT', method: 'personal_sign', params: ['deadbeef'], origin: 'https://getvela.app' },
  { name: 'an odd-length 0x payload is TEXT', method: 'personal_sign', params: ['0xabc'], origin: 'https://getvela.app' },
  { name: 'an empty payload', method: 'personal_sign', params: ['0x'], origin: 'https://getvela.app' },
  { name: 'a disguised transfer calldata', method: 'personal_sign', params: ['0xa9059cbb00000000000000000000000000000000000000000000000000000000deadbeef'], origin: 'https://getvela.app' },
  { name: 'a long binary payload truncates its preview', method: 'personal_sign', params: [`0x${'ab'.repeat(64)}`], origin: 'https://getvela.app' },
  { name: 'eth_sign takes params[1]', method: 'eth_sign', params: [ME, '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658'], origin: 'https://getvela.app' },
  { name: 'a malformed single-param eth_sign falls back to params[0]', method: 'eth_sign', params: ['0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658'], origin: 'https://getvela.app' },
  { name: 'eth_sign never becomes a SIWE surface', method: 'eth_sign', params: [ME, hexOf(SIWE)], origin: 'https://app.uniswap.org' },
];

describe('message adjudication parity (Rust core ↔ native TypeScript)', () => {
  it.each(MESSAGE_VECTORS)('$name', ({ method, params, origin }) => {
    const core = coreMessage(method, params, origin);
    const native = adjudicateMessage(method, params, origin ?? undefined);
    expect(native).toEqual(core);
  });
});

const TYPED_VECTORS: { name: string; json: string }[] = [
  {
    name: 'an unknown order keeps payload order and mid-truncates its salt',
    json: JSON.stringify({
      primaryType: 'CustomOrder',
      domain: { name: 'Unknown Protocol', verifyingContract: '0x1234567890ABCDEF1234567890abcdef12345678' },
      message: {
        maker: '0xaF5e8917831Ef08A64e18b2Cde9f8f5D32C7b3e1',
        amount: '5000000000000000000',
        expiry: '1750000000',
        salt: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      },
    }),
  },
  {
    name: 'a sixth field is dropped, a nested struct becomes capped JSON',
    json: JSON.stringify({
      primaryType: 'PermitSingle',
      domain: { name: 'Permit2', verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
      message: {
        details: { token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000', expiration: 1799999999 },
        spender: '0x111111125421cA6dc452d289314280a0f8842A65',
        sigDeadline: 1799999999,
        a: true,
        b: null,
        c: 'sixth',
      },
    }),
  },
  { name: 'no domain at all', json: JSON.stringify({ primaryType: 'X', message: { a: 1 } }) },
  { name: 'an empty object', json: '{}' },
  { name: 'a non-object payload', json: '"just a string"' },
  { name: 'unparseable JSON', json: '{not json' },
];

describe('blind typed-data projection parity (Rust core ↔ native TypeScript)', () => {
  it.each(TYPED_VECTORS)('$name', ({ json }) => {
    expect(projectBlindTyped(json)).toEqual(coreBlindTyped(json));
  });
});
