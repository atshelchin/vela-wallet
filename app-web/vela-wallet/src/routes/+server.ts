import { negotiate } from '$lib/i18n/locales';

/**
 * `/` — the only runtime route (contracts/i18n-ssr.md): negotiate
 * Accept-Language and 307 to the prerendered locale page. Runs on the
 * Cloudflare Worker, so it must stay wasm-free (see engine.server.ts).
 */
export function GET({ request }: { request: Request }): Response {
	const locale = negotiate(request.headers.get('accept-language'));
	return new Response(null, {
		status: 307,
		headers: {
			location: `/${locale}`,
			vary: 'Accept-Language',
			'cache-control': 'private, no-store'
		}
	});
}
