#!/usr/bin/env node
/**
 * The i18n corpus defect register (spec 004-rust-i18n, FR-018 / research D5).
 *
 * **This script fixes nothing.** It enumerates the six known content defects,
 * compares each against a committed baseline, and fails only on NEW occurrences.
 *
 * Why not just fix them: silently "improving" a translated string during an engine
 * port makes every parity claim unverifiable. The 18,975-case conformance corpus
 * pins today's rendering; if a string changes at the same time as the resolver,
 * a red vector no longer tells you which one moved. So the defects are reproduced
 * exactly, recorded here, and fixed separately — with one exception, A2, which
 * FR-017 pulled into scope because adopting MODE A without it would REGRESS 16
 * strings from correct localised text to English.
 *
 * Usage:  node scripts/lint-i18n-corpus.mjs
 *         node scripts/lint-i18n-corpus.mjs --update-baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(REPO_ROOT, 'rust/crates/vela-core/i18n/locales');
const BASELINE_FILE = join(REPO_ROOT, 'scripts/i18n-corpus-baseline.json');

const LOCALES = ['en', 'zh', 'zh-TW', 'zh-HK', 'ja', 'ko', 'vi', 'id', 'tr', 'es-MX', 'pt-BR', 'fr', 'de', 'ru', 'it'];
const NAMESPACE_FILES = [
  'home', 'send', 'receive', 'assets', 'addToken', 'tokenDetail', 'history',
  'onboarding', 'connect', 'about', 'clearSigning', 'componentsTx',
  'componentsUi', 'settingsModals', 'contacts',
];
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

/**
 * CLDR cardinal categories per shipped locale. Hardcoded rather than read from
 * `Intl.PluralRules` so the lint gives the same answer on a small-icu Node — the
 * same reason the Rust engine carries its own table.
 */
const CLDR = {
  en: ['one', 'other'], de: ['one', 'other'], tr: ['one', 'other'],
  zh: ['other'], 'zh-TW': ['other'], 'zh-HK': ['other'], ja: ['other'],
  ko: ['other'], vi: ['other'], id: ['other'],
  it: ['one', 'many', 'other'], 'es-MX': ['one', 'many', 'other'],
  fr: ['one', 'many', 'other'], 'pt-BR': ['one', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out.set(p, v);
  }
  return out;
}

const flat = {};
for (const lng of LOCALES) {
  let merged = { ...readJson(join(LOCALES_DIR, `${lng}.json`)) };
  for (const ns of NAMESPACE_FILES) merged = { ...merged, ...readJson(join(LOCALES_DIR, lng, `${ns}.json`)) };
  flat[lng] = flatten(merged, '', new Map());
}

const splitPlural = (key) => {
  for (const s of PLURAL_SUFFIXES) if (key.endsWith(s)) return [key.slice(0, -s.length), s.slice(1)];
  return null;
};

// ---------------------------------------------------------------------------
// The six defect classes
// ---------------------------------------------------------------------------

const findings = {};

// A1 — keys present in `en` but absent from other locales: they silently render
// English. Counted as (locale, key) pairs.
{
  const hits = [];
  for (const lng of LOCALES) {
    if (lng === 'en') continue;
    for (const k of flat.en.keys()) if (!flat[lng].has(k)) hits.push(`${lng}:${k}`);
  }
  findings.A1_en_only_keys = hits.sort();
}

// A2 — a locale supplies plural forms but MISSES a CLDR category its rules emit.
// FR-017 pulled this into scope: without the missing forms, MODE A returns the
// English fallback where the shipped native build returns correct localised text.
{
  const hits = [];
  for (const lng of LOCALES) {
    const bases = new Map();
    for (const k of flat[lng].keys()) {
      const sp = splitPlural(k);
      if (sp) {
        if (!bases.has(sp[0])) bases.set(sp[0], new Set());
        bases.get(sp[0]).add(sp[1]);
      }
    }
    for (const [base, have] of bases) {
      for (const cat of CLDR[lng]) if (!have.has(cat)) hits.push(`${lng}:${base}_${cat}`);
    }
  }
  findings.A2_missing_cldr_category = hits.sort();
}

