/**
 * Which wallet this browser is signed into.
 *
 * App-resident: constructed once per page load and outliving every screen,
 * because "am I signed in" is not a property of any one screen. Both onboarding
 * flows end by handing their wallet here (`CompleteOnboarding` →
 * `AccountEstablished`), and this is what makes a wallet survive a reload.
 *
 * The core decides WHAT is allowed (`allowed_route`); this module only reports
 * it. Navigation stays the caller's, so a screen can finish an animation before
 * obeying.
 */

import { loadOnboardingCore, SessionCore } from '$lib/onboarding/core/wasm-client';
import { createJsonWasmShell } from '$lib/core/json-shell';
import type { EffectLoop } from '$lib/core/effect-loop';
import { executeSession, sessionFailure, type SessionEffect } from './executor';

import type { CompletionMode } from '../generated/CompletionMode';
import type { SessionEvent } from '../generated/SessionEvent';
import type { SessionShellResult } from '../generated/SessionShellResult';
import type { SessionView } from '../generated/SessionView';

/** Before the core has been asked anything: the route guard's own "wait". */
const BOOTING: SessionView = {
	loading: true,
	has_wallet: false,
	address: '',
	active_index: 0,
	accounts: [],
	allowed_route: 'loading',
	sign_out: null
};

class Session {
	view = $state<SessionView>(BOOTING);
	#loop: EffectLoop<SessionEvent> | null = null;
	#booted: Promise<void> | null = null;

	/**
	 * Read storage and settle on a route. Idempotent — every screen that needs
	 * the answer may call it, and they share one boot.
	 */
	boot(): Promise<void> {
		if (this.#booted) return this.#booted;
		this.#booted = (async () => {
			await loadOnboardingCore();
			this.#loop = createJsonWasmShell<
				SessionView,
				SessionEvent,
				SessionEffect,
				SessionShellResult
			>(new SessionCore(), {
				onView: (view) => {
					this.view = view;
				},
				execute: (effect) => executeSession(effect),
				toFailure: sessionFailure
			});
			this.#loop.start({ type: 'boot' });
		})();
		return this.#booted;
	}

	/** Onboarding's exit. The core persists; this only forwards. */
	accountEstablished(mode: CompletionMode): void {
		this.#loop?.dispatch({ type: 'account_established', mode });
	}

	switchAccount(index: number): void {
		this.#loop?.dispatch({ type: 'switch_account', index });
	}

	signOut(): void {
		this.#loop?.dispatch({ type: 'sign_out' });
	}

	confirmSignOut(): void {
		this.#loop?.dispatch({ type: 'sign_out_confirmed' });
	}

	dismissSignOut(): void {
		this.#loop?.dispatch({ type: 'sign_out_dismissed' });
	}
}

/**
 * The one session. A module-level singleton is right here and would be wrong
 * for a create or login machine: those are per-screen and must not survive
 * being left, while this one must.
 *
 * Only ever touched in the browser — `boot()` loads wasm, which the prerender
 * must not do — so callers guard on mount rather than at import.
 */
export const session = new Session();
