/**
 * The signer and the signing sheet MUST branch on the same hex predicate.
 *
 * If they disagree, the sheet renders one thing and the passkey signs another,
 * and `parseSiwe`/`checkSiweDomainBinding` read a mangled string — the
 * anti-phishing check would compare a domain that was never in the message.
 * Regression guard for the US2 web swap (specs/001-rust-core-bindings), where
 * the signer gained a plain-text branch the display path did not have.
 */
import { isHexPayload, decodePersonalMessage } from '@/services/decode-sign-message';

/** Mirror of personalSignBytes in use-dapp-signing.ts (same predicate). */
function personalSignBytes(payload: string): Uint8Array {
  if (!isHexPayload(payload)) return new TextEncoder().encode(payload);
  const clean = payload.slice(2);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const hexOf = (s: string) =>
  '0x' + Array.from(utf8(s)).map((b) => b.toString(16).padStart(2, '0')).join('');

describe('isHexPayload', () => {
  it('accepts only 0x-prefixed even-length hex', () => {
    expect(isHexPayload('0xdeadbeef')).toBe(true);
    expect(isHexPayload('0x')).toBe(true); // empty message
    expect(isHexPayload('0xabc')).toBe(false); // odd length
    expect(isHexPayload('0xzz')).toBe(false); // not hex
  });

  it('treats an unprefixed all-hex string as TEXT, like MetaMask', () => {
    // A dApp asking to sign the literal word "deadbeef" must not have it
    // silently reinterpreted as four bytes.
    expect(isHexPayload('deadbeef')).toBe(false);
  });

  it('treats plain text as text', () => {
    expect(isHexPayload('Sign in to Example')).toBe(false);
    expect(isHexPayload('')).toBe(false);
  });
});

describe('signed bytes and displayed text agree', () => {
  const roundTrips = (payload: string) =>
    expect(decodePersonalMessage(payload)).toBe(
      new TextDecoder().decode(personalSignBytes(payload)),
    );

  it('hex-encoded ASCII', () => roundTrips(hexOf('Hello from biubiu.tools')));
  it('hex-encoded emoji and CJK', () => roundTrips(hexOf('你好 👋')));
  it('plain-text SIWE (even length)', () =>
    roundTrips('example.com wants you to sign in with your Ethereum account:'));
  it('plain-text SIWE (odd length)', () => roundTrips('example.com wants you to sign in'));
  it('unprefixed hexish text', () => roundTrips('deadbeef'));
  it('empty hex payload', () => roundTrips('0x'));

  it('keeps the SIWE domain intact for a plain-text payload', () => {
    // The bug this pins: hex-decoding plain text produced "0xexample.com …",
    // so the domain check compared "0xexample.com" against "example.com".
    const message = 'example.com wants you to sign in with your Ethereum account:\n0xabc';
    expect(decodePersonalMessage(message).startsWith('example.com')).toBe(true);
  });

  it('still shows a hex preview for genuinely binary payloads', () => {
    const rawHash = '0x' + 'ff'.repeat(32);
    expect(decodePersonalMessage(rawHash).startsWith('0x')).toBe(true);
  });
});
