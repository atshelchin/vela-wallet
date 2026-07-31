/**
 * The web adapter, end to end (spec 005-web-i18n-adoption, T040–T044).
 *
 * TWO THINGS ABOUT THIS FILE ARE LOAD-BEARING AND EASY TO GET WRONG.
 *
 * 1. It imports the web module by EXPLICIT PATH. A bare `@/i18n` resolves
 *    `index.ts` — the native file — because `jest.config.js` lists no `.web.ts`
 *    in `moduleFileExtensions`. Import it the obvious way and this whole suite
 *    silently tests plain i18next against plain i18next.
 *
 * 2. It compares the ENGINE's result against the ORACLE's, never the seam's
 *    return value. Under FR-016 the seam returns the oracle whenever the two
 *    disagree — that is what keeps the product safe while the engine is on trial
 *    — so `expect(i18n.t(k)).toBe(oracle.t(k))` passes no matter how wrong the
 *    engine is. It is the single easiest way to ship a green, vacuous suite.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }] }));
// `expo-constants` ships ESM that jest's transform does not take.
jest.mock('@/constants/build-info', () => ({ APP_VERSION: '0.0.0', GIT_COMMIT: 'testsha' }));

const REPO = join(__dirname, '..', '..', '..');
const asset = (lng: string) => new Uint8Array(readFileSync(join(REPO, 'public/i18n', `${lng}.json`)));

const LOCALES = ['en', 'zh', 'zh-TW', 'zh-HK', 'ja', 'ko', 'vi', 'id', 'tr', 'es-MX', 'pt-BR', 'fr', 'de', 'ru', 'it'];

/** Every leaf key in the corpus, from the generated `en` export (R8 — no second source). */
function leafKeys(obj: unknown, prefix = '', out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) leafKeys(v, p, out);
    else out.push(p);
  }
  return out;
}

