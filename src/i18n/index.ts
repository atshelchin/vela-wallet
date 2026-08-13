/**
 * i18n — WEB entry point. Translation resolution runs on the Rust engine
 * (spec 005-web-i18n-adoption).
 *
 * The adoption is two property assignments, and the pre-override functions are
 * kept as a live oracle. That oracle is the point of the whole feature: web
 * already renders correctly (it has full `Intl.PluralRules`), so this changes
 * nothing a user can see. What it buys is the engine resolving real keys, with
 * real options, at real call sites, with genuine i18next one call away for
 * comparison — evidence no offline corpus can produce, and the thing that
 * licenses the native rollout where the plural defect actually bites.
 *
 * This module needs the wasm ALREADY initialized at import: `src/services/activity.ts`
 * calls `i18n.t()` outside React with no async gate, so there is no point at
 * which an await could be introduced here. Since spec 017 the module is
 * fetched rather than base64-embedded, and the web entry (`index.web.js`)
 * awaits `coreReady` before loading the app graph — so by the time this
 * evaluates, init has happened. `assertCoreInitialized()` turns a broken entry
 * into a clear message instead of a wasm-bindgen panic. The `en` catalog still
 * comes from the bundle rather than the network.
 */
import i18n, { setBeforeLanguageChange, type AppLanguage } from './shared';
import { en } from './resources';
import { createCatalogStore, type CatalogEngine } from './catalog-store';
import { createSeam, type SeamEngine } from './seam';
import { createDiffHarness, type HarnessMode, type HarnessReport } from './diff-harness';
import { GIT_COMMIT } from '@/constants/build-info';

import { initSync, I18n as WasmI18n } from '../../rust/pkg-web/vela_core.js';
import { assertCoreInitialized } from '@/services/vela-core';

// `installI18nConsole` is re-declared below with the real implementation, so it
// is excluded here rather than shadowed — an ambiguous re-export would resolve
// to the native no-op on web.
export {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  LANGUAGE_NATIVE_NAMES,
  getLanguagePreference,
  detectSystemLanguage,
  resolveLanguage,
  loadLanguage,
  setLanguagePreference,
  setBeforeLanguageChange,
} from './shared';
// Re-exported under their own names — aliasing any of these would break every
// web consumer that imports them by name, and only on web.
export type { AppLanguage, LanguagePreference, BeforeLanguageChange } from './shared';
export { default } from './shared';

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

// Node (jest, static export): the harness plants the bytes, and `initSync` is
// idempotent, so initializing here is safe whether or not the facade already
// did. Browsers take the else branch — the entry has already awaited the
// fetch, and this only turns a broken entry into a clear message.
{
  const planted = (globalThis as { __VELA_WASM_BYTES__?: Uint8Array }).__VELA_WASM_BYTES__;
  if (planted) initSync({ module: planted });
  else assertCoreInitialized();
}

/**
 * `en` bytes for the constructor.
 *
 * Taken from the ALREADY-BUNDLED `en` export rather than importing
 * `public/i18n/en.json` a second time: FR-018 keeps `resources` in the web
 * bundle for the whole proving period, so this costs no additional bytes.
 * Re-serialising is exact — `Catalog::from_json` interns every path against the
 * shared table and rebuilds the blob in sorted path order, so JSON key order
 * cannot affect resolution at all.
 *
 * Retained (not dropped after construction) because rebuilding the engine is the
 * only recovery from a poisoned instance, and that recovery must be synchronous.
 */
const EN_BYTES: Uint8Array = new TextEncoder().encode(JSON.stringify(en));

const engine = new WasmI18n(EN_BYTES);

// ---------------------------------------------------------------------------
// Catalog lifecycle
// ---------------------------------------------------------------------------

const catalogs = createCatalogStore({
  engine: engine as unknown as CatalogEngine,
  buildId: GIT_COMMIT,
});

// The web contract for a language switch: make the catalog resident FIRST, and
// report the language actually in effect. `changeLanguage` does no I/O, so the
// reverse order yields a healthy-looking language state and English text.
setBeforeLanguageChange(async (lng: AppLanguage) => {
  const effective = await catalogs.setLanguage(lng);
  return effective as AppLanguage;
});

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

// Captured BEFORE the overwrite, and only meaningful because `init()` has
// already run in `./shared` — a pre-init capture would bind a function with no
// resources behind it, which fails silently rather than loudly.
if (!i18n.isInitialized) {
  throw new Error('i18n: the web seam was installed before i18next finished init');
}

const oracleT = i18n.t.bind(i18n);
const oracleExists = i18n.exists.bind(i18n);

// The harness sits INSIDE the seam's dispatch step and receives already-normalised
// arguments. Default `first-seen` in development: an input is compared until the
// two engines agree once, then trusted — which keeps the rare dynamic-key and
// error-path calls under comparison indefinitely, since those are exactly the ones
// the offline replay never sees. Sampling was rejected for the opposite reason.
const harness = createDiffHarness({
  language: () => catalogs.engineLanguage(),
  mode: __DEV__ ? 'first-seen' : 'off',
});

