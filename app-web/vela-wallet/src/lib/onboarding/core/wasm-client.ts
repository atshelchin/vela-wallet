/**
 * The onboarding core, in the browser — loaded on demand, never on Welcome.
 *
 * This is the one place in this app where vela-core runs at RUNTIME. Everywhere
 * else it runs at BUILD time: `$lib/i18n/engine.server.ts` resolves the 15
 * locales while prerendering and `$lib/wallet/identicon.server.ts` rasterizes,
 * and `e2e/welcome-ssr.e2e.ts` asserts the deployed Worker bundle contains no
 * wasm at all (Workers cannot compile wasm from bytes).
 *
 * Both facts stay true. Onboarding needs the create and login state machines
 * live, in the browser, because that is where the passkey ceremony happens —
 * so the module is fetched by the CLIENT, from our own origin, and only once
 * someone has committed to creating or signing in. The prerendered Welcome page
 * still loads no wasm; measure it with the network panel filtered to `.wasm`
 * before believing otherwise.
 *
 * The artifact is 3.4 MB and carries all 25 state machines (wasm is not
 * tree-shaken, so it arrives whole or not at all). That is the price of one
 * implementation of the rules; a smaller onboarding-only target is a build
 * pipeline change worth measuring against real load data, not guessing at now.
 */

import init, {
	buildGroupProof,
	buildMemberProof,
	CreateWalletCore,
	groupPublicKeyFromSeed,
	identiconNormalizeSeed,
	identiconSvgCircular,
	LoginCore,
	passkeyDirectoryEntry,
	passkeyDirectoryUrl,
	passkeyFallbackIconDataUri,
	passkeyProviderIconDataUri,
	SessionCore,
	toHex
} from '../../../../../../rust/pkg-web/vela_core.js';
import { WASM_URL } from '../../../../../../rust/pkg-web/vela_core_wasm_url.js';

export { CreateWalletCore, LoginCore, SessionCore };
// Pure kernels the executor needs alongside the machines: proof assembly and
// the group key's public half. They live in the same module and are only
// callable once `loadOnboardingCore()` has resolved.
export { buildGroupProof, buildMemberProof, groupPublicKeyFromSeed, toHex };
export { identiconNormalizeSeed, identiconSvgCircular };
// The passkey provider's mark, from the vendored AAGUID catalog. Offline by
// construction — the alternative is telling a directory service which vault
// holds this wallet's key.
export { passkeyProviderIconDataUri };
// The security-key artwork for a key the catalog cannot name — the one unknown
// whose KIND is still known, because the authenticator said so.
export { passkeyFallbackIconDataUri };
// The directory service, for models no compiled catalog can name. The core
// decides what is worth asking and what counts as an answer.
export { passkeyDirectoryEntry, passkeyDirectoryUrl };

/**
 * The in-flight (or settled) initialization. Held as a promise rather than a
 * boolean so two screens starting at once share one fetch instead of racing
 * `init` twice — wasm-bindgen tolerates the second call, but not the second
 * download.
 */
let pending: Promise<void> | null = null;

/**
 * Fetch and instantiate the core. Idempotent, and safe to call from every
 * entry point that is about to construct one.
 *
 * Throws only if the module cannot be fetched or instantiated — a genuine
 * "this browser cannot run the wallet" fault, not a user error, so callers
 * surface it rather than converting it into a flow state.
 */
export function loadOnboardingCore(): Promise<void> {
	if (pending) return pending;
	const started = init({ module_or_path: WASM_URL }).then(() => undefined);
	// A failed load must not be cached as "done": the next attempt should be
	// able to retry rather than construct a core over an uninitialized module
	// and fail with something unreadable.
	started.catch(() => {
		if (pending === started) pending = null;
	});
	pending = started;
	return started;
}

/** Test seam: forget the cached initialization. Not used by product code. */
export function resetOnboardingCoreForTests(): void {
	pending = null;
}
