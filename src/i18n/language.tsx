/**
 * LanguageProvider — Context wrapper that drives instant, restart-free language
 * switching. Mirrors ColorSchemeProvider (constants/color-scheme.ts).
 *
 * On change, react-i18next re-renders every component using `useTranslation()`;
 * additionally the `resolved` value flips, which _layout.tsx folds into the
 * Stack `key` to remount the tree — a belt-and-suspenders refresh for any text
 * read outside the hook.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  detectSystemLanguage,
  getLanguagePreference,
  resolveLanguage,
  setLanguagePreference,
  type AppLanguage,
  type LanguagePreference,
} from './index';

interface LanguageContextValue {
  /** What the user picked: 'auto' | 'en' | 'zh'. */
  preference: LanguagePreference;
  /** The concrete language currently rendered. */
  resolved: AppLanguage;
  /** What 'auto' resolves to right now (the device language). */
  systemLanguage: AppLanguage;
  setPreference: (pref: LanguagePreference) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  preference: 'auto',
  resolved: 'en',
  systemLanguage: 'en',
  setPreference: () => {},
});

export function useLanguagePreference() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(getLanguagePreference());
  // What is ACTUALLY rendering, which on web can differ from what the preference
  // resolves to: a catalog that cannot be fetched leaves the previous language in
  // effect. Deriving `resolved` from the preference alone made the app claim a
  // language it was not rendering — and that value drives the Stack remount key,
  // the Safari-extension cache write, and the locale on filed bug reports.
  const [effective, setEffective] = useState<AppLanguage | undefined>(undefined);
  const systemLanguage = detectSystemLanguage();
  const resolved = effective ?? resolveLanguage(preference);

  const setPreference = useCallback((pref: LanguagePreference) => {
    // Update module cache + i18next + persist (fires the react-i18next re-render).
    // Swallow rejections so a changeLanguage failure never becomes unhandled
    // (the write already happened inside setLanguagePreference).
    //
    // The state update is DEFERRED until that settles, and on web that matters:
    // `resolved` feeds the Stack `key` in _layout.tsx, so setting it
    // synchronously remounted the entire tree one round-trip BEFORE the new
    // catalog was resident — a full remount still rendering the old language,
    // followed by a second render once it arrived. Native is unaffected in
    // practice: its resources are bundled, so the promise settles in a microtask.
    void setLanguagePreference(pref).then(
      (inEffect) => {
        // The picker shows what the user CHOSE (already persisted); `effective`
        // shows what is actually RENDERING. On web those diverge when a catalog
        // cannot be fetched, and conflating them made the app claim a language it
        // was not displaying.
        setPreferenceState(pref);
        setEffective(inEffect);
      },
      () => setPreferenceState(pref),
    );
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, systemLanguage, setPreference }),
    [preference, resolved, systemLanguage, setPreference],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