describe('web i18n adapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the module under test is dynamically imported
  let web: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let i18n: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let engine: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oracle: any;
  let KEYS: string[];

  beforeAll(async () => {
    web = await import('@/i18n/index.web');
    i18n = web.default;

    // A SECOND, untouched i18next over the same resources: the oracle for
    // assertions. Using the adapter's own captured oracle would be circular —
    // any mistake installing the seam would corrupt both sides identically.
    const { createInstance } = await import('i18next');
    const { resources } = await import('@/i18n/resources');
    oracle = createInstance();
    await oracle.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: LOCALES,
      load: 'currentOnly',
      interpolation: { escapeValue: false },
      returnNull: false,
    });

    // The raw engine, for rust-side results.
    const wasm = await import('../../../rust/pkg-web/vela_core.js');
    engine = new (wasm as unknown as { I18n: new (b: Uint8Array) => unknown }).I18n(asset('en'));

    const { en } = await import('@/i18n/resources');
    KEYS = leafKeys(en);
  });

  it('is serving translations from the Rust engine, not from i18next', () => {
    expect(web.I18N_BACKEND).toBe('rust-wasm');
  });

  it('actually ROUTES i18n.t through the engine — provable despite FR-016', () => {
    // This is the hard one, and my first attempt at it was wrong.
    //
    // Under FR-016 the seam returns the ORACLE's result. For every key where the
    // engines agree — which is all of them — the rendered string is identical
    // whether or not the seam is installed, so no output assertion can detect a
    // seam that was never wired up. I first probed the one behavioural
    // difference (the engine holds `en` plus one locale, i18next has all 15
    // bundled, so a per-call `lng` diverges). That worked only while dispatch was
    // rust-first; installing the harness made the seam return the oracle for that
    // case too, and the probe started passing for the wrong reason.
    //
    // The robust proof is the harness's own counter: if `i18n.t` routes through
    // the seam, comparisons happen. If it does not, the count stays at zero.
    const diag = web.i18nDiagnostics;
    const previous = diag.harnessReport().mode;
    diag.setHarnessMode('every');
    diag.resetHarness();
    try {
      i18n.t('common.cancel');
      i18n.t('send.recipientCount', { count: 2 });
      expect(diag.harnessReport().compared).toBe(2);
    } finally {
      diag.setHarnessMode(previous);
    }

    // The rendered value is still correct either way.
    expect(i18n.t('common.cancel')).toBe('Cancel');
  });

  it('resolves every key in every language identically to i18next', () => {
    const divergences: string[] = [];
    let compared = 0;

    for (const lng of LOCALES) {
      // MUST make the locale resident first. The engine holds one non-`en` slot,
      // so a loop that skips this compares 14 of the 15 against English and
      // reports a clean run.
      if (lng !== 'en') engine.loadCatalog(lng, asset(lng));
      engine.changeLanguage(lng);
      oracle.changeLanguage(lng);

      for (const key of KEYS) {
        compared++;
        const rust = engine.t(key);
        const want = oracle.t(key);
        if (rust !== want && divergences.length < 20) {
          divergences.push(`${lng}::${key}\n  rust:    ${JSON.stringify(rust)}\n  i18next: ${JSON.stringify(want)}`);
        }
      }
    }

    expect(compared).toBe(LOCALES.length * KEYS.length);
    expect(divergences).toEqual([]);
  });

  it('agrees on the option shapes the app actually passes', () => {
    // The app's entire vocabulary: defaultValue, count, and plain vars.
    const shapes: Array<Record<string, unknown>> = [
      { count: 0 }, { count: 1 }, { count: 2 }, { count: 5 }, { count: 11 }, { count: 21 }, { count: 1.5 },
      { defaultValue: 'FALLBACK' },
      { defaultValue: '{{n}} left', n: 3 },
      { n: 0 }, { n: 42 }, { n: -1 },
      { amount: '1.5', token: 'ETH' },
      // FR-024: reachable from services/activity.ts, and invisible to the corpus.
      { n: Number.NaN }, { n: Number.POSITIVE_INFINITY }, { n: Number.NEGATIVE_INFINITY },
    ];
    const probes = ['send.recipientCount', 'contacts.groupMembers', 'time.minutesShort', 'home.toastReceived', 'common.cancel'];

    const divergences: string[] = [];
    for (const lng of LOCALES) {
      if (lng !== 'en') engine.loadCatalog(lng, asset(lng));
      engine.changeLanguage(lng);
      oracle.changeLanguage(lng);
      for (const key of probes) {
        for (const opts of shapes) {
          const rust = engine.t(key, opts);
          const want = oracle.t(key, opts);
          if (rust !== want && divergences.length < 20) {
            divergences.push(`${lng}::${key} ${JSON.stringify(opts)}\n  rust:    ${JSON.stringify(rust)}\n  i18next: ${JSON.stringify(want)}`);
          }
        }
      }
    }
    expect(divergences).toEqual([]);
  });

  it('matches i18next on the per-call lng shape react-i18next stamps on every hook call', () => {
    // getFixedT sets `o.lng = i18n.language` on 100% of hook traffic, which is a
    // different engine branch from `changeLanguage`. FR-006 forwards it rather
    // than stripping it, so it has to be exercised.
    const divergences: string[] = [];
    for (const lng of LOCALES) {
      if (lng !== 'en') engine.loadCatalog(lng, asset(lng));
      engine.changeLanguage(lng);
      oracle.changeLanguage(lng);
      for (const key of KEYS.slice(0, 200)) {
        const rust = engine.t(key, { lng, ns: 'translation' });
        const want = oracle.t(key, { lng, ns: 'translation' });
        if (rust !== want && divergences.length < 10) {
          divergences.push(`${lng}::${key} rust=${JSON.stringify(rust)} i18next=${JSON.stringify(want)}`);
        }
      }
    }
    expect(divergences).toEqual([]);
  });

  // FR-022 — these cannot live in the committed corpus: it encodes them as
  // `{"__t":"undefined"}` and decodes the tag Rust-side, so a vector would pass
  // while the real boundary diverged.
  describe('boundary cases the corpus structurally cannot express', () => {
    it('normalises an own-but-undefined count to match i18next', () => {
      engine.loadCatalog('ja', asset('ja'));
      engine.changeLanguage('ja');
      oracle.changeLanguage('ja');

      const { normaliseOptions } = require('@/i18n/seam') as typeof import('@/i18n/seam');
      const raw = { count: undefined };
      const want = oracle.t('send.recipientCount', raw);

      // Raw, it diverges — which is exactly why the normaliser exists.
      expect(engine.t('send.recipientCount', raw)).not.toBe(want);
      // Normalised, it agrees.
      expect(engine.t('send.recipientCount', normaliseOptions(raw))).toBe(want);
    });

    it('does not let a rejected option poison the engine (FR-023)', () => {
      const e = engine;
      e.loadCatalog('ja', asset('ja'));
      e.changeLanguage('ja');
      try {
        e.t('common.cancel', { ordinal: undefined });
      } catch {
        /* rejecting is fine */
      }
      // Before the fix this threw "recursive use of an object detected" forever,
      // pinning the UI to the boot language while i18n.language moved.
      expect(() => e.changeLanguage('ja')).not.toThrow();
      expect(() => e.loadCatalog('ja', asset('ja'))).not.toThrow();
    });

    it('survives a throwing getter without poisoning, because the seam reads it in JS first', () => {
      const { normaliseOptions, UnreadableOptionsError } = require('@/i18n/seam') as typeof import('@/i18n/seam');
      const hostile = {
        get v() {
          throw new Error('boom');
        },
      };
      // Read in JS, where the throw is catchable. Handed to the engine it would
      // escape the wasm call without unwinding Rust and leak the borrow guard.
      expect(() => normaliseOptions(hostile)).toThrow(UnreadableOptionsError);
    });
  });

  it('routes exists() through the engine, not the JS store (FR-004)', async () => {
    // `exists` has NO behavioural provenance — Rust and i18next agree on every
    // shape probed — so an output assertion cannot detect a missing override.
    // Counting calls is the only check that can.
    const { createSeam } = await import('@/i18n/seam');
    const calls: string[] = [];
    const seam = createSeam({
      engine: {
        t: () => 'x',
        tFirst: () => 'x',
        exists: (k: string) => {
          calls.push(k);
          return true;
        },
      },
      oracleT: () => 'oracle',
      oracleExists: () => false,
    });

    expect(seam.exists('common.cancel')).toBe(true);
    expect(calls).toEqual(['common.cancel']);
  });

  it('keeps the TS and Rust supported-language lists in agreement (FR-021)', async () => {
    const { SUPPORTED_LANGUAGES } = await import('@/i18n/shared');
    const resolveRs = readFileSync(join(REPO, 'rust/crates/vela-core/src/i18n/resolve.rs'), 'utf8');
    const block = /const SUPPORTED[^=]*=\s*\[([\s\S]*?)\];/.exec(resolveRs);
    expect(block).not.toBeNull();
    const rust = [...(block?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    // SORTED. The two lists are set-equal but order-different today
    // (…tr, ru, es-MX… vs …tr, es-MX, …, ru, it); asserting order fails on day one.
    expect([...rust].sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('sweeps every key in every language THROUGH THE SEAM with zero divergences', async () => {
    // The proving-ground assertion. `scripts/verify-i18n-parity.mjs` already
    // replays 67,115 comparisons offline and proves the ENGINE; this proves the
    // ADOPTION — it runs through the installed seam in the assembled module, so
    // it exercises the normaliser, the catalog the store actually made resident,
    // the `lng` react-i18next stamps on hook traffic, and the harness itself.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const lng = /\/i18n\/([^.]+)\.json/.exec(String(input))?.[1] ?? '';
      return new Response(readFileSync(join(REPO, 'public/i18n', `${lng}.json`)), { status: 200 });
    }) as typeof fetch;

    try {
      const { setLanguagePreference } = web;
      const diag = web.i18nDiagnostics;
      diag.resetHarness();

      let totalCompared = 0;
      const allDivergences: unknown[] = [];

      for (const lng of LOCALES) {
        const effective = await setLanguagePreference(lng);
        expect(effective).toBe(lng); // the switch must actually have happened

        diag.resetHarness();
        const report = diag.sweep();
        totalCompared += report.compared;
        allDivergences.push(...report.divergences);
      }

      expect(allDivergences).toEqual([]);
      expect(totalCompared).toBe(LOCALES.length * KEYS.length);
      expect(diag.residentLocales().sort()).toEqual(['en', 'it'].sort()); // last locale + en
    } finally {
      globalThis.fetch = realFetch;
      await web.setLanguagePreference('en');
    }
  }, 60_000);

  it('exposes the same surface as the native module, plus web-only diagnostics', async () => {
    const native = await import('@/i18n');
    const extra = Object.keys(web).filter((k) => !(k in native));
    // Additive only: anything the native module has, the web module must have,
    // or a shared import breaks on one platform and not the other.
    const missing = Object.keys(native).filter((k) => !(k in web));
    expect(missing).toEqual([]);
    expect(extra.sort()).toEqual(['I18N_BACKEND', 'i18nDiagnostics']);
  });
});
