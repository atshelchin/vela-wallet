/**
 * `src/i18n/resources.ts` is GENERATED from the corpus in the Rust crate
 * (spec 004-rust-i18n, FR-010/FR-011). This is the assertion that keeps the
 * generation honest.
 *
 * FR-011 is what makes "zero app changes" true: 1,029 `t()` call sites, 92
 * `useTranslation()` hooks and the typed key union in `i18next.d.ts` all keep
 * working *because* the generated object is deep-equal to the hand-maintained one
 * it replaced. That equality was verified once, at the only moment both files
 * existed. What survives afterwards is this: an INDEPENDENT merge of the corpus,
 * deep-compared against what the generator emitted.
 *
 * Independent matters. A test that re-used the generator's own merge would pass
 * for any generator, including a broken one. This walks the 240 files itself, in
 * the order the generated file declares, and compares the result.
 *
 * It is deliberately immune to legitimate content edits — changing a translation
 * changes both sides — and sensitive to exactly the failure that matters: the
 * generator dropping a namespace, reordering the spread, or losing a locale.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { en, resources } from '@/i18n/resources';

/**
 * The shipped locale set, declared here rather than imported from `@/i18n` —
 * that module pulls in `expo-localization`, which jest cannot transform, and the
 * sibling `sign-handoff-coverage.test.ts` mirrors the list for the same reason.
 * Keeping it local also means this test checks the generator against a written-down
 * expectation instead of against the app's own runtime constant.
 */
const SUPPORTED_LANGUAGES = [
  'en', 'zh', 'zh-TW', 'zh-HK', 'ja', 'ko', 'vi', 'id', 'tr', 'es-MX', 'pt-BR',
  'fr', 'de', 'ru', 'it',
] as const;

/** THE source of truth — the crate, not `src/`. */
const CORPUS = join(__dirname, '../../../rust/crates/vela-core/i18n/locales');

/** Spread order, mirroring `scripts/gen-i18n.mjs`. A later file wins a collision. */
const NAMESPACE_FILES = [
  'home', 'send', 'receive', 'assets', 'addToken', 'tokenDetail', 'history',
  'onboarding', 'connect', 'about', 'clearSigning', 'componentsTx',
  'componentsUi', 'settingsModals', 'contacts',
];

function mergeLocale(lng: string): Record<string, unknown> {
  const read = (p: string) => JSON.parse(readFileSync(join(CORPUS, p), 'utf8'));
  let out = { ...read(`${lng}.json`) };
  for (const ns of NAMESPACE_FILES) out = { ...out, ...read(`${lng}/${ns}.json`) };
  return out;
}

function countLeaves(o: unknown): number {
  if (typeof o !== 'object' || o === null) return 1;
  return Object.values(o).reduce<number>((n, v) => n + countLeaves(v), 0);
}

describe('generated i18n resources', () => {
  it('covers exactly the shipped locale set', () => {
    expect(Object.keys(resources).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it.each(SUPPORTED_LANGUAGES)('%s is deep-equal to an independent corpus merge', (lng) => {
    expect(resources[lng].translation).toEqual(mergeLocale(lng));
  });

  it('exports `en` by name, which is what the typed key union is derived from', () => {
    // src/i18n/i18next.d.ts does `import type { en } from './resources'`. Dropping
    // this export does not fail here first — it fails `tsc` for all 1,029 call
    // sites at once, with an error that points nowhere near the generator.
    expect(en).toBe(resources.en.translation);
    expect(en['common']).toBeDefined();
  });

  it('carries the whole corpus — 17,028 leaves across 15 locales', () => {
    // A generator that silently dropped a namespace would still produce a
    // structurally valid object; only the count catches it.
    //
    // 17,028 = 16,817 original, plus the 16 CLDR `many` forms FR-017 added to
    // fr/it/es-MX/pt-BR (without them MODE A selects `many`, misses, and falls
    // through to English at large counts), plus the 195 desktop-onboarding
    // strings spec 007 added (13 `onboarding.welcome.*` keys × 15 locales).
    // The number moving is the point; it should only ever move deliberately.
    const total = SUPPORTED_LANGUAGES.reduce((n, l) => n + countLeaves(resources[l].translation), 0);
    expect(total).toBe(17_028);
  });

  it('preserves load-bearing leading and trailing whitespace', () => {
    // 39 values are sentence fragments concatenated at render time, and
    // zh/zh-TW/zh-HK deliberately OMIT the spaces — so no uniform trim rule is
    // safe, and any trimming step in the pipeline shows up right here.
    expect(en.onboarding.create.ack3).toMatch(/ $/);
    expect(en.home.switcherAccountCount).toMatch(/ $/);
  });
});
