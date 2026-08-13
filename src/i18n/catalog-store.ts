/**
 * Catalog acquisition, caching and lifecycle for the Rust i18n engine (spec
 * 005-web-i18n-adoption, contracts/web-i18n-seam.md §3).
 *
 * **Deliberately a plain `.ts`, not `.ts`.** `jest.config.js:23` lists no
 * `.ts` in `moduleFileExtensions`, so anything living in `index.ts` is
 * invisible to every runner in CI. Everything here — the fetch, the validation,
 * the cache, the race guard, the rollback — is therefore testable today with no
 * config change. `index.ts` keeps only the wasm import itself.
 *
 * The engine is INJECTED for the same reason: a module that never touches the
 * wasm needs no wasm to be tested.
 *
 * The one constraint everything below exists to serve: the engine holds exactly
 * **one** non-`en` catalog slot (`mod.rs:280` — `load_catalog` is
 * `self.active.replace`). Loading a second locale silently evicts the first, and
 * `catalog_for` then answers in English with no error of any kind. JS must
 * therefore stay authoritative about what is resident; the engine will not tell
 * us.
 */

/** The slice of the wasm `I18n` surface this module needs. */
export interface CatalogEngine {
  loadCatalog(lang: string, json: Uint8Array): void;
  changeLanguage(lng: string): { language: string; languages: string[] };
  /** Frees `lang` if it is the active catalog. The fallback is never releasable. */
  releaseCatalog(lang: string): boolean;
  residentLocales(): string[];
  residentBytes(): number;
}

export interface CatalogStoreDeps {
  engine: CatalogEngine;
  /** Injected so tests can stub it; defaults to the global. */
  fetchImpl?: typeof fetch;
  /**
   * Cache-buster. Catalogs are the ONLY exported asset that is not
   * content-hashed — `copyPublicFolderAsync` copies `public/` verbatim — so
   * without this a CDN can pair yesterday's catalog with today's bundle.
   */
  buildId: string;
  /**
   * Per-request timeout. This is not belt-and-braces: `loadLanguage()` runs
   * inside the boot `Promise.all` in `src/app/_layout.tsx`, which has no
   * watchdog of its own, so a hung catalog request is a permanent spinner.
   */
  timeoutMs?: number;
  /** The always-resident fallback. Never fetched, never evicted. */
  fallback?: string;
  /**
   * Called when a switch could not be completed.
   *
   * Required by US3 scenario 3: a failed switch must be SURFACED, not swallowed.
   * `setLanguage` resolves (rather than rejects) so callers keep rendering, which
   * means a `.catch()` on the caller's side can never fire — without this hook an
   * offline switch is indistinguishable from a successful one.
   */
  onFailure?: (lng: string, cause: unknown) => void;
}

/** How many NON-fallback catalogs to keep in JS. */
const CACHE_LIMIT = 2;

const DEFAULT_TIMEOUT_MS = 8_000;

export interface CatalogStore {
  /** Fetch (or return cached) catalog bytes for `lng`. */
  catalogBytes(lng: string): Promise<Uint8Array>;
  /**
   * Make `lng` the rendering language. Resolves to the tag **actually in
   * effect** — which is the previous one if the catalog could not be obtained.
   */
  setLanguage(lng: string): Promise<string>;
  /** The tag last successfully handed to `engine.changeLanguage`. */
  engineLanguage(): string;
  /** Diagnostics: what the engine currently holds. */
  residentLocales(): string[];
  residentBytes(): number;
  /** Diagnostics: which locales JS has bytes for, oldest first. */
  cachedLocales(): string[];
}

export class CatalogFetchError extends Error {
  readonly lng: string;
  readonly status?: number;

  constructor(lng: string, message: string, status?: number) {
    super(message);
    this.name = 'CatalogFetchError';
    this.lng = lng;
    this.status = status;
  }
}

