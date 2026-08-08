/**
 * Build-time identicon rendering (spec 015, research.md D1).
 *
 * Same seam as `engine.server.ts`: the wasm module runs in Node during
 * prerender only, so the deployed Worker stays wasm-free. Web renders the
 * identicon as an inline `<svg>` — the same bytes the other platforms
 * rasterize through vela-core's `identicon-raster` feature.
 *
 * Seeds go through `identiconNormalizeSeed` (never a local `toLowerCase()` —
 * spec 003's drift rule), and invalid seeds fall back to the shared
 * placeholder artwork instead of throwing into the page build.
 */
import {
	identiconNormalizeSeed,
	identiconSvgCircular
} from '../../../../../rust/pkg-web/vela_core.js';
import '$lib/i18n/wasm-init.server';

/** The library's placeholder artwork, returned for seeds vela-core rejects. */
export const IDENTICON_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><path fill="url(#a)" transform="translate(0,4)" d="M62.3 25.4 49.2 2.6A5.3 5.3 0 0 0 44.6 0H18.4c-1.9 0-3.6 1-4.6 2.6L.7 25.4c-1 1.6-1 3.6 0 5.2l13.1 22.8c1 1.6 2.7 2.6 4.6 2.6h26.2c1.9 0 3.6-1 4.6-2.6l13-22.8c1-1.6 1-3.6.1-5.2z" opacity=".1"/><defs><radialGradient id="a" cx="0" cy="0" r="1" gradientTransform="matrix(-63.0033 0 0 -56 63 56)" gradientUnits="userSpaceOnUse"><stop stop-color="#260133"/><stop offset="1" stop-color="#1F2348"/></radialGradient></defs></svg>`;

/** Circular identicon SVG for a raw seed; placeholder when unrenderable. */
export function identiconSvgFor(rawSeed: string): string {
	const seed = identiconNormalizeSeed(rawSeed);
	if (seed.length === 0) return IDENTICON_PLACEHOLDER_SVG;
	try {
		return identiconSvgCircular(seed);
	} catch {
		return IDENTICON_PLACEHOLDER_SVG;
	}
}
