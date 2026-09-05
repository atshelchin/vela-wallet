/**
 * The preferences that have no machine (spec 028 T435 — research D48).
 *
 * Small surface, three properties worth pinning: a stored value we do not ship
 * cannot become the app's state, the record format is Expo's (so a phone and a
 * browser would read each other), and `system` UNPINS the theme rather than
 * writing out a resolved one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store is browser-only by construction — every read, write and theme
// application is behind SvelteKit's `browser` flag, because a prerender has no
// `localStorage` and no document to pin a palette on. These tests are about
// what happens in a browser, so they say so.
vi.mock('$app/environment', () => ({ browser: true }));

import { PREF_KEYS, preferences } from './preferences.svelte';

function fakeLocalStorage(seed: Record<string, string> = {}) {
	const map = new Map(Object.entries(seed));
	return {
		get length() {
			return map.size;
		},
		key: (i: number) => [...map.keys()][i] ?? null,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
		snapshot: () => Object.fromEntries(map)
	};
}

/** `applyTheme` writes to the document; a bare object is enough to watch it. */
function fakeDocument() {
	return { documentElement: { dataset: {} as Record<string, string> } };
}

beforeEach(() => {
	preferences.resetForTests();
	vi.unstubAllGlobals();
});

describe('what is read back', () => {
	it('takes the stored record, in the shape the phone writes', () => {
		vi.stubGlobal(
			'localStorage',
			fakeLocalStorage({
				[PREF_KEYS.theme]: 'dark',
				[PREF_KEYS.avatarStyle]: 'initials',
				[PREF_KEYS.language]: 'ja',
				[PREF_KEYS.localePrefs]: JSON.stringify({
					numberFormat: 'dot_comma',
					dateFormat: 'iso',
					timeFormat: 'h12'
				})
			})
		);
		vi.stubGlobal('document', fakeDocument());
		preferences.boot();
		expect(preferences.theme).toBe('dark');
		expect(preferences.avatarStyle).toBe('initials');
		expect(preferences.language).toBe('ja');
		expect(preferences.numberFormat).toBe('dot_comma');
		expect(preferences.dateFormat).toBe('iso');
		expect(preferences.timeFormat).toBe('h12');
	});

	it('refuses a value we do not ship, rather than adopting it', () => {
		// A hand-edited or future record must not put the app in a state no
		// screen can render.
		vi.stubGlobal(
			'localStorage',
			fakeLocalStorage({
				[PREF_KEYS.theme]: 'sepia',
				[PREF_KEYS.avatarStyle]: 'photo',
				[PREF_KEYS.localePrefs]: JSON.stringify({ numberFormat: 'roman' })
			})
		);
		vi.stubGlobal('document', fakeDocument());
		preferences.boot();
		expect(preferences.theme).toBe('system');
		expect(preferences.avatarStyle).toBe('identicon');
		expect(preferences.numberFormat).toBe('auto');
	});

	it('a torn record reads as the defaults, which is what it means', () => {
		vi.stubGlobal('localStorage', fakeLocalStorage({ [PREF_KEYS.localePrefs]: '{not json' }));
		vi.stubGlobal('document', fakeDocument());
		expect(() => preferences.boot()).not.toThrow();
		expect(preferences.numberFormat).toBe('auto');
	});

	it('reads once: a second boot cannot undo a choice already made', () => {
		const store = fakeLocalStorage({ [PREF_KEYS.theme]: 'dark' });
		vi.stubGlobal('localStorage', store);
		vi.stubGlobal('document', fakeDocument());
		preferences.boot();
		preferences.setTheme('light');
		preferences.boot();
		expect(preferences.theme).toBe('light');
	});
});

describe('what is written', () => {
	it('keeps the three formats in ONE record, the way Expo stores them', () => {
		const store = fakeLocalStorage();
		vi.stubGlobal('localStorage', store);
		vi.stubGlobal('document', fakeDocument());
		preferences.boot();
		preferences.setNumberFormat('indian');
		preferences.setTimeFormat('h24');
		expect(JSON.parse(store.getItem(PREF_KEYS.localePrefs) as string)).toEqual({
			numberFormat: 'indian',
			dateFormat: 'auto',
			timeFormat: 'h24'
		});
	});

	it('pins a theme on the document, and `system` UNPINS it', () => {
		// The unpin matters: a resolved "dark" written for `system` would stop
		// following an OS that changes at sunset, which is the whole meaning of
		// the choice.
		const doc = fakeDocument();
		vi.stubGlobal('localStorage', fakeLocalStorage());
		vi.stubGlobal('document', doc);
		preferences.boot();
		preferences.setTheme('light');
		expect(doc.documentElement.dataset.theme).toBe('light');
		preferences.setTheme('system');
		expect(doc.documentElement.dataset.theme).toBeUndefined();
	});

	it('a browser that refuses storage still honours the choice for this visit', () => {
		const denied = fakeLocalStorage();
		denied.setItem = () => {
			throw new Error('QuotaExceededError');
		};
		vi.stubGlobal('localStorage', denied);
		vi.stubGlobal('document', fakeDocument());
		preferences.boot();
		expect(() => preferences.setAvatarStyle('initials')).not.toThrow();
		expect(preferences.avatarStyle).toBe('initials');
	});
});
