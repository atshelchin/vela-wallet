/**
 * Identicon assembly on `identicons-esm` — the JS path.
 *
 * Quarantined by specs/003-rust-identicon (FR-007's rule, applied to this
 * feature): `rust/crates/vela-core/src/identicon.rs` is the real implementation.
 * This file is what still runs on native (Hermes has no WebAssembly), and it is
 * the oracle the identicon conformance corpus was extracted from. App code must
 * import from `@/services/vela-core`.
 *
 * The two functions below are byte-frozen. Editing either changes the avatar
 * users already recognise their accounts by — a release blocker, not a tweak —
 * and requires regenerating the corpus (`npm run dump:vectors`) plus a green
 * `node scripts/verify-identicon-parity.mjs`.
 */
import { getIdenticonsParams, defaultCircleShape, defaultShadow } from 'identicons-esm/core';

/**
 * The wallet's circular identicon.
 *
 * Assembled here rather than via the library's `createIdenticon`, for two reasons
 * that both still hold:
 *  - The stock output is hexagonal; every other avatar in the app is a circle, so
 *    the SVG is clipped by its wrapper to keep one shape language everywhere.
 *  - The stock output hardcodes `clipPath id="a"`. On the web the inline SVGs share
 *    one DOM, so `url(#a)` resolves document-wide to the FIRST `#a` — with several
 *    identicons (or one in a hidden subtree) the clip silently breaks and the
 *    background paints as a full square. Wrapper clipping uses no SVG ids, so
 *    duplicate instances of a newly-created account are safe.
 */
export function identiconSvgCircular(seed: string): string {
  const { sections, colors } = getIdenticonsParams(seed);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">` +
    `<path fill="${colors.background}" d="M0 0h160v160H0z"/>` +
    `<g fill="${colors.accent}" color="${colors.main}">` +
    defaultCircleShape(colors.main) +
    defaultShadow +
    sections.top +
    sections.sides +
    sections.face +
    sections.bottom +
    `</g></svg>`
  );
}

/**
 * Case- and length-normalisation, applied before hashing.
 *
 * Addresses appear in both checksummed and lowercase forms across the app (stored
 * accounts vs. typed input vs. dApp payloads), so the same address must hash the
 * same way regardless of casing.
 *
 * The length cap exists because the library's chaotic hash keeps shrinking as the
 * seed grows; past roughly a thousand characters its exponent reaches three digits,
 * an exponent digit leaks into the hash, and the colour lookup yields
 * `fill="undefined"`. Real seeds are 42-character addresses, so nothing legitimate
 * is cut. (The Rust core rejects such seeds outright, making this belt-and-braces.)
 */
export function normalizeIdenticonSeed(seed: string): string {
  return seed.toLowerCase().slice(0, 128);
}
