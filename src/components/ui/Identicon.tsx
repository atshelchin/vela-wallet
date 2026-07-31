/**
 * Nimiq identicon — a deterministic geometric avatar derived from an address
 * (github.com/nimiq/identicons).
 *
 * The avatar comes from the shared Rust core (`vela_core::identicon`) on web and
 * from the JS library on native, through the one facade — specs/003-rust-identicon.
 * Both produce the same bytes: 200,478 seeds verified by
 * `scripts/verify-identicon-parity.mjs`, plus a 21k-case conformance corpus
 * replayed on every surface. That matters more than it looks — users recognise
 * their accounts by this picture, so two platforms drawing one address differently
 * would break a verification signal, not merely look inconsistent.
 *
 * Generation is synchronous string work with no DOM dependency, so it runs
 * identically under Hermes, JSC and the web; rendering goes through
 * react-native-svg's SvgXml, which the library also implements for web.
 *
 * What gets rendered is the CIRCULAR variant, not the library's stock hexagonal
 * output, for two reasons that both still hold:
 *  - Every other avatar in the app is a circle, so the SVG is clipped by its
 *    native/web wrapper to keep one shape language everywhere.
 *  - The stock output hardcodes `clipPath id="a"`. On the web the inline SVGs share
 *    one DOM, so `url(#a)` resolves document-wide to the FIRST `#a` — with several
 *    identicons (or one in a hidden subtree) the clip silently breaks and the
 *    background paints as a full square. Wrapper clipping uses no SVG ids, so
 *    duplicate instances of a newly-created account are safe.
 */
import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { identiconSvgCircular, normalizeIdenticonSeed } from '@/services/vela-core';

// Caching lives here, at the caller, deliberately: the core is stateless so that
// generating avatars for unboundedly many addresses cannot grow its memory
// (specs/003-rust-identicon FR-008). The bound is the app's to choose.
const CACHE_LIMIT = 128;
const cache = new Map<string, string>();

function identiconXml(seed: string): string {
  // Normalisation (lowercase + length cap) is shared with every other platform
  // rather than done here — it decides the avatar, so a local copy is how four
  // platforms drift into drawing four different pictures for one account.
  const key = normalizeIdenticonSeed(seed);
  const hit = cache.get(key);
  if (hit) return hit;
  const xml = identiconSvgCircular(key);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, xml);
  return xml;
}

export const Identicon = React.memo(function Identicon({ seed, size }: {
  seed: string;
  size: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <SvgXml xml={identiconXml(seed)} width={size} height={size} />
    </View>
  );
});
