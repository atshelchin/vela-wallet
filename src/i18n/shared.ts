/* eslint-disable import/no-named-as-default-member -- this file uses i18next's
   singleton-instance API on purpose: i18n.use(...).init(...) / i18n.changeLanguage(). */
/**
 * i18n — UI language system. Ships the locales listed in SUPPORTED_LANGUAGES.
 *
 * Mirrors the color-scheme.ts pattern: a synchronous module-level cache for the
 * user's preference ('auto' | a concrete locale), loaded once at startup, with a
 * Context provider (./language) that drives instant, restart-free switching.
 *
 * Language ≠ number/date/time format. Those stay in services/locale-format.ts
 * and the existing LocalePrefs — this module governs only translated UI strings.
 *
 * Why i18next (not Intl-based): react-i18next re-renders subscribed components
 * on changeLanguage() without a restart, and its core doesn't depend on Hermes'
 * incomplete `Intl`/ICU data — consistent with locale-format.ts's house rule.
 */
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

const STORAGE_KEY = 'vela.language';

/** Concrete locales the app ships translations for (BCP-47 codes). */
export type AppLanguage =
  | 'en'
  | 'zh'      // Simplified Chinese
  | 'zh-TW'   // Traditional Chinese (Taiwan)
  | 'zh-HK'   // Traditional Chinese (Hong Kong)
  | 'ja'
  | 'ko'
  | 'vi'
  | 'id'
  | 'tr'
  | 'es-MX'   // Spanish (Mexico)
  | 'pt-BR'   // Portuguese (Brazil)
  | 'fr'
  | 'de'
  | 'ru'      // Russian (Russia)
  | 'it';     // Italian (Italy)
/** What the user picks: a concrete locale or "follow the system". */
export type LanguagePreference = 'auto' | AppLanguage;

/** Order shown in the picker: English first, then grouped by region. */
export const SUPPORTED_LANGUAGES: AppLanguage[] = [
  'en',                                 // default / lingua franca
  'zh', 'zh-TW', 'zh-HK', 'ja', 'ko',   // East Asia
  'vi', 'id',                           // Southeast Asia
  'tr', 'ru',                           // Eurasia
  'es-MX', 'pt-BR',                     // Latin America
  'fr', 'it', 'de',                     // Western Europe
];
export const FALLBACK_LANGUAGE: AppLanguage = 'en';

/** Endonyms — each shown in its own script, so these are never translated. */
export const LANGUAGE_NATIVE_NAMES: Record<AppLanguage, string> = {
  'en': 'English',
  'zh': '简体中文',
  'zh-TW': '繁體中文（台灣）',
  'zh-HK': '繁體中文（香港）',
  'ja': '日本語',
  'ko': '한국어',
  'vi': 'Tiếng Việt',
  'id': 'Bahasa Indonesia',
  'tr': 'Türkçe',
  'ru': 'Русский',
  'es-MX': 'Español (México)',
  'pt-BR': 'Português (Brasil)',
  'fr': 'Français',
  'it': 'Italiano',
  'de': 'Deutsch',
};

// ---------------------------------------------------------------------------
// Synchronous module-level cache
// ---------------------------------------------------------------------------

let _preference: LanguagePreference = 'auto';

export function getLanguagePreference(): LanguagePreference {
  return _preference;
}

function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === 'string' && (SUPPORTED_LANGUAGES as string[]).includes(v);
}

