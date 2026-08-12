/**
 * The `/pay` amount grammar on the NATIVE path.
 *
 * `/pay` links are pasted, forwarded and shortened by strangers, so the query
 * is untrusted input on a screen that leads straight to a locked Send. Before
 * spec 017 this path fed it to `BigInt` unguarded, which crashed the render on
 * `1e18` and read `0x10` as hex — a page that displayed `0x10` and encoded
 * 268,435,456 base units.
 *
 * These vectors are the same table `app_payment_request.rs` pins for the web
 * core; the two platforms must answer identically or a link means different
 * things depending on where it is opened.
 */
import { isStrictPayAmount } from '@/hooks/use-pay-request';
import { toBaseUnits } from '@/services/eip681';

const USDC = 6;

describe('/pay amount grammar (native)', () => {
  it('rejects everything the old parse mishandled', () => {
    // Crashed the render (BigInt SyntaxError).
    expect(isStrictPayAmount('1e18', USDC)).toBe(false);
    expect(isStrictPayAmount('1,5', USDC)).toBe(false);
    // Silently read as hex: displayed 0x10, encoded 268,435,456 base units.
    expect(isStrictPayAmount('0x10', USDC)).toBe(false);
    // Produced a negative amount.
    expect(isStrictPayAmount('-3', USDC)).toBe(false);
    expect(isStrictPayAmount('+3', USDC)).toBe(false);
    // Not a number at all.
    expect(isStrictPayAmount('NaN', USDC)).toBe(false);
    expect(isStrictPayAmount('١٢', USDC)).toBe(false);
    expect(isStrictPayAmount('.', USDC)).toBe(false);
  });

  it('rejects more precision than the asset carries', () => {
    // 7 fractional digits on a 6-decimal token: the old parse truncated
    // silently, so the encoded amount differed from the displayed one.
    expect(isStrictPayAmount('1.2345678', USDC)).toBe(false);
    expect(isStrictPayAmount('1.234567', USDC)).toBe(true);
  });

  it('accepts the shapes our own request builder can emit', () => {
    // The builder's sanitizer allows a bare leading dot and a trailing dot,
    // and links carrying them are already shared.
    expect(isStrictPayAmount('.5', USDC)).toBe(true);
    expect(isStrictPayAmount('1.', USDC)).toBe(true);
    expect(isStrictPayAmount('12.000001', USDC)).toBe(true);
    expect(isStrictPayAmount('0', USDC)).toBe(true);
  });

  it('converts accepted amounts to the exact base units', () => {
    // The whole point of the gate: what the page shows is what it encodes.
    expect(toBaseUnits('1.5', USDC).toString()).toBe('1500000');
    expect(toBaseUnits('12.000001', USDC).toString()).toBe('12000001');
    expect(toBaseUnits('.5', USDC).toString()).toBe('500000');
  });
});
