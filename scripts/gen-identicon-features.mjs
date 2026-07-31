#!/usr/bin/env node
/**
 * Generates `rust/crates/vela-core/src/identicon_features.rs` from the INSTALLED
 * `identicons-esm` package (spec 003-rust-identicon, FR-009 / research D6).
 *
 * Reading the installed dependency rather than a vendored snapshot is deliberate:
 * it makes "regenerate and diff" a real check against the version `package.json`
 * pins, so a dependency bump that would change users' avatars shows up as a diff
 * in CI instead of passing silently.
 *
 * Usage:  npm ci && node scripts/gen-identicon-features.mjs
 * Then:   git diff --stat rust/crates/vela-core/src/identicon_features.rs
 *         (expected: no change)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(REPO_ROOT, 'rust/crates/vela-core/src/identicon_features.rs');

// Section order here is the order the constants appear in the generated file; the
// per-section arrays are what `identicon.rs` indexes.
const SECTIONS = ['face', 'sides', 'top', 'bottom'];
const PER_SECTION = 21;

// The package is ESM-only and does not export `./package.json`, so resolve an entry
// point through the import condition and walk up to the manifest — we want the
// version actually INSTALLED, not the range written in our own package.json.
const coreEntry = fileURLToPath(import.meta.resolve('identicons-esm/core'));
const pkgVersion = JSON.parse(
  readFileSync(join(dirname(dirname(coreEntry)), 'package.json'), 'utf8')
).version;
const { identiconFeatures } = await import('identicons-esm/core');

function fail(message) {
  console.error(`gen-identicon-features: ${message}`);
  process.exit(1);
}

// A silently partial table is the worst possible outcome here: it would compile,
// pass most tests, and draw the wrong avatar for a subset of addresses. So every
// structural assumption is checked before a single byte is written.
const total = Object.keys(identiconFeatures).length;
if (total !== SECTIONS.length * PER_SECTION) {
  fail(`expected ${SECTIONS.length * PER_SECTION} artwork entries, found ${total}`);
}

/** Rust string-literal escaping. The artwork is printable ASCII (asserted below). */
function rustLiteral(svg) {
  if (!/^[\x20-\x7e]*$/.test(svg)) {
    fail('artwork fragment contains non-printable or non-ASCII bytes; escaping rules no longer hold');
  }
  return svg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const blocks = [];
for (const section of SECTIONS) {
  const rows = [];
  for (let n = 1; n <= PER_SECTION; n++) {
    const assetIndex = n < 10 ? `0${n}` : `${n}`;
    const key = `./features/optimized/${section}/${section}_${assetIndex}.svg`;
    const svg = identiconFeatures[key];
    if (typeof svg !== 'string' || svg.length === 0) {
      fail(`missing or empty artwork for ${key}`);
    }
    rows.push(`    "${rustLiteral(svg)}",`);
  }
  blocks.push(
    `/// ${PER_SECTION} \`${section}\` artworks, addressed 1..=${PER_SECTION}. Slot 0 is unused:\n` +
      `/// the upstream index formula is \`abs(n % 21) + 1\`, which never yields 0.\n` +
      `#[rustfmt::skip]\n` +
      `pub(crate) static ${section.toUpperCase()}: [&str; ${PER_SECTION + 1}] = [\n` +
      `    "",\n${rows.join('\n')}\n];`
  );
}

const out = `//! Identicon section artwork — GENERATED, DO NOT EDIT BY HAND.
//!
//! Source: \`identicons-esm@${pkgVersion}\` (\`identiconFeatures\`), the version pinned in
//! \`package.json\`. Regenerate with:
//!
//! \`\`\`text
//! npm ci && node scripts/gen-identicon-features.mjs
//! \`\`\`
//!
//! ${SECTIONS.length} sections x ${PER_SECTION} artworks = ${total} \`&'static str\` fragments living in
//! \`.rodata\`, so section selection is an array index with no allocation and no lazy
//! initialisation (spec 003-rust-identicon, research D6).
//!
//! A diff in this file means the dependency's artwork changed, which would change
//! existing users' avatars — treat it as a release blocker, not a chore.

${blocks.join('\n\n')}
`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, out);

const bytes = Object.values(identiconFeatures).reduce((n, s) => n + s.length, 0);
console.log(
  `gen-identicon-features: wrote ${total} artworks (${bytes} bytes of SVG) ` +
    `from identicons-esm@${pkgVersion} -> ${OUT_FILE.slice(REPO_ROOT.length + 1)}`
);
