/**
 * The NATIVE identicon path, replayed against the shared conformance corpus.
 *
 * On iOS/Android the app runs Hermes, which has no WebAssembly, so the JS library
 * — not the Rust core — is what actually draws avatars there until the native
 * rewrite adopts the Kotlin/Swift bindings. That makes this surface just as
 * load-bearing as the wasm one, and it deserves the same oracle rather than a
 * hand-written snapshot: the vectors below are the exact ones `cargo test` and
 * `verify-web.mjs` replay (specs/003-rust-identicon).
 *
 * A red test here means web and native would draw the same account differently.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { identiconSvgCircular, normalizeIdenticonSeed } from '@/services/identicon';

interface VectorCase {
  name: string;
  fn: string;
  input: { seed?: string };
  expect: { value?: string };
}

const corpus: { cases: VectorCase[] } = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../rust/crates/vela-core/tests/vectors/identicon.json'),
    'utf8',
  ),
);

const casesFor = (fn: string) => corpus.cases.filter((c) => c.fn === fn);

describe('identicon (native JS path) matches the shared corpus', () => {
  it('has a corpus to check against', () => {
    // Guards the failure mode where a moved/renamed vector file turns this whole
    // suite into a green no-op.
    expect(casesFor('identicon_svg_circular').length).toBeGreaterThan(0);
    expect(casesFor('normalize_seed').length).toBeGreaterThan(0);
  });

  it.each(casesFor('identicon_svg_circular').map((c) => [c.name, c] as const))(
    'circular SVG: %s',
    (_name, c) => {
      expect(identiconSvgCircular(c.input.seed as string)).toBe(c.expect.value);
    },
  );

  it.each(casesFor('normalize_seed').map((c) => [c.name, c] as const))(
    'seed normalisation: %s',
    (_name, c) => {
      expect(normalizeIdenticonSeed(c.input.seed as string)).toBe(c.expect.value);
    },
  );
});
