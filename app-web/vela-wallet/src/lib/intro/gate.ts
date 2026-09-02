/**
 * "Has this person been introduced yet?" (spec 020).
 *
 * The intro is a FIRST-RUN screen, not a recurring one: it plays once and never
 * again (founder direction, 2026-09-01 — "不然就很烦"). That makes it a
 * different rule from the launch animation next door, which replays after a
 * week, so the two gates stay separate flags rather than one shared "first run"
 * that would have to compromise between them.
 *
 * Storage is best-effort in exactly the way `$lib/launch/constants` is: private
 * modes and sandboxed frames throw on `localStorage`, and a wallet's front door
 * must not break because a decoration could not read a flag. When we cannot
 * tell, we show it — a second viewing is a cost; a broken first run is not.
 */

/** Where the "already seen it" flag lives. */
export const STORAGE_KEY = 'vela.intro.seen';

/** Deterministic disable, for e2e runs that want the Welcome page directly. */
export const SKIP_PARAM = 'skipIntro';

/** Deterministic ENABLE, so the intro can be looked at without clearing storage. */
export const FORCE_PARAM = 'intro';

export function shouldShowIntro(win: Window = window): boolean {
	try {
		const params = new URLSearchParams(win.location.search);
		if (params.has(FORCE_PARAM)) return true;
		if (params.has(SKIP_PARAM)) return false;
		return win.localStorage.getItem(STORAGE_KEY) === null;
	} catch {
		return true;
	}
}

export function markIntroSeen(win: Window = window, now: number = Date.now()): void {
	try {
		win.localStorage.setItem(STORAGE_KEY, String(now));
	} catch {
		// Unwritable storage means it may show again — cosmetic, not a failure.
	}
}
