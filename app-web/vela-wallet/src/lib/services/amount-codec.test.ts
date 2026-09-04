/**
 * The amount codec (spec 026 D25) — fund-safety-critical: the core states base
 * units as DECIMAL strings, every `safe-transaction.ts` consumer reads HEX.
 * Getting this wrong does not fail loudly; it signs a different number.
 */
import { describe, expect, it } from 'vitest';
import { decimalToHex, fromWireAmount, toShellCall } from './amount-codec';

describe('decimalToHex', () => {
	it('converts base units without loss, at every magnitude', () => {
		expect(decimalToHex('0')).toBe('0x0');
		expect(decimalToHex('1')).toBe('0x1');
		expect(decimalToHex('1500000000000000000')).toBe('0x14d1120d7b160000');
		// 1,000,000 USDC (6 decimals)
		expect(decimalToHex('1000000000000')).toBe('0xe8d4a51000');
		// max uint256 — the value a spender cap must survive verbatim
		const MAX = (2n ** 256n - 1n).toString();
		expect(decimalToHex(MAX)).toBe('0x' + 'f'.repeat(64));
	});
	it('tolerates whitespace and leading zeros the way the core writes them', () => {
		expect(decimalToHex(' 42 ')).toBe('0x2a');
		expect(decimalToHex('007')).toBe('0x7');
		expect(decimalToHex('')).toBe('0x0');
	});
	it('an unparsable value is 0x0 — never NaN, never a silent large number', () => {
		expect(decimalToHex('abc')).toBe('0x0');
		expect(decimalToHex('1.5')).toBe('0x0');
		expect(decimalToHex('1e18')).toBe('0x0');
	});
	it('a NEGATIVE amount stays unsignable rather than becoming a number', () => {
		// `BigInt('-1')` parses, so the ported converter emits `0x-1` — not valid
		// hex. Deliberately left as the Expo port wrote it: every downstream
		// consumer re-parses this string and THROWS on it, so a negative amount
		// fails loudly. Coercing it to `0x0` would silently sign a zero-value
		// transfer instead, which is the worse failure. Pinned so a future
		// "cleanup" cannot quietly turn a loud refusal into a wrong number.
		expect(decimalToHex('-1')).toBe('0x-1');
		expect(() => BigInt(decimalToHex('-1'))).toThrow();
	});
});

describe('fromWireAmount', () => {
	it('reads decimal wire amounts; a malformed one is 0n', () => {
		expect(fromWireAmount('1500000000000000000')).toBe(1_500_000_000_000_000_000n);
		expect(fromWireAmount(' 0 ')).toBe(0n);
		expect(fromWireAmount('junk')).toBe(0n);
		expect(fromWireAmount('')).toBe(0n);
	});
});

describe('toShellCall', () => {
	it('hex-encodes the value and passes to/data through untouched', () => {
		expect(toShellCall({ to: '0xabc', value: '1000000000000000000', data: '0xdead' })).toEqual({
			to: '0xabc',
			value: '0xde0b6b3a7640000',
			data: '0xdead'
		});
	});
	it('a zero-value contract call stays a zero-value contract call', () => {
		expect(toShellCall({ to: '0xabc', value: '0', data: '0xa9059cbb' })).toEqual({
			to: '0xabc',
			value: '0x0',
			data: '0xa9059cbb'
		});
	});
});
