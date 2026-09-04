import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * `design/onboarding/launch` is the repo-wide source of truth for animations
 * (spec 012 FR-001) and lives OUTSIDE this app. Aliasing it, plus opening it to
 * the dev server's fs allow-list, is what lets Vite emit the four `core` files
 * as hashed assets served from our own origin — no copy under app-web/, and no
 * third-party CDN at runtime.
 */
const LAUNCH_ANIMATIONS = fileURLToPath(new URL('../../design/onboarding/launch', import.meta.url));

/**
 * Spec 027: the same application, built a second way.
 *
 * `VELA_TARGET=extension` builds the browser extension's shell instead of the
 * hosted site. Two kit options change and nothing else does:
 *
 * EXACTLY ONE kit option changes: the STATIC adapter, because a
 * `chrome-extension://` page is a file, not a request — there is no Worker to
 * run. Prerendering and pathname routing stay, and that is deliberate.
 *
 * The obvious-looking alternative, `router.type: 'hash'` (which SvelteKit
 * documents for exactly this case), is NOT usable here: it forbids server files
 * anywhere in the route tree, and this app's entire i18n is build-time SSR —
 * every string in all 15 locales is resolved by the wasm engine inside
 * `+*.server.ts` load functions at prerender time, and only serialized strings
 * reach the client (CLAUDE.md hard rule 2). Hash routing would trade the
 * corpus for a router. So the extension packages the SAME prerendered pages the
 * site serves and enters them by file URL; the SPA router takes over from there
 * (spec 027 D35, corrected).
 *
 * What still has to be dealt with downstream: those prerendered pages carry
 * inline `<script>`, and MV3 extension pages refuse inline script outright —
 * with a `sha256-` hash making the extension fail to LOAD rather than helping.
 * `extension/build.mjs` externalises them.
 *
 * The hosted build reads none of this, so its output — and therefore its
 * budgets — cannot move because the extension exists.
 */
const EXTENSION_TARGET = process.env.VELA_TARGET === 'extension';

export default defineConfig({
	resolve: {
		alias: { $animations: LAUNCH_ANIMATIONS }
	},
	server: {
		fs: { allow: [LAUNCH_ANIMATIONS] }
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: EXTENSION_TARGET
				? staticAdapter({
						// The app is served from the extension's ROOT, not a
						// subdirectory. Its absolute references — `/vela_core_bg.<hash>.wasm`
						// above all — then resolve exactly as they do on the hosted
						// site, instead of needing a base-aware rewrite the hosted
						// build would have to carry too.
						pages: 'extension/dist',
						assets: 'extension/dist',
						// `/` is the hosted site's Accept-Language negotiation endpoint —
						// a dynamic route by nature, and meaningless inside an extension
						// that opens its pages by file URL. `strict` would demand a
						// fallback page for it; shipping a bogus shell the extension
						// never opens is worse than saying so here.
						strict: false
					})
				: cloudflareAdapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