/** Best-effort device locale → a supported AppLanguage (else fallback). */
export function detectSystemLanguage(): AppLanguage {
  try {
    for (const locale of Localization.getLocales()) {
      const code = (locale.languageCode ?? '').toLowerCase();
      const tag = (locale.languageTag ?? '').toLowerCase();
      const region = (locale.regionCode ?? '').toUpperCase();

      if (code === 'zh') {
        // Distinguish Simplified vs Traditional (script wins, then region).
        const traditional = tag.includes('hant') || region === 'TW' || region === 'HK' || region === 'MO';
        if (!traditional) return 'zh';
        return region === 'HK' || region === 'MO' ? 'zh-HK' : 'zh-TW';
      }
      if (code === 'ja') return 'ja';
      if (code === 'ko') return 'ko';
      if (code === 'vi') return 'vi';
      if (code === 'id' || code === 'in') return 'id'; // 'in' = legacy Android code
      if (code === 'tr') return 'tr';
      if (code === 'es') return 'es-MX'; // only Spanish variant shipped
      if (code === 'pt') return 'pt-BR'; // only Portuguese variant shipped
      if (code === 'fr') return 'fr';
      if (code === 'de') return 'de';
      if (code === 'ru') return 'ru';
      if (code === 'it') return 'it';
      if (code === 'en') return 'en';
    }
  } catch {
    // fall through to fallback
  }
  return FALLBACK_LANGUAGE;
}

/** Resolve a preference into the concrete language to render. */
export function resolveLanguage(pref: LanguagePreference): AppLanguage {
  return pref === 'auto' ? detectSystemLanguage() : pref;
}

// ---------------------------------------------------------------------------
// i18next init — resources are bundled inline, so init resolves synchronously
// ---------------------------------------------------------------------------

i18n.use(initReactI18next).init({
  resources,
  lng: FALLBACK_LANGUAGE, // overwritten by loadLanguage() at startup
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  load: 'currentOnly', // keep 'zh-TW' / 'es-MX' exact — don't strip to 'zh' / 'es'
  interpolation: { escapeValue: false }, // no XSS surface in React Native
  returnNull: false,
});

// ---------------------------------------------------------------------------
// Platform hook
// ---------------------------------------------------------------------------

/**
 * Runs before `i18n.changeLanguage`, and decides the language that actually
 * takes effect.
 *
 * Exists so the web build can make the Rust engine's catalog resident first
 * (spec 005 FR-010: fetch → loadCatalog → changeLanguage) without duplicating the
 * persistence logic below, which is subtle enough that two copies would drift.
 * A hook that returns a DIFFERENT tag than it was given means the switch could
 * not be completed — the catalog was unreachable — and the app must keep
 * rendering, and keep claiming, the language still in effect.
 *
 * Unset on native, where `changeLanguage` needs nothing prepared.
 */
export type BeforeLanguageChange = (lng: AppLanguage) => Promise<AppLanguage>;

let _beforeChange: BeforeLanguageChange | undefined;

export function setBeforeLanguageChange(fn: BeforeLanguageChange | undefined): void {
  _beforeChange = fn;
}

async function applyLanguage(target: AppLanguage): Promise<AppLanguage> {
  const effective = _beforeChange ? await _beforeChange(target) : target;
  await i18n.changeLanguage(effective);
  return effective;
}

/** Load the stored preference and apply the resolved language. Call once at startup. */
export async function loadLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'auto' || isAppLanguage(stored)) {
      _preference = stored;
    }
  } catch {
    // keep default
  }
  await applyLanguage(resolveLanguage(_preference));
}

/** Persist + apply a new preference, returning the language now in effect. */
export async function setLanguagePreference(pref: LanguagePreference): Promise<AppLanguage> {
  _preference = pref;
  // Persist FIRST, independent of changeLanguage. If changeLanguage ever rejects
  // or hangs, the write must still happen — otherwise the choice is lost on the
  // next launch and the picker silently reverts to "follow system".
  AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  // The RESOLVED language is what the caller gets — and on web that can differ
  // from the requested one when a catalog is unreachable.
  return applyLanguage(resolveLanguage(pref));
}

/**
 * Install the `vela.i18n` console namespace.
 *
 * A NO-OP on native, and deliberately still exported there: `_layout.tsx` is a
 * single platform-shared file, so it must be able to call this unconditionally.
 * The web counterpart in `index.web.ts` installs the real thing.
 */
export function installI18nConsole(): void {
  /* native runs plain i18next — nothing to inspect */
}

export default i18n;
