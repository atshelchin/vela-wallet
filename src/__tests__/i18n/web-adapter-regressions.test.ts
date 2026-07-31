/**
 * Regressions found by the pre-merge adversarial review of spec 005.
 *
 * Every case here is a defect that the delivered 66-test suite did NOT catch.
 * That is the point of the file: the review broke six things in the shipped code
 * and **four left the whole suite green**, so the suite was not, in general,
 * capable of detecting a broken adoption. These are the assertions that close
 * that gap — the mutation each one is designed to fail against is named in its
 * comment, so a future reader can re-run the experiment.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCatalogStore, type CatalogEngine } from '@/i18n/catalog-store';
import { createSeam, normaliseOptions, UnreadableOptionsError } from '@/i18n/seam';
import { createDiffHarness, encodeOptions } from '@/i18n/diff-harness';

const REPO = join(__dirname, '..', '..', '..');
const asset = (lng: string) => new Uint8Array(readFileSync(join(REPO, 'public/i18n', `${lng}.json`)));

type WasmModule = typeof import('../../../rust/pkg-web/vela_core.js');
let wasm: WasmModule;

beforeAll(async () => {
  wasm = (await import('../../../rust/pkg-web/vela_core.js')) as WasmModule;
  const { WASM_BASE64 } = (await import('../../../rust/pkg-web/vela_core_bg.base64.js')) as {
    WASM_BASE64: string;
  };
  wasm.initSync({ module: Buffer.from(WASM_BASE64, 'base64') });
});

const newEngine = () => new wasm.I18n(asset('en')) as unknown as CatalogEngine;
const engineT = (e: unknown) => (e as { t(k: string, o?: unknown): string }).t.bind(e);

// ---------------------------------------------------------------------------
// Catalog store — the blocker
// ---------------------------------------------------------------------------

describe('catalog store: a failing switch must not clobber a newer successful one', () => {
  it('keeps the mirror on the language that actually won the race', async () => {
    // MUTATION THIS CATCHES: dropping the `mine !== generation` guard from the
    // FAILURE branch of setLanguage.
    //
    // Without it: a slow switch to `ja` fails AFTER a fast switch to `ru`
    // succeeded, and rolls the mirror back to the pre-`ja` value. The engine then
    // renders Russian while engineLanguage() says 'en' — and because setLanguage
    // early-returns on `lng === engineLang`, switching back to 'en' becomes a
    // PERMANENT silent no-op.
    let releaseJa: (() => void) | undefined;
    const jaGate = new Promise<void>((r) => {
      releaseJa = r;
    });

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/ja.json')) {
        await jaGate;
        return new Response('nope', { status: 503 }); // slow AND failing
      }
      const lng = /\/i18n\/([^.]+)\.json/.exec(url)?.[1] ?? '';
      return new Response(readFileSync(join(REPO, 'public/i18n', `${lng}.json`)), { status: 200 });
    }) as unknown as typeof fetch;

    const engine = newEngine();
    const t = engineT(engine);
    const store = createCatalogStore({ engine, fetchImpl, buildId: 'x', timeoutMs: 5_000 });

    const slow = store.setLanguage('ja');
    expect(await store.setLanguage('ru')).toBe('ru');

    releaseJa?.();
    await slow;

    expect(store.engineLanguage()).toBe('ru');
    expect(t('common.cancel')).toBe('Отмена');

    // The consequence that made this a blocker rather than a cosmetic drift.
    expect(await store.setLanguage('en')).toBe('en');
    expect(t('common.cancel')).toBe('Cancel');
  });

  it('soft-fails on a 200 that carries garbage, and does not cache the bad bytes', async () => {
    // MUTATION THIS CATCHES: moving engine.loadCatalog/changeLanguage back outside
    // the try/catch.
    //
    // A 200 with a non-JSON body passes the response.ok check and only fails
    // inside Rust. Uncaught, that REJECTS setLanguage — and on the boot path a
    // rejection takes down the whole _layout.tsx Promise.all gate, i.e. a blank
    // app rather than an English one.
    let serveGarbage = true;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const lng = /\/i18n\/([^.]+)\.json/.exec(String(input))?.[1] ?? '';
      if (lng === 'ja' && serveGarbage) return new Response('<!DOCTYPE html>oops', { status: 200 });
      return new Response(readFileSync(join(REPO, 'public/i18n', `${lng}.json`)), { status: 200 });
    }) as unknown as typeof fetch;

    const failures: string[] = [];
    const engine = newEngine();
    const store = createCatalogStore({
      engine,
      fetchImpl,
      buildId: 'x',
      onFailure: (lng) => failures.push(lng),
    });

    await expect(store.setLanguage('ja')).resolves.toBe('en');
    expect(store.engineLanguage()).toBe('en');
    expect(failures).toEqual(['ja']); // US3 scenario 3: surfaced, not swallowed

    // The bad bytes must not be cached, or the language can never recover.
    expect(store.cachedLocales()).not.toContain('ja');
    serveGarbage = false;
    expect(await store.setLanguage('ja')).toBe('ja');
    expect(engineT(engine)('common.cancel')).toBe('キャンセル');
  });
});

// ---------------------------------------------------------------------------
// Seam
// ---------------------------------------------------------------------------

describe('seam: option normalisation', () => {
  it('injects count into an object `replace` too', () => {
    // MUTATION THIS CATCHES: skipping the injection when `replace` is an object.
    // MEASURED against i18next: t('X={{count}}', {count: undefined, replace:{v:9}})
    // renders "X=", NOT "X={{count}}". The old comment claimed the opposite.
    const out = normaliseOptions({ count: undefined, v: 1, replace: { v: 9 } });
    expect(out?.replace).toEqual({ v: 9, count: null });
    expect('count' in (out ?? {})).toBe(false);
  });

  it('refuses an array `replace` rather than guessing', () => {
    expect(() => normaliseOptions({ count: undefined, replace: [1, 2] })).toThrow(
      UnreadableOptionsError,
    );
  });

  it('catches a getter that throws ONE LEVEL DOWN', () => {
    // MUTATION THIS CATCHES: reverting safeClone to a shallow spread.
    // serde walks the whole tree, so a nested getter fires inside Rust, escapes
    // without unwinding, and leaks the borrow guard — permanently. i18next never
    // trips it, because it only looks up names a template mentions.
    const hostile = {
      outer: {
        get boom() {
          throw new Error('nested boom');
        },
      },
    };
    expect(() => normaliseOptions(hostile)).toThrow(UnreadableOptionsError);
  });

  it('does not choke on t(key, null, third)', async () => {
    // MUTATION THIS CATCHES: re-adding `|| second === null` to the overload
    // predicate. `typeof null === 'object'`, so i18next treats null as an options
    // bag; routing it to overloadTranslationOptionHandler throws a TypeError out
    // of the seam where i18next returns normally.
    //
    // The handler must be i18next's REAL one. An earlier version of this test
    // omitted it, so the seam fell back to `{defaultValue: String(second)}` — a
    // path that cannot throw, which made the test pass with the bug reinstated.
    // A regression test that cannot fail is a false receipt.
    const { createInstance } = await import('i18next');
    const probe = createInstance();
    await probe.init({ resources: { en: { translation: { k: 'K' } } }, lng: 'en' });

    const seam = createSeam({
      engine: { t: () => 'ENGINE', tFirst: () => 'ENGINE', exists: () => true },
      oracleT: () => 'ORACLE',
      oracleExists: () => true,
      overloadHandler: probe.options.overloadTranslationOptionHandler as unknown as (
        args: unknown[],
      ) => Record<string, unknown> | undefined,
    });

    expect(() => seam.t('k', null)).not.toThrow();
    expect(() => seam.t('k', null, { v: 3 })).not.toThrow();
    // And the genuine string-default overload still works through that handler.
    expect(seam.t('k', 'A DEFAULT')).toBe('ENGINE');
  });
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

describe('harness: the first-seen cache key must be injective', () => {
  it('does not collapse a numeric and a string option value', () => {
    expect(encodeOptions({ count: 1 })).not.toBe(encodeOptions({ count: '1' }));
    expect(encodeOptions({ v: true })).not.toBe(encodeOptions({ v: 'true' }));
    expect(encodeOptions({ v: null })).not.toBe(encodeOptions({ v: 'null' }));
  });

  it('carries a type marker on EVERY scalar, not just enough to avoid one collision', () => {
    // MUTATION THIS CATCHES: dropping any SINGLE type prefix.
    //
    // The pairwise test above is not sufficient, and a mutation run proved it:
    // removing only the number prefix still leaves `s:"1"` on the string side, so
    // the pair stays distinct and the assertion passes while the encoding has
    // silently become one step from collapsing. Pinning the exact shape is the
    // only form that fails on a single regression — and pinning it is justified
    // here because injectivity, not readability, is this string's job.
    expect(encodeOptions({ v: 1 })).toBe('{v:n:1}');
    expect(encodeOptions({ v: '1' })).toBe('{v:s:"1"}');
    expect(encodeOptions({ v: true })).toBe('{v:b:true}');
    expect(encodeOptions({ v: null })).toBe('{v:null:}');
  });

  it('compares both variants rather than retiring one', () => {
    const h = createDiffHarness({ language: () => 'en', mode: 'first-seen', warn: () => undefined });
    let oracleCalls = 0;
    const oracle = () => {
      oracleCalls++;
      return 'SAME';
    };
    h.dispatch('k', { count: 1 }, () => 'SAME', oracle);
    h.dispatch('k', { count: '1' }, () => 'SAME', oracle);
    expect(oracleCalls).toBe(2);
  });
});
