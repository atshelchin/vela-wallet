import { describe, expect, it } from 'vitest';
import { FORCE_PARAM, SKIP_PARAM, STORAGE_KEY, markIntroSeen, shouldShowIntro } from './gate';

/** A `Window` stand-in with just the two surfaces the gate touches. */
function fakeWindow(search = '', stored: string | null = null) {
	let value = stored;
	return {
		location: { search },
		localStorage: {
			getItem: () => value,
			setItem: (_: string, next: string) => {
				value = next;
			}
		},
		read: () => value
	} as unknown as Window & { read: () => string | null };
}

/** Storage that throws, as it does in private modes and sandboxed frames. */
function hostileWindow() {
	return {
		location: { search: '' },
		localStorage: {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		}
	} as unknown as Window;
}

describe('intro gate', () => {
	it('shows on a browser that has never seen it', () => {
		expect(shouldShowIntro(fakeWindow())).toBe(true);
	});

	it('never shows again once marked — this is a first-run screen, not a weekly one', () => {
		const win = fakeWindow();
		markIntroSeen(win, 1_700_000_000_000);
		expect(shouldShowIntro(win)).toBe(false);
		// A year later it is still seen: unlike the launch animation, there is no
		// replay window.
		expect(shouldShowIntro(fakeWindow('', win.read()))).toBe(false);
	});

	it('records the timestamp, so a later policy change has something to read', () => {
		const win = fakeWindow();
		markIntroSeen(win, 42);
		expect(win.read()).toBe('42');
		expect(STORAGE_KEY).toBe('vela.intro.seen');
	});

	it(`?${SKIP_PARAM} suppresses it for a deterministic e2e run`, () => {
		expect(shouldShowIntro(fakeWindow(`?${SKIP_PARAM}`))).toBe(false);
	});

	it(`?${FORCE_PARAM} shows it even once seen, and wins over the skip`, () => {
		expect(shouldShowIntro(fakeWindow(`?${FORCE_PARAM}`, '1'))).toBe(true);
		expect(shouldShowIntro(fakeWindow(`?${FORCE_PARAM}&${SKIP_PARAM}`, '1'))).toBe(true);
	});

	it('shows it when storage cannot be read at all', () => {
		// Showing twice is cosmetic; a front door that throws is not.
		expect(shouldShowIntro(hostileWindow())).toBe(true);
		expect(() => markIntroSeen(hostileWindow())).not.toThrow();
	});
});