const seam = createSeam({
  engine: engine as unknown as SeamEngine,
  oracleT: oracleT as unknown as (key: unknown, opts?: unknown) => unknown,
  oracleExists: oracleExists as unknown as (key: unknown, opts?: unknown) => boolean,
  overloadHandler: i18n.options.overloadTranslationOptionHandler as unknown as (
    args: unknown[],
  ) => Record<string, unknown> | undefined,
  dispatch: harness.dispatch,
});

// The two assignments. `t` is reached by react-i18next through `getFixedT`'s live
// `this.t(...)` lookup and by all 20 direct singleton sites; `exists` is a
// separate own property and is not reached through `t` (FR-004).
i18n.t = seam.t as typeof i18n.t;
i18n.exists = seam.exists as typeof i18n.exists;

// ---------------------------------------------------------------------------
// Diagnostics (web-only, additive — see the export-parity test)
// ---------------------------------------------------------------------------

/** Which implementation is serving translations in this bundle. */
export const I18N_BACKEND: 'rust-wasm' | 'js-i18next' = 'rust-wasm';

/** Dev diagnostics over the engine's residency accounting and the harness. */
export const i18nDiagnostics = {
  engineLanguage: () => catalogs.engineLanguage(),
  residentLocales: () => catalogs.residentLocales(),
  residentBytes: () => catalogs.residentBytes(),
  cachedLocales: () => catalogs.cachedLocales(),
  /** `'off' | 'first-seen' | 'every'`. Tests MUST set this rather than inherit it. */
  setHarnessMode: (mode: HarnessMode) => harness.setMode(mode),
  harnessReport: () => harness.report(),
  resetHarness: () => harness.reset(),
  /** Every key x the active language, through both engines, in one pass (T060). */
  sweep: () => sweepActiveLanguage(),
};

/**
 * `vela.i18n*` in the browser console — how you answer "is this actually the
 * Rust engine?" without reading the bundle.
 *
 * It exists because the obvious checks do not work. Rendered text proves
 * nothing: under FR-016 the seam returns the ORACLE's result, so a correct
 * screen looks identical whether the engine is running or absent entirely. The
 * network tab is better — a `/i18n/<lng>.json?v=…` request only happens on this
 * path — but it proves the catalog store ran, not that `t()` routes through the
 * engine. Only the comparison counter proves that.
 */
export function installI18nConsole(): void {
  const g = globalThis as unknown as { vela?: Record<string, unknown> };
  g.vela = Object.assign(g.vela ?? {}, {
    i18n() {
      const r = harness.report();
      console.log(
        [
          `[vela] i18n backend      : ${I18N_BACKEND}`,
          `       engine language   : ${catalogs.engineLanguage()}`,
          `       resident locales  : ${catalogs.residentLocales().join(', ')}`,
          `       resident bytes    : ${catalogs.residentBytes()}`,
          `       JS catalog cache  : ${catalogs.cachedLocales().join(', ') || '(none)'}`,
          `       harness mode      : ${r.mode}`,
          `       comparisons       : ${r.compared}   (0 here means t() is NOT routing through the seam)`,
          `       inputs agreed     : ${r.agreed}`,
          `       divergences       : ${r.divergences.length}`,
          `       engine poisoned   : ${r.poisoned}`,
        ].join('\n'),
      );
      return r;
    },
    /** `vela.i18nMode('every')` to compare on every call. */
    i18nMode(mode: HarnessMode) {
      harness.setMode(mode);
      console.log(`[vela] i18n harness mode -> ${mode}`);
      return mode;
    },
    /** Resolve every key at the active language through both engines. */
    i18nSweep() {
      const before = Date.now();
      const r = sweepActiveLanguage();
      console.log(
        `[vela] swept ${r.compared} keys @${catalogs.engineLanguage()} in ${Date.now() - before}ms — ` +
          `${r.divergences.length} divergence(s)`,
      );
      if (r.divergences.length) console.table(r.divergences);
      return r;
    },
    i18nReset() {
      harness.reset();
      return 'reset';
    },
  });
}

/**
 * Resolve every key in the corpus through the seam at the current language.
 *
 * What this adds over `scripts/verify-i18n-parity.mjs`, which already replays
 * 17,115 exhaustive plus 50,000 fuzzed comparisons offline: this one runs
 * **through the installed seam, in the running app**, so it exercises the
 * normaliser, the `lng` react-i18next stamps on every hook call, the catalog the
 * store actually made resident, and the harness itself. The offline script proves
 * the engine; this proves the adoption.
 */
function sweepActiveLanguage(): HarnessReport {
  const keys: string[] = [];
  (function walk(o: unknown, prefix: string) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else keys.push(p);
    }
  })(en, '');

  const previous = harness.getMode();
  harness.setMode('every');
  // The typed-key union cannot see that these keys came from the corpus itself —
  // they are enumerated from `en`, which is the same object the union derives
  // from, so every one of them is valid by construction.
  const t = i18n.t as unknown as (key: string) => string;
  try {
    for (const key of keys) t(key);
  } finally {
    harness.setMode(previous);
  }
  return harness.report();
}
