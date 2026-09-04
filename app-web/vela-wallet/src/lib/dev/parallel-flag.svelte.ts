/**
 * Whether the parallel space is active — the ONE thing every page needs to
 * know about it.
 *
 * Deliberately tiny and dependency-free: the badge and the root layout import
 * this, while the fixture signer (which carries the P-256 library and the test
 * keys) lives behind a dynamic import in `parallel-space.ts`. That split is
 * what keeps the fixture keys out of every production page's startup chunk
 * while still letting the badge render unconditionally whenever the mode is on
 * — the audited failure was a wallet in the parallel space that looked real
 * (docs/project-takeover/04-production-readiness.md).
 *
 * The flag itself lives in localStorage so it survives a reload; this module
 * mirrors it into a rune so the badge follows it without polling.
 */

/** Same key the Expo app writes — the two clients read one flag. */
export const PARALLEL_FLAG_KEY = 'vela.parallelSpace';

const state = $state({ active: false });

/** Reactive: true while the fixture signer is (or should be) installed. */
export function parallelActive(): boolean {
	return state.active;
}

/** Set by `parallel-space.ts` on enter/exit/boot. */
export function setParallelActive(next: boolean): void {
	state.active = next;
}

/** The persisted flag, read straight from storage (no rune, no import cost). */
export function parallelFlagSet(): boolean {
	try {
		return localStorage.getItem(PARALLEL_FLAG_KEY) === '1';
	} catch {
		return false;
	}
}
