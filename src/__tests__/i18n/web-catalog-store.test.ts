/**
 * Catalog store behaviour (spec 005-web-i18n-adoption, T011).
 *
 * Driven against the REAL wasm engine, not a mock. The single-slot eviction rule
 * this module exists to manage is a property of the Rust engine
 * (`mod.rs:280` — `load_catalog` is `self.active.replace`), so a hand-written
 * double would just re-assert the assumption instead of testing it. `fetch` IS
 * stubbed, because the network is the part under test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCatalogStore, CatalogFetchError, type CatalogEngine } from '@/i18n/catalog-store';

const REPO = join(__dirname, '..', '..', '..');
const asset = (lng: string) => new Uint8Array(readFileSync(join(REPO, 'public/i18n', `${lng}.json`)));

type WasmModule = typeof import('../../../rust/pkg-web/vela_core.js');
let wasm: WasmModule;

beforeAll(async () => {
  wasm = (await import('../../../rust/pkg-web/vela_core.js')) as WasmModule;
  // The module ships as a fingerprinted asset in public/ (spec 017 D7 route),
  // so the test reads the same bytes a browser fetches.
  const { WASM_URL } = (await import('../../../rust/pkg-web/vela_core_wasm_url.js')) as {
    WASM_URL: string;
  };
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  wasm.initSync({
    module: readFileSync(join(__dirname, '../../../public', WASM_URL.replace(/^\//, ''))),
  });
});

function newEngine(): CatalogEngine {
  return new wasm.I18n(asset('en')) as unknown as CatalogEngine;
}

/** A `fetch` that serves the real generated catalogs and counts requests. */
function stubFetch(overrides: Record<string, () => Response> = {}) {
  const calls: string[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const lng = /\/i18n\/([^.]+)\.json/.exec(url)?.[1] ?? '';
    const override = overrides[lng];
    if (override) return override();
    const body = readFileSync(join(REPO, 'public/i18n', `${lng}.json`));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const store = (engine: CatalogEngine, fetchImpl: typeof fetch, timeoutMs = 5_000) =>
  createCatalogStore({ engine, fetchImpl, buildId: 'testsha', timeoutMs });

describe('catalog store', () => {
  it('fetches exactly one catalog on a cold non-English load, and busts cache by build id', async () => {
    const { impl, calls } = stubFetch();
    const s = store(newEngine(), impl);

    expect(await s.setLanguage('ja')).toBe('ja');

    // SC-004: one request, not fifteen.
    expect(calls).toEqual(['/i18n/ja.json?v=testsha']);
    expect(s.engineLanguage()).toBe('ja');
  });

  it('renders the target language, proving order fetch -> loadCatalog -> changeLanguage', async () => {
    const { impl } = stubFetch();
    const engine = newEngine();
    const s = store(engine, impl);

    await s.setLanguage('ja');

    // Reversing the order would leave a healthy-looking LanguageState and
    // English text, so asserting the rendered string is the only real check.
    expect((engine as unknown as { t(k: string, o?: unknown): string }).t('common.cancel')).toBe('キャンセル');
  });

  it('survives ja -> ru -> ja with one fetch each, despite the engine holding ONE non-en slot', async () => {
    const { impl, calls } = stubFetch();
    const engine = newEngine();
    const s = store(engine, impl);
    const t = (engine as unknown as { t(k: string, o?: unknown): string }).t.bind(engine);

    await s.setLanguage('ja');
    expect(t('common.cancel')).toBe('キャンセル');

    await s.setLanguage('ru');
    expect(t('common.cancel')).toBe('Отмена');

    // Returning to `ja` must re-install it. Without the JS cache the engine has
    // silently dropped `ja` and would answer in English with no error at all.
    await s.setLanguage('ja');
    expect(t('common.cancel')).toBe('キャンセル');

    expect(calls.filter((c) => c.includes('/ja.json'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/ru.json'))).toHaveLength(1);
  });

  it('keeps residency at [active, en] — never more, never fewer', async () => {
    const { impl } = stubFetch();
    const engine = newEngine();
    const s = store(engine, impl);

    expect(s.residentLocales().sort()).toEqual(['en']);

    for (const lng of ['ja', 'ru', 'de', 'fr']) {
      await s.setLanguage(lng);
      expect(s.residentLocales().sort()).toEqual([lng, 'en'].sort());
    }

    // Selecting English is the case an `['x','en']`-shaped assertion gets wrong.
    await s.setLanguage('en');
    expect(s.residentLocales().sort()).toEqual(['en']);
    expect(s.engineLanguage()).toBe('en');
  });

  it('bounds the JS cache at two non-English locales', async () => {
    const { impl } = stubFetch();
    const s = store(newEngine(), impl);

    for (const lng of ['ja', 'ru', 'de']) await s.setLanguage(lng);

    expect(s.cachedLocales()).toEqual(['ru', 'de']);
    expect(s.cachedLocales()).not.toContain('en');
  });

  it('rejects a 404 on response.ok, NOT on the parse error', async () => {
    // What a missing catalog really returns: expo-router's +not-found HTML shell.
    const html = '<!DOCTYPE html><html><body>Unmatched Route</body></html>';
    const { impl } = stubFetch({
      xx: () => new Response(html, { status: 404, headers: { 'content-type': 'text/html' } }),
    });
    const s = store(newEngine(), impl);

    await expect(s.catalogBytes('xx')).rejects.toBeInstanceOf(CatalogFetchError);
    await expect(s.catalogBytes('xx')).rejects.toThrow(/HTTP 404/);
    // The failure must name the state, not leak a JSON parser message.
    await expect(s.catalogBytes('xx')).rejects.not.toThrow(/expected value at line/);
  });

  it('falls back to the language already in effect when a catalog cannot be fetched', async () => {
    const { impl } = stubFetch({
      ru: () => new Response('nope', { status: 500 }),
    });
    const engine = newEngine();
    const s = store(engine, impl);
    const t = (engine as unknown as { t(k: string, o?: unknown): string }).t.bind(engine);

    await s.setLanguage('ja');
    expect(await s.setLanguage('ru')).toBe('ja');

    // Still Japanese, and the mirror agrees — a failed switch must not leave the
    // app claiming a language it is not rendering.
    expect(s.engineLanguage()).toBe('ja');
    expect(t('common.cancel')).toBe('キャンセル');
  });

  it('discards a late fetch so it cannot evict the locale the UI is showing', async () => {
    let releaseJa: (() => void) | undefined;
    const jaGate = new Promise<void>((r) => {
      releaseJa = r;
    });
    const { impl } = stubFetch();
    const gated = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/ja.json')) await jaGate;
      return (impl as unknown as typeof fetch)(input, init);
    }) as unknown as typeof fetch;

    const engine = newEngine();
    const s = store(engine, gated);
    const t = (engine as unknown as { t(k: string, o?: unknown): string }).t.bind(engine);

    const slow = s.setLanguage('ja'); // stalls
    const fast = await s.setLanguage('ru'); // overtakes it
    expect(fast).toBe('ru');

    releaseJa?.();
    await slow;

    // Without the generation guard the late `ja` load evicts `ru`, and the engine
    // then answers in ENGLISH — not Japanese, which would at least be visible.
    expect(s.engineLanguage()).toBe('ru');
    expect(t('common.cancel')).toBe('Отмена');
  });

  it('coalesces concurrent requests for the same locale', async () => {
    const { impl, calls } = stubFetch();
    const s = store(newEngine(), impl);

    await Promise.all([s.catalogBytes('ja'), s.catalogBytes('ja'), s.catalogBytes('ja')]);

    expect(calls.filter((c) => c.includes('/ja.json'))).toHaveLength(1);
  });

  it('times out rather than hanging the boot gate forever', async () => {
    const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const s = store(newEngine(), never, 25);

    await expect(s.catalogBytes('ja')).rejects.toBeInstanceOf(CatalogFetchError);
  });
});
