// Ported from src/services/wallet-state-core/token-trust-session.ts @ c13e89d4 (spec 025).
/**
 * Constructs the `token_trust` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/token_trust.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the base64-embedded module at import time, so the wasm is
 * initialised before the core is constructed here.
 *
 * `token-trust-session.ts` is the native counterpart and throws.
 */

import { TokenTrustCore } from '$lib/core/client';

import { createJsonWasmShell } from '$lib/core/json-shell';
import type { EffectLoop } from '$lib/core/effect-loop';

import { executeTokenTrustOperation, tokenTrustOperationFailure } from './token-trust-executor';
import type { TrustEvent } from '$lib/core/generated/TrustEvent';
import type { TrustShellResult } from '$lib/core/generated/TrustShellResult';
import type { TrustView } from '$lib/core/generated/TrustView';
import type { TrustEffect, TokenTrustSessionOptions } from './token-trust-types';

export type TokenTrustSession = EffectLoop<TrustEvent>;

export function createTokenTrustSession(options: TokenTrustSessionOptions): TokenTrustSession {
	return createJsonWasmShell<TrustView, TrustEvent, TrustEffect, TrustShellResult>(
		new TokenTrustCore(),
		{
			onView: options.onView,
			execute: executeTokenTrustOperation,
			toFailure: tokenTrustOperationFailure,
			onError: options.onError
		}
	);
}
