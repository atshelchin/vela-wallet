/**
 * The identicon library's placeholder artwork, returned for seeds vela-core
 * rejects.
 *
 * Its own module because it has TWO renderers and no dependencies: the
 * build-time one (`identicon.server.ts`, which the prerendered fixtures use)
 * and the runtime one (`identicon.ts`, which the signed-in wallet uses for the
 * person's own address). Neither may import the other — the server file must
 * not pull the client's wasm loader into the Worker bundle, and the client file
 * must not pull a `.server` module into the browser — so the one thing they
 * share lives here, where both can reach it and nothing else comes with it.
 */
export const IDENTICON_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><path fill="url(#a)" transform="translate(0,4)" d="M62.3 25.4 49.2 2.6A5.3 5.3 0 0 0 44.6 0H18.4c-1.9 0-3.6 1-4.6 2.6L.7 25.4c-1 1.6-1 3.6 0 5.2l13.1 22.8c1 1.6 2.7 2.6 4.6 2.6h26.2c1.9 0 3.6-1 4.6-2.6l13-22.8c1-1.6 1-3.6.1-5.2z" opacity=".1"/><defs><radialGradient id="a" cx="0" cy="0" r="1" gradientTransform="matrix(-63.0033 0 0 -56 63 56)" gradientUnits="userSpaceOnUse"><stop stop-color="#260133"/><stop offset="1" stop-color="#1F2348"/></radialGradient></defs></svg>`;
