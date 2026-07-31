#!/usr/bin/env node
/**
 * Dumps the identicon conformance corpus from the INSTALLED `identicons-esm`
 * package (spec 003-rust-identicon, contracts/conformance-vectors.md).
 *
 * Why this one is a standalone `.mjs` instead of a `*.dump.test.ts` like its five
 * siblings: the other suites' oracle is this repo's own TypeScript, which ts-jest
 * compiles to CommonJS. `identicons-esm` is ESM-only (no `require` condition in its
 * exports map), so it cannot be loaded from that CommonJS context at all. Node runs
 * it directly instead; `npm run dump:vectors` invokes both.
 *
 * Determinism (FR-012): seeds come from a fixed xorshift PRNG with a hardcoded
 * seed plus committed literal lists, and nothing here writes a timestamp or a git
 * sha. Re-running on unchanged code MUST produce byte-identical files, so any diff
 * is a real behaviour change.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  makeHash,
  getIdenticonsParams,
  assembleSvg,
  createIdenticon,
  sectionToSvg,
  identiconFeatures,
  defaultCircleShape,
  defaultShadow,
  formatIdenticon,
  identiconPlaceholder,
} from 'identicons-esm/core';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VECTORS_DIR = join(REPO_ROOT, 'rust/crates/vela-core/tests/vectors');

const SECTIONS = ['face', 'sides', 'top', 'bottom'];
const PER_SECTION = 21;

// ---------------------------------------------------------------------------
// Oracle helpers — every expectation below is COMPUTED from the package, never
// written by hand. A hand-typed expectation would only prove the typist agreed
// with the implementation.
// ---------------------------------------------------------------------------

/** Reverse map fragment -> 1-based index, so params cases stay compact. */
const FRAGMENT_INDEX = new Map();
for (const section of SECTIONS) {
  for (let n = 1; n <= PER_SECTION; n++) {
    const assetIndex = n < 10 ? `0${n}` : `${n}`;
    FRAGMENT_INDEX.set(identiconFeatures[`./features/optimized/${section}/${section}_${assetIndex}.svg`], n);
  }
}

function indexOfFragment(svg) {
  const i = FRAGMENT_INDEX.get(svg);
  if (i === undefined) throw new Error('dump: params returned a fragment not present in identiconFeatures');
  return i;
}

/** The wallet's circular variant, byte-for-byte as `src/components/ui/Identicon.tsx` builds it. */
function circularSvg(seed) {
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

/** True when the JS library produces a malformed identicon or throws for this seed. */
function degeneracy(seed) {
  const hash = makeHash(seed);
  if (/[^0-9]/.test(hash.slice(1))) return 'throws'; // Regime B: NaN section indices
  if (!/[0-9]/.test(hash[0])) return 'undefined-main'; // Regime A: colors[NaN]
  return null;
}

function paramsExpect(seed) {
  const { sections, colors } = getIdenticonsParams(seed);
  return {
    main: colors.main,
    background: colors.background,
    accent: colors.accent,
    face: indexOfFragment(sections.face),
    top: indexOfFragment(sections.top),
    sides: indexOfFragment(sections.sides),
    bottom: indexOfFragment(sections.bottom),
  };
}

// ---------------------------------------------------------------------------
// Deterministic seed generation
// ---------------------------------------------------------------------------

let rngState = 0x2545f491;
function rnd() {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 0x100000000;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];

const HEX = '0123456789abcdef';
const NQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY';
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

function randomAddress(mixedCase) {
  let s = '0x';
  for (let i = 0; i < 40; i++) {
    const c = pick(HEX);
    s += mixedCase && rnd() < 0.5 ? c.toUpperCase() : c;
  }
  return s;
}

function randomBmp(n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    let cp = Math.floor(rnd() * 0xd800);
    if (rnd() < 0.3) cp = 0x4e00 + Math.floor(rnd() * 0x5000); // CJK
    if (rnd() < 0.1) cp = 0xe000 + Math.floor(rnd() * 0x1900); // PUA
    s += String.fromCodePoint(cp);
  }
  return s;
}

function randomAstral(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCodePoint(0x10000 + Math.floor(rnd() * 0xf0000));
  return s;
}

function randomAscii(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += pick(ASCII);
  return s;
}

function randomControl(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(Math.floor(rnd() * 32));
  return s;
}

