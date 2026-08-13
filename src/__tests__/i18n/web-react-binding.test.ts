/**
 * The react-i18next contract (spec 005-web-i18n-adoption, T041 / FR-020).
 *
 * Why this exists: `useTranslation` reads ~10 members off the i18n instance on
 * every render, and getting one wrong does NOT produce an error. With
 * `useSuspense` defaulting to true, a falsy `ready` makes the hook `throw new
 * Promise(...)` — the component suspends **forever**, with no message, in a
 * browser only. That failure is invisible to every other test in this repo, and
 * a bundle-only `build:web` cannot see it either.
 *
 * No new dependency and no jest config change: `react-dom` is already installed,
 * and `React.createElement` avoids JSX so `testMatch: '*.test.ts'` still applies.
 * A render library was considered and declined — see plan.md §Complexity
 * Tracking. The named cost is that re-render-on-language-change stays uncovered
 * here and falls to the manual sweep.
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'react-i18next';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }] }));
jest.mock('@/constants/build-info', () => ({ APP_VERSION: '0.0.0', GIT_COMMIT: 'testsha' }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamically imported module under test
let web: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let i18n: any;

beforeAll(async () => {
  web = await import('@/i18n/index');
  i18n = web.default;
});

/** A component shaped like the app's 92 real hook sites. */
function Probe(): ReactElement {
  const { t, ready } = useTranslation();
  return createElement(
    'span',
    null,
    `${String(ready)}|${t('common.cancel')}|${t('send.recipientCount', { count: 3 })}`,
  );
}

describe('react-i18next binding over the Rust seam', () => {
  it('renders a real useTranslation() through the seam', () => {
    const html = renderToStaticMarkup(createElement(Probe));
    expect(html).toContain('true|Cancel|');
    // The plural path, resolved by the engine's CLDR rules rather than i18next's.
    expect(html).toMatch(/\|3 recipients<\/span>$/);
  });

  it('routes the hook through the engine, not around it', () => {
    const diag = web.i18nDiagnostics;
    const previous = diag.harnessReport().mode;
    diag.setHarnessMode('every');
    diag.resetHarness();
    try {
      renderToStaticMarkup(createElement(Probe));
      // Two `t()` calls in the component; if the seam were not installed this
      // would be zero and the render above would still look perfect.
      expect(diag.harnessReport().compared).toBe(2);
      expect(diag.harnessReport().divergences).toEqual([]);
    } finally {
      diag.setHarnessMode(previous);
    }
  });

  it('exposes every member useTranslation reads, with the right SHAPE', () => {
    // Properties, not methods. `language` as a method would be truthy and wrong:
    // react-i18next uses it as the snapshot cache key and stamps it onto every
    // hook-driven option object.
    expect(typeof i18n.language).toBe('string');
    expect(Array.isArray(i18n.languages)).toBe(true);
    expect(i18n.languages.length).toBeGreaterThan(0);
    expect(typeof i18n.resolvedLanguage).toBe('string');

    // Methods.
    for (const m of ['getFixedT', 'on', 'off', 'hasLoadedNamespace', 'loadNamespaces', 't', 'exists']) {
      expect(typeof i18n[m]).toBe('function');
    }

    // `ready` is computed from these; a falsy pair suspends forever.
    expect(Boolean(i18n.isInitialized || i18n.initializedStoreOnce)).toBe(true);
    expect(i18n.options).toBeDefined();
    expect(i18n.options.react ?? {}).toBeDefined();
  });

  it('getFixedT still routes to the OVERRIDDEN t', () => {
    // The seam replaces `t`, not `getFixedT`. That only works because getFixedT
    // ends in a live `this.t(...)` property lookup (i18next.js:2060) rather than
    // a captured reference — if that ever changed upstream, the hook path would
    // silently bypass the engine while direct calls kept using it.
    const diag = web.i18nDiagnostics;
    const previous = diag.harnessReport().mode;
    diag.setHarnessMode('every');
    diag.resetHarness();
    try {
      const fixed = i18n.getFixedT('en', 'translation');
      expect(fixed('common.cancel')).toBe('Cancel');
      expect(diag.harnessReport().compared).toBe(1);
    } finally {
      diag.setHarnessMode(previous);
    }
  });

  it('fails FAST rather than suspending when ready is false', () => {
    // The FR-020 hazard, made into an assertion. Forcing `ready` false must
    // produce a thrown promise we can observe in milliseconds, instead of a blank
    // screen someone discovers by hand in a browser.
    const original = i18n.isInitialized;
    const originalStore = i18n.initializedStoreOnce;
    try {
      i18n.isInitialized = false;
      i18n.initializedStoreOnce = false;
      let thrown: unknown;
      let rendered: string | undefined;
      try {
        rendered = renderToStaticMarkup(createElement(Probe));
      } catch (e) {
        thrown = e;
      }

      // The property that matters is that it fails LOUDLY AND IMMEDIATELY.
      // react-i18next signals "not ready" by throwing a promise for Suspense to
      // catch; `renderToStaticMarkup` cannot suspend, so React surfaces it as an
      // error instead. Either way it is observable in milliseconds here, rather
      // than as a blank screen someone finds by hand in a browser — which is the
      // whole point of FR-020. Asserting the exact throw shape would be pinning
      // a React implementation detail, so this asserts the outcome instead.
      expect(thrown).toBeDefined();
      expect(rendered).toBeUndefined();
    } finally {
      i18n.isInitialized = original;
      i18n.initializedStoreOnce = originalStore;
    }
  });
});