// A3 — a locale supplies a plural category its CLDR rules can NEVER select.
// Harmless today (every dead value is byte-identical to its `_other` sibling) but
// dead weight, and a strict loader could reject it.
{
  const hits = [];
  for (const lng of LOCALES) {
    for (const k of flat[lng].keys()) {
      const sp = splitPlural(k);
      if (sp && !CLDR[lng].includes(sp[1])) hits.push(`${lng}:${k}`);
    }
  }
  findings.A3_dead_plural_category = hits.sort();
}

// A4 — a base key that is pluralised in some locales and plain in others. The
// plain form is unreachable wherever suffixed forms exist, and ungrammatical at
// count=1 wherever they do not.
{
  const hits = [];
  const pluralised = new Map();
  for (const lng of LOCALES) {
    for (const k of flat[lng].keys()) {
      const sp = splitPlural(k);
      if (sp) {
        if (!pluralised.has(sp[0])) pluralised.set(sp[0], new Set());
        pluralised.get(sp[0]).add(lng);
      }
    }
  }
  for (const [base, langs] of pluralised) {
    if (langs.size === LOCALES.length) continue;
    for (const lng of LOCALES) if (!langs.has(lng) && flat[lng].has(base)) hits.push(`${lng}:${base}`);
  }
  findings.A4_inconsistent_plural_shape = hits.sort();
}

// A5 — a key interpolating {{count}} with no plural siblings at all. `count` is a
// RESERVED i18next name, so these resolve only via the bare-key last-resort
// candidate. Working as-is, but one plural form away from breaking.
{
  const hits = [];
  for (const lng of LOCALES) {
    for (const [k, v] of flat[lng]) {
      if (splitPlural(k)) continue;
      if (typeof v !== 'string' || !v.includes('{{count}}')) continue;
      const hasSiblings = PLURAL_SUFFIXES.some((s) => flat[lng].has(`${k}${s}`));
      if (!hasSiblings) hits.push(`${lng}:${k}`);
    }
  }
  findings.A5_count_without_plurals = hits.sort();
}

// A6 — values whose leading/trailing whitespace is load-bearing (sentence
// fragments concatenated at render time). NOT a defect: recorded so that any
// pipeline step which starts trimming shows up as a COUNT DROP.
{
  const hits = [];
  for (const lng of LOCALES) {
    for (const [k, v] of flat[lng]) {
      if (typeof v === 'string' && v.length > 0 && v.trim() !== v) hits.push(`${lng}:${k}`);
    }
  }
  findings.A6_significant_whitespace = hits.sort();
}

// ---------------------------------------------------------------------------
// Baseline comparison
// ---------------------------------------------------------------------------

const current = Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v]));

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify(current, null, 1)}\n`);
  console.log(`lint-i18n: baseline written to ${BASELINE_FILE.replace(`${REPO_ROOT}/`, '')}`);
  for (const [k, v] of Object.entries(current)) console.log(`  ${k.padEnd(32)} ${v.length}`);
  process.exit(0);
}

let baseline;
try {
  baseline = readJson(BASELINE_FILE);
} catch {
  console.error('lint-i18n: no baseline — run `node scripts/lint-i18n-corpus.mjs --update-baseline`');
  process.exit(1);
}

let failed = false;
console.log('i18n corpus defect register (FR-018 — reported, not fixed)\n');
for (const [name, hits] of Object.entries(current)) {
  const before = new Set(baseline[name] ?? []);
  const added = hits.filter((h) => !before.has(h));
  const removed = [...before].filter((h) => !hits.includes(h));
  const status = added.length ? 'NEW' : removed.length ? 'improved' : 'ok';
  console.log(`  ${name.padEnd(32)} ${String(hits.length).padStart(4)}  ${status}`);
  if (added.length) {
    failed = true;
    console.error(`::error::lint-i18n: ${added.length} NEW occurrence(s) of ${name}:`);
    for (const h of added.slice(0, 20)) console.error(`  + ${h}`);
    if (added.length > 20) console.error(`  … and ${added.length - 20} more`);
  }
  // A shrinking count is good news, but the baseline must move with it or the
  // register drifts out of date and stops meaning anything.
  if (removed.length) {
    console.log(`      ${removed.length} fixed — re-run with --update-baseline and commit`);
  }
}

if (failed) {
  console.error(
    '\nlint-i18n: the corpus gained a defect. Fix the string, or — if the addition is ' +
      'deliberate — re-run with --update-baseline and explain it in the commit message.',
  );
  process.exit(1);
}
console.log('\nlint-i18n: no new defects.');