export function createCatalogStore(deps: CatalogStoreDeps): CatalogStore {
  const { engine, buildId, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS, fallback = 'en', onFailure } = deps;

  // Resolved per call, NOT captured at construction. The store is built at module
  // import, so capturing `globalThis.fetch` then would freeze whatever existed at
  // that instant — invisible to a later polyfill, and untestable.
  const resolveFetch = () => fetchImpl ?? globalThis.fetch;

  // Insertion-ordered, so the first key is the least recently used.
  const cache = new Map<string, Uint8Array>();
  const inflight = new Map<string, Promise<Uint8Array>>();

  // THE single JS mirror of engine state (data-model.md). Written on all four
  // paths: boot, successful switch, failure rollback, and recovery. Deliberately
  // not derived from `engine.language()` — that costs a wasm string allocation
  // per read, and the entire point is to know what JS *believes*, so a drift
  // from what the engine actually holds is detectable rather than papered over.
  let engineLang = fallback;

  // Monotonic; a fetch that resolves after a newer switch began is discarded.
  let generation = 0;

  function remember(lng: string, bytes: Uint8Array): void {
    if (lng === fallback) return; // bundled; never cached, never evicted
    cache.delete(lng);
    cache.set(lng, bytes);
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  async function fetchCatalog(lng: string): Promise<Uint8Array> {
    const doFetch = resolveFetch();
    if (!doFetch) {
      throw new CatalogFetchError(lng, 'no fetch implementation available');
    }
    const url = `/i18n/${lng}.json?v=${encodeURIComponent(buildId)}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The abort signal cancels the request; the race is what guarantees this
    // promise SETTLES. Those are different jobs, and only the second one
    // protects the boot gate: a `fetch` that ignores its signal would otherwise
    // hang `Promise.all` in `_layout.tsx` forever, which renders as a permanent
    // spinner with no error anywhere.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CatalogFetchError(lng, `catalog ${lng} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      // A pending catalog timeout must never be a reason for the process to stay
      // alive. Node-only; browsers return a number with no `unref`.
      (timer as unknown as { unref?: () => void }).unref?.();
    });

    let res: Response;
    try {
      res = await Promise.race([doFetch(url, { signal: controller.signal }), timeout]);
    } catch (cause) {
      if (cause instanceof CatalogFetchError) throw cause;
      throw new CatalogFetchError(lng, `catalog request failed: ${String(cause)}`);
    } finally {
      clearTimeout(timer);
    }

    // Check `ok` BEFORE reading the body. A missing catalog does not come back
    // as a clean 404 body — expo-router serves its `+not-found` shell, ~56 KB of
    // HTML, and handing that to `loadCatalog` throws `I18nCatalogParse: expected
    // value at line 1 column 1`. Relying on the parse error as the guard would
    // surface a parser message instead of an actionable state.
    if (!res.ok) {
      throw new CatalogFetchError(lng, `catalog ${lng} unavailable (HTTP ${res.status})`, res.status);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) {
      throw new CatalogFetchError(lng, `catalog ${lng} was empty`);
    }
    return new Uint8Array(buf);
  }

  async function catalogBytes(lng: string): Promise<Uint8Array> {
    const hit = cache.get(lng);
    if (hit) {
      remember(lng, hit); // refresh recency
      return hit;
    }
    // Coalesce concurrent requests for the same locale — a fast double switch
    // would otherwise issue two identical fetches and break SC-004's "exactly
    // one request" claim.
    const pending = inflight.get(lng);
    if (pending) return pending;

    const p = fetchCatalog(lng)
      .then((bytes) => {
        remember(lng, bytes);
        return bytes;
      })
      .finally(() => {
        inflight.delete(lng);
      });
    inflight.set(lng, p);
    return p;
  }

  async function setLanguage(lng: string): Promise<string> {
    const mine = ++generation;
    const previous = engineLang;

    if (lng === engineLang) return engineLang;

    // The fallback is pinned in the engine and never needs loading.
    if (lng === fallback) {
      engine.changeLanguage(lng);
      // `changeLanguage` does NOT free the outgoing catalog — measured: after
      // switching fr -> en the engine still reports ['en','fr']. Releasing it
      // explicitly is what makes SC-003's "exactly the active one and en" true
      // rather than merely bounded. The bytes stay in the JS cache, so coming
      // back costs a `loadCatalog`, not a refetch.
      if (previous !== fallback) engine.releaseCatalog(previous);
      engineLang = lng;
      return lng;
    }

    let bytes: Uint8Array;
    try {
      bytes = await catalogBytes(lng);
    } catch (cause) {
      // A newer switch may have SUCCEEDED while this one was failing. Rolling back
      // to `previous` — captured before the await — would then clobber the mirror
      // with a two-generations-stale tag: the engine renders the newer language
      // while `engineLanguage()` claims the older one, and because `setLanguage`
      // early-returns on `lng === engineLang`, switching back to that older
      // language becomes a PERMANENT silent no-op.
      //
      // The failure path needs the same generation guard as the success path.
      if (mine !== generation) return engineLang;
      engineLang = previous;
      onFailure?.(lng, cause);
      return previous;
    }

    // A newer switch started while this fetch was in the air. Loading now would
    // EVICT the locale that newer switch installed, and the engine would answer
    // in English — not in this language, which would at least be visibly wrong.
    // This guard is the only defence; the engine reports nothing.
    if (mine !== generation) return engineLang;

    try {
      // Order is load-bearing (FR-010): `changeLanguage` performs no I/O, so
      // calling it before `loadCatalog` yields a healthy-looking LanguageState and
      // English text.
      //
      // Inside the try because a 200 response carrying garbage parses in RUST, not
      // in `fetch` — `loadCatalog` is where `I18nCatalogParse` is raised. Leaving
      // it uncaught turned a soft failure into a rejected promise, and on the boot
      // path a rejection takes down the whole `_layout.tsx` gate.
      engine.loadCatalog(lng, bytes);
      engine.changeLanguage(lng);
    } catch (cause) {
      // The bytes are bad, so they must not stay cached — otherwise every later
      // attempt replays them from memory and the language can never recover, even
      // after the server is fixed.
      cache.delete(lng);
      if (mine !== generation) return engineLang;
      engineLang = previous;
      onFailure?.(lng, cause);
      return previous;
    }

    engineLang = lng;
    return lng;
  }

  return {
    catalogBytes,
    setLanguage,
    engineLanguage: () => engineLang,
    residentLocales: () => engine.residentLocales(),
    residentBytes: () => engine.residentBytes(),
    cachedLocales: () => [...cache.keys()],
  };
}