/** A checksum-valid Nimiq address, so the validate-and-normalise path is exercised for real. */
function nimiqIbanCheck(str) {
  const num = str
    .split('')
    .map((c) => {
      const code = c.toUpperCase().charCodeAt(0);
      return code >= 48 && code <= 57 ? c : (code - 55).toString();
    })
    .join('');
  let tmp = '';
  for (let i = 0; i < Math.ceil(num.length / 6); i++) {
    tmp = (parseInt(tmp + num.substr(i * 6, 6), 10) % 97).toString();
  }
  return parseInt(tmp, 10);
}

function randomValidNimiq() {
  for (;;) {
    let body = '';
    for (let i = 0; i < 32; i++) body += pick(NQ_ALPHABET);
    for (let cd = 0; cd < 100; cd++) {
      const check = String(cd).padStart(2, '0');
      const addr = `NQ${check}${body}`;
      if (nimiqIbanCheck(addr.substr(4) + addr.substr(0, 4)) === 1) {
        return addr.replace(/(.{4})/g, '$1 ').trim();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Case groups
// ---------------------------------------------------------------------------

const cases = [];
const add = (c) => cases.push(c);

// -- known-answer: the library's own published inline snapshots. If these fail,
//    the float pipeline is wrong and nothing else is worth reading.
for (const [name, seed] of [
  ['test', 'test'],
  ['hello', 'hello'],
  ['nq-zero', 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'],
]) {
  add({ name: `known-answer/${name}`, fn: 'make_hash', input: { seed }, expect: { value: makeHash(seed) } });
}

// -- golden-corpus: the frozen corpus upstream uses to gate its own refactors
//    (packages/nimiq-identicons/test/golden.ts @ v1.0.1).
const GOLDEN = [
  ['empty', ''],
  ['single-char', 'a'],
  ['nimiq', 'nimiq'],
  ['hello', 'hello'],
  ['test', 'test'],
  ['numeric', '1234567890'],
  ['special', '!@#$%^&*()'],
  ['spaces', '   '],
  ['emoji-single', String.fromCodePoint(0x1f48e)],
  ['emoji-mixed', `a${String.fromCodePoint(0x1f48e)}b${String.fromCodePoint(0x1f389)}c`],
  ['emoji-two', `${String.fromCodePoint(0x1f389)}${String.fromCodePoint(0x1f38a)}`],
  ['long', 'x'.repeat(500)],
  ['address-zero', 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'],
  ['address-248h', 'NQ34 248H 248H 248H 248H 248H 248H 248H 248H'],
];
for (const [name, seed] of GOLDEN) {
  add({ name: `golden/${name}/hash`, fn: 'make_hash', input: { seed }, expect: { value: makeHash(seed) } });
  add({ name: `golden/${name}/params`, fn: 'identicon_params', input: { seed }, expect: paramsExpect(seed) });
}

// -- section-table: EXHAUSTIVE. All 84 artworks pinned by full text, which is what
//    makes the compact `face: 7` index form used by every params case above
//    trustworthy — both ends are anchored to the package, so nothing is circular.
for (const section of SECTIONS) {
  for (let n = 1; n <= PER_SECTION; n++) {
    add({
      name: `section-table/${section}_${n}`,
      fn: 'section_svg',
      input: { section, index: n - 1 }, // abs(n % 21) + 1 -> n
      expect: { value: sectionToSvg(section, n - 1) },
    });
  }
}
// index arithmetic itself: negative and wrapping inputs
for (const [section, index] of [
  ['face', -5],
  ['top', 0],
  ['sides', 20],
  ['bottom', 21],
  ['face', 41],
  ['top', -21],
  ['sides', 99],
]) {
  add({
    name: `section-index/${section}@${index}`,
    fn: 'section_svg',
    input: { section, index },
    expect: { value: sectionToSvg(section, index) },
  });
}

// -- addresses: the production seed shape (SC-003).
const FIXTURE_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0xffffffffffffffffffffffffffffffffffffffff',
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  '0xd8Da6BF26964aF9D7eEd9e03E53415D37aA96045',
  '0x762EdA60D3B68755c271D608644650278f88329F',
];
for (const seed of FIXTURE_ADDRESSES) {
  add({ name: `address/fixture/${seed}`, fn: 'identicon_params', input: { seed }, expect: paramsExpect(seed) });
}
for (let i = 0; i < 300; i++) {
  const seed = randomAddress(false);
  add({ name: `address/lower/${i}`, fn: 'identicon_params', input: { seed }, expect: paramsExpect(seed) });
}
for (let i = 0; i < 300; i++) {
  const seed = randomAddress(true);
  add({ name: `address/mixed/${i}`, fn: 'identicon_params', input: { seed }, expect: paramsExpect(seed) });
}

// -- unicode: the high-surrogate rule (research D3) is the single most likely
//    silent-divergence site, so astral coverage is not optional.
for (let i = 0; i < 150; i++) {
  const seed = randomBmp(1 + Math.floor(rnd() * 30));
  add({ name: `unicode/bmp/${i}`, fn: 'make_hash', input: { seed }, expect: { value: makeHash(seed) } });
}
for (let i = 0; i < 150; i++) {
  const seed = randomAstral(1 + Math.floor(rnd() * 15));
  add({ name: `unicode/astral/${i}`, fn: 'make_hash', input: { seed }, expect: { value: makeHash(seed) } });
}
for (const [name, seed] of [
  ['bmp-max', String.fromCodePoint(0xffff)],
  ['cp-max', String.fromCodePoint(0x10ffff)],
  ['astral-pair', String.fromCodePoint(0x1f600) + String.fromCodePoint(0x1f600)],
  ['surrogate-boundary', String.fromCodePoint(0x10000)],
]) {
  add({ name: `unicode/${name}`, fn: 'identicon_params', input: { seed }, expect: paramsExpect(seed) });
}

// -- control characters, including NUL
for (let i = 0; i < 100; i++) {
  const seed = randomControl(1 + Math.floor(rnd() * 20));
  add({ name: `control/${i}`, fn: 'make_hash', input: { seed }, expect: { value: makeHash(seed) } });
}

// -- length sweep: straddles the exponential-form onset at 93 characters
for (let n = 0; n <= 200; n++) {
  const seed = 'x'.repeat(n);
  add({ name: `length/${n}`, fn: 'make_hash', input: { seed }, expect: { value: makeHash(seed) } });
}

// -- Regime A (research D5): JS emits literal `undefined`; strict mode rejects.
// The onset depends on the seed's characters (each contributes its own decay
// factor), so these lengths are specific to a repeated 'x': 1836 is the first
// length at which `x`.repeat(n) reaches a three-digit exponent. Over random ASCII
// the shortest observed trigger was 1046 code points.
const REGIME_A_LENGTHS = [1836, 1900, 2000, 2200, 2500, 3000, 3500, 4000];
for (const n of REGIME_A_LENGTHS) {
  const seed = 'x'.repeat(n);
  const hash = makeHash(seed);
  if (degeneracy(seed) !== 'undefined-main') {
    throw new Error(`dump: seed of length ${n} was expected to be Regime A, got ${degeneracy(seed)}`);
  }
  add({ name: `regime-a/${n}/hash`, fn: 'make_hash', input: { seed }, expect: { value: hash } });
  add({
    name: `regime-a/${n}/strict`,
    fn: 'identicon_params',
    input: { seed },
    expect: { error: 'InvalidIdenticonSeed' },
    divergence: {
      ts_behavior: `colors[NaN] is undefined, so the assembled SVG contains the literal text fill="undefined"`,
      reason: 'FR-004: a wallet must fail loudly rather than render an invisible avatar',
    },
  });
  add({
    name: `regime-a/${n}/js-compat`,
    fn: 'identicon_params_js_compat',
    input: { seed },
    expect: { ...paramsExpect(seed), main: 'undefined' },
  });
}

// -- Nimiq validate-and-normalise path + placeholder fallback
for (let i = 0; i < 40; i++) {
  const addr = randomValidNimiq();
  add({ name: `nimiq/valid/${i}`, fn: 'nimiq_is_valid_address', input: { input: addr }, expect: { value: true } });
  add({
    name: `nimiq/create/${i}`,
    fn: 'create_identicon',
    input: { seed: addr, validate_address: true, format: 'svg' },
    expect: { value: createIdenticon(addr, { shouldValidateAddress: true, format: 'svg' }) },
  });
}
for (const [name, input] of [
  ['evm-address', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'],
  ['empty', ''],
  ['too-short', 'NQ07 0000'],
  ['bad-alphabet', 'NQ07 IOWZ 0000 0000 0000 0000 0000 0000 0000'],
  ['bad-checksum', 'NQ99 0000 0000 0000 0000 0000 0000 0000 0000'],
  ['no-prefix', '0000 0000 0000 0000 0000 0000 0000 0000 0000'],
]) {
  add({ name: `nimiq/invalid/${name}`, fn: 'nimiq_is_valid_address', input: { input }, expect: { value: false } });
  add({
    name: `nimiq/placeholder/${name}`,
    fn: 'create_identicon',
    input: { seed: input, validate_address: true, format: 'svg' },
    expect: { value: createIdenticon(input, { shouldValidateAddress: true, format: 'svg' }) },
  });
}

// -- full SVG documents: the end-to-end byte check on assembly. Deliberately a
//    small sample -- assembly is a fixed template, and a complete document is
//    2.2-8.4 KB, so thousands of them would bloat the repo without adding signal
//    that the params + exhaustive section-table cases do not already provide.
//    RECORDED COVERAGE LIMIT (contracts/conformance-vectors.md).
//
//    NOTE the oracle here is `assembleSvg(getIdenticonsParams(seed))`, NOT
//    `createIdenticon(seed, …)`. They agree for every non-empty seed, but
//    `createIdenticon` short-circuits to the raw placeholder on ANY falsy input —
//    including the empty string, and including when a data URI was requested (it
//    returns un-encoded SVG). That short-circuit belongs to `create_identicon`,
//    which is pinned separately below; `identicon_svg` is the pure params-and-
//    assemble path.
const SVG_SAMPLE = [...FIXTURE_ADDRESSES, '', 'nimiq', 'test', String.fromCodePoint(0x1f48e), 'x'.repeat(120)];
for (const seed of SVG_SAMPLE) {
  const stock = assembleSvg(getIdenticonsParams(seed));
  add({ name: `full-svg/stock/${JSON.stringify(seed).slice(0, 24)}`, fn: 'identicon_svg', input: { seed }, expect: { value: stock } });
  add({
    name: `full-svg/circular/${JSON.stringify(seed).slice(0, 24)}`,
    fn: 'identicon_svg_circular',
    input: { seed },
    expect: { value: circularSvg(seed) },
  });
  add({
    name: `full-svg/data-uri/${JSON.stringify(seed).slice(0, 24)}`,
    fn: 'identicon_data_uri',
    input: { seed },
    expect: { value: formatIdenticon(stock, 'image/svg+xml') },
  });
}

// -- create_identicon's falsy-input short-circuit: the raw placeholder is returned
//    even with validation OFF, and even when a data URI was asked for. Upstream
//    quirk, pinned so a "tidy-up" cannot quietly change it.
for (const format of ['svg', 'image/svg+xml']) {
  add({
    name: `create/empty-seed/validate-off/${format}`,
    fn: 'create_identicon',
    input: { seed: '', validate_address: false, format },
    expect: { value: createIdenticon('', { shouldValidateAddress: false, format }) },
  });
}
add({
  name: 'create/placeholder-constant',
  fn: 'constants',
  input: {},
  expect: { identicon_placeholder: identiconPlaceholder },
});
for (const seed of ['test', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045']) {
  for (const format of ['svg', 'image/svg+xml']) {
    add({
      name: `create/validate-off/${seed.slice(0, 12)}/${format}`,
      fn: 'create_identicon',
      input: { seed, validate_address: false, format },
      expect: { value: createIdenticon(seed, { shouldValidateAddress: false, format }) },
    });
  }
}
// assembleSvg must be reachable independently of the seed pipeline
add({
  name: 'assemble/placeholder-constants',
  fn: 'constants',
  input: {},
  expect: {
    default_shadow: defaultShadow,
    default_circle_shape: defaultCircleShape('#FC8702'),
  },
});

// -- normalize_seed: Vela policy, not the library's (research D9)
const NORMALIZE_SEEDS = [
  ['already-lower', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'],
  ['checksummed', '0xd8Da6BF26964aF9D7eEd9e03E53415D37aA96045'],
  ['upper', '0XABCDEF0123456789ABCDEF0123456789ABCDEF01'],
  ['empty', ''],
  ['exactly-128', 'A'.repeat(128)],
  ['over-128', 'A'.repeat(200)],
  // Full Unicode lowercasing, verified equivalent to Rust's `to_lowercase` for
  // every code point and for string-level context rules (research D9).
  ['greek-final-sigma', 'ΟΔΟΣ'],
  ['greek-medial-sigma', 'ΣΑ'],
  ['turkish-dotted-I', 'İ'],
  ['cyrillic', 'ПРИВЕТ'],
  ['deseret-astral', String.fromCodePoint(0x10400, 0x10401)],
  ['fullwidth', 'ＡＢＣ'],
  ['mixed-script', 'AΣБ' + String.fromCodePoint(0x10400)],
];
for (const [name, seed] of NORMALIZE_SEEDS) {
  add({
    name: `normalize/${name}`,
    fn: 'normalize_seed',
    // The oracle is the app's own pre-migration expression, verbatim.
    input: { seed },
    expect: { value: seed.toLowerCase().slice(0, 128) },
  });
}

// ---------------------------------------------------------------------------
// Bulk suite — the volume behind SC-001
// ---------------------------------------------------------------------------

// RECORDED COVERAGE LIMIT: 20,000 committed pairs, ~2 MB. The point of committing
// them is that `cargo test` proves parity with no Node in the loop; 20k random
// seeds across all nine shape categories means any regression in the hash pipeline
// fails thousands of cases at once, so more rows buy repo weight rather than
// signal. The larger differential run (200k+) lives in
// `scripts/verify-identicon-parity.mjs`, which regenerates rather than commits.
const BULK_COUNT = 20000;
const pairs = [];
for (let i = 0; i < BULK_COUNT; i++) {
  const kind = i % 10;
  let seed;
  if (kind === 0) seed = randomAddress(false);
  else if (kind === 1) seed = randomAddress(true);
  else if (kind === 2) seed = randomValidNimiq();
  else if (kind === 3) seed = randomAscii(Math.floor(rnd() * 8));
  else if (kind === 4) seed = randomAscii(Math.floor(rnd() * 130));
  else if (kind === 5) seed = randomBmp(Math.floor(rnd() * 40));
  else if (kind === 6) seed = randomAstral(Math.floor(rnd() * 20));
  else if (kind === 7) seed = randomAscii(90 + Math.floor(rnd() * 120));
  else if (kind === 8) seed = randomControl(Math.floor(rnd() * 25));
  else seed = randomAscii(Math.floor(rnd() * 300));
  pairs.push([seed, makeHash(seed)]);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function writeSuite(suite, doc) {
  mkdirSync(VECTORS_DIR, { recursive: true });
  const file = join(VECTORS_DIR, `${suite}.json`);
  writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${doc.cases.length} entries -> ${relative(process.cwd(), file)}`);
}

/**
 * The bulk suite is written by hand rather than through `JSON.stringify(_, null, 1)`:
 * at 20k rows the pretty-printer puts every string on its own line inside its own
 * array, which more than doubles the file for no readability gain. One pair per
 * line stays diffable while staying compact.
 */
function writeBulk(suite, source, bulkPairs) {
  mkdirSync(VECTORS_DIR, { recursive: true });
  const file = join(VECTORS_DIR, `${suite}.json`);
  const rows = bulkPairs.map((p) => JSON.stringify(p)).join(',\n');
  const out = `{\n "suite": ${JSON.stringify(suite)},\n "source": ${JSON.stringify(source)},\n "pairs": [\n${rows}\n ]\n}\n`;
  writeFileSync(file, out);
  console.log(`wrote ${bulkPairs.length} pairs -> ${relative(process.cwd(), file)}`);
}

// No timestamp and no git sha, matching writer.ts: the corpus must be byte-stable
// so that ANY diff is a behaviour change.
writeSuite('identicon', {
  suite: 'identicon',
  source: 'scripts/dump-vectors/identicon.dump.mjs (oracle: installed identicons-esm)',
  cases,
});
writeBulk(
  'identicon-bulk',
  'scripts/dump-vectors/identicon.dump.mjs (oracle: installed identicons-esm)',
  pairs
);

const degenerate = pairs.filter(([, h]) => /[^0-9]/.test(h)).length;
console.log(`identicon corpus: ${cases.length} cases + ${pairs.length} bulk pairs (${degenerate} degenerate)`);
