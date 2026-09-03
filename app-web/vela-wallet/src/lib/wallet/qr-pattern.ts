/**
 * The deterministic demo QR pattern (spec 015 data-model.md, extracted here in
 * spec 021 so the receive card and the placeholder share one generator).
 *
 * Three standard finder squares plus xorshift32-seeded noise. Identical on
 * every platform and every run, so screenshots diff cleanly. It never encodes
 * data — spec 021 keeps real QR encoding out of scope, and a pattern that
 * looked scannable but wasn't would be worse than one that plainly isn't.
 */

/** Spec 015's placeholder geometry. Changing these changes shipped screenshots. */
export const PLACEHOLDER_MODULES = 21;
export const PLACEHOLDER_SEED = 0x5eed;

/**
 * Spec 021's receive card. Denser than the placeholder because R2 draws the
 * code at 344px, where 21 modules read as a chequerboard rather than a code.
 */
export const RECEIVE_MODULES = 29;
export const RECEIVE_SEED = 0xbeef;

export function qrPattern(modules: number, seed: number): boolean[][] {
	let s = seed >>> 0;
	const next = () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s;
	};
	const n = modules;
	const inFinder = (r: number, c: number) =>
		(r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
	const finderOn = (r: number, c: number) => {
		const lr = r < 7 ? r : r - (n - 7);
		const lc = c < 7 ? c : c - (n - 7);
		const ring = Math.min(lr, lc, 6 - lr, 6 - lc);
		return ring !== 1;
	};
	return Array.from({ length: n }, (_, r) =>
		Array.from({ length: n }, (_, c) =>
			inFinder(r, c) ? finderOn(r, c) : (next() & 3) === 0 ? false : next() % 2 === 0
		)
	);
}
