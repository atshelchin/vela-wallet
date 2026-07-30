#!/usr/bin/env node
/**
 * Prove that migrating `Identicon.tsx` to vela-core changes NO existing avatar
 * (spec 003-rust-identicon, SC-003).
 *
 * Compares, byte for byte:
 *   - the JS library the app ships today (`identicons-esm@1.0.1`), assembled the
 *     way `src/components/ui/Identicon.tsx` assembles it, against
 *   - the shipped web artifact's `identiconSvgCircular`.
 *
 * This is also the large-scale differential run behind SC-001: the committed
 * corpus holds 20,000 hashes so `cargo test` needs no Node, while this script
 * regenerates a much larger sample on demand rather than putting it in git.
 *
 * Usage:
 *   node scripts/verify-identicon-parity.mjs            # 200,000 random seeds + every repo address
 *   node scripts/verify-identicon-parity.mjs 1000000    # a bigger sweep
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getIdenticonsParams,
  defaultCircleShape,
  defaultShadow,
  makeHash,
} from 'identicons-esm/core';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RANDOM_SEEDS = Number(process.argv[2] ?? 200_000);

const { initSync, ...wasm } = await import(join(REPO_ROOT, 'rust/pkg-web/vela_core.js'));
const { WASM_BASE64 } = await import(join(REPO_ROOT, 'rust/pkg-web/vela_core_bg.base64.js'));
initSync({ module: Buffer.from(WASM_BASE64, 'base64') });

/**
 * Byte-for-byte what `src/components/ui/Identicon.tsx` builds today. Kept here as a
 * literal copy on purpose: this script's whole job is to prove the Rust output
 * equals THIS string, so it must not import the component's helper — that would
 * make the test tautological once the component is migrated.
 */
function legacyCircularSvg(seed) {
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

/** The app's pre-migration seed normalisation: `seed.toLowerCase().slice(0, 128)`. */
const legacyNormalize = (seed) => seed.toLowerCase().slice(0, 128);

// ---------------------------------------------------------------------------
// Seed corpus
// ---------------------------------------------------------------------------

/** Every 0x-address literal anywhere in the app — the closest thing to real accounts. */
function repoAddresses() {
  const out = execFileSync(
    'git',
    ['grep', '-hEo', '0x[0-9a-fA-F]{40}', '--', 'src', 'e2e', 'scripts', 'modules'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(out.split('\n').filter(Boolean))];
}

let rngState = 0x9e3779b9;
function rnd() {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 0x100000000;
}
const HEX = '0123456789abcdefABCDEF';

function randomSeed(i) {
  // Mostly the production shape; the tail exercises unicode and length regimes so a
  // divergence outside address-space still shows up.
  const kind = i % 20;
  if (kind < 14) {
    let s = '0x';
    for (let j = 0; j < 40; j++) s += HEX[Math.floor(rnd() * HEX.length)];
    return s;
  }
  if (kind < 17) {
    const n = Math.floor(rnd() * 120);
    let s = '';
    for (let j = 0; j < n; j++) s += String.fromCharCode(32 + Math.floor(rnd() * 95));
    return s;
  }
  if (kind < 19) {
    const n = Math.floor(rnd() * 30);
    let s = '';
    for (let j = 0; j < n; j++) s += String.fromCodePoint(Math.floor(rnd() * 0xd800));
    return s;
  }
  const n = Math.floor(rnd() * 15);
  let s = '';
  for (let j = 0; j < n; j++) s += String.fromCodePoint(0x10000 + Math.floor(rnd() * 0xf0000));
  return s;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

const failures = [];
let checked = 0;
let loneSurrogate = 0;

/**
 * The one structural divergence (contracts/conformance-vectors.md, register #5):
 * when JS truncation splits a surrogate pair it keeps a lone high surrogate, which
 * a Rust `&str` cannot hold. Needs a >128-code-unit seed with an astral character
 * at exactly the boundary — unreachable for an address. Counted, never silent.
 */
function hasLoneSurrogate(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function compare(label, rawSeed) {
  const legacySeed = legacyNormalize(rawSeed);
  const coreSeed = wasm.identiconNormalizeSeed(rawSeed);

  if (hasLoneSurrogate(legacySeed)) {
    loneSurrogate++;
    return;
  }

  // Normalisation itself is part of "the same logo": if the two disagree, the
  // avatar changes even when the renderer is byte-identical.
  if (legacySeed !== coreSeed) {
    if (failures.length < 20) {
      failures.push(`${label}: normalisation differs — legacy ${JSON.stringify(legacySeed)}, core ${JSON.stringify(coreSeed)}`);
    }
    return;
  }

  checked++;
  const legacyHash = makeHash(legacySeed);
  const coreHash = wasm.identiconMakeHash(coreSeed);
  if (legacyHash !== coreHash) {
    if (failures.length < 20) failures.push(`${label}: hash differs — legacy ${legacyHash}, core ${coreHash}`);
    return;
  }

  const legacySvg = legacyCircularSvg(legacySeed);
  let coreSvg;
  try {
    coreSvg = wasm.identiconSvgCircular(coreSeed);
  } catch (e) {
    if (failures.length < 20) failures.push(`${label}: core threw ${e.code ?? e} where the library rendered`);
    return;
  }
  if (legacySvg !== coreSvg) {
    if (failures.length < 20) {
      const at = [...legacySvg].findIndex((c, k) => c !== coreSvg[k]);
      failures.push(
        `${label}: SVG differs at byte ${at}\n  legacy: ${legacySvg.slice(Math.max(0, at - 40), at + 40)}\n  core:   ${coreSvg.slice(Math.max(0, at - 40), at + 40)}`,
      );
    }
  }
}

const addresses = repoAddresses();
console.log(`verify-identicon-parity: ${addresses.length} addresses found in the repo`);
for (const a of addresses) {
  compare(`repo-address ${a}`, a);
  // Stored accounts and typed input differ in case; both must land on one avatar.
  compare(`repo-address-upper ${a}`, a.toUpperCase());
}

const started = Date.now();
for (let i = 0; i < RANDOM_SEEDS; i++) compare(`random#${i}`, randomSeed(i));
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (failures.length) {
  console.error(
    `\nverify-identicon-parity: ${failures.length}+ DIVERGENCES over ${checked} seeds — ` +
      `migrating would change existing users' avatars. Release blocker.\n\n${failures.join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `verify-identicon-parity: ${checked} seeds byte-identical ` +
    `(${addresses.length * 2} repo addresses + ${RANDOM_SEEDS} random, ${elapsed}s)` +
    (loneSurrogate
      ? `\n  ${loneSurrogate} seeds skipped: JS truncation produced a lone surrogate, ` +
        `unrepresentable in Rust (documented divergence #5; needs a >128-unit seed with ` +
        `an astral character at exactly the boundary — impossible for an address)`
      : ''),
);
