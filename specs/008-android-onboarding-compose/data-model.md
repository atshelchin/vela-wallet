# Data Model: Android Onboarding (Jetpack Compose)

**Branch**: `008-android-onboarding-compose` | **Date**: 2026-08-01

No database, no network, no server contracts. The model is UI/runtime state plus one persisted preference.

## Entities

### WelcomeCard

Fixed, ordered value objects defining the carousel (FR-001). Order and keys are load-bearing — they mirror 006/007 and the mocks.

| Field | Type | Notes |
|---|---|---|
| `ordinal` | Int (1–6) | Rendered as `%02d` — generated, never translated (FR-003) |
| `titleKey` | String | `onboarding.welcome.feature*Title` |
| `bodyKey` | String | `onboarding.welcome.feature*Body` |

Fixed sequence: 1 `featureNoMnemonic*`, 2 `featureOneAddress*`, 3 `featureOpenSource*`, 4 `featureKeyCustody*`, 5 `featureSafeContract*`, 6 `featureStablecoinGas*`.

### OnboardingIntent

The single typed sink both CTAs route through (FR-002, 007 FR-010 analog).

```
enum OnboardingIntent { CreateWallet, RecoverWallet }
```

Consumed by `WelcomeViewModel.onIntent(intent)` → single-shot navigation event (double-tap guarded). Future create/import flows replace the placeholder handling without touching the Welcome screen.

### ThemePreference

Persisted in DataStore Preferences under key `theme_preference` (D9).

```
enum ThemePreference { Light, Dark, Auto }   // default Auto
```

Effective dark-mode boolean: `Light → false`, `Dark → true`, `Auto → isSystemInDarkTheme()`.

### ResolvedLocale

Output of `LocaleResolver.resolve(localeList)` (D4): one of the 15 supported tags, else `en`. Not persisted — recomputed from the system `LocaleList` on process start and configuration change (FR-004).

Supported set (mirrors `resolve.rs:30`): `en, zh, zh-TW, zh-HK, ja, ko, vi, id, tr, es-MX, pt-BR, fr, de, ru, it`.

## Runtime state

### I18nRuntime state machine

```
Uninitialized ──engine init (Application, IO thread)──▶ Ready(en)
Ready(x) ──locale change: loadCatalog(y) + changeLanguage(y)──▶ Ready(y)
```

- Engine: uniffi `I18n` singleton constructed with the `en` merged catalog bytes (fallback, never released).
- At most two catalogs resident (active + `en`) — enforced by the engine itself.
- UI reads through a `@Composable` accessor keyed on a `languageTick` state so recomposition follows language changes (FR-004 AS-5).
- Engine failure to initialize (corrupt asset — build-time impossibility) fails fast with a crash: silently shipping key-echo UI would violate FR-003's intent.

### WelcomeUiState

| Field | Type | Notes |
|---|---|---|
| `settingsSheetVisible` | Boolean | Long-press on brand mark toggles (FR-006) |
| Navigation event | single-shot | From `OnboardingIntent` sink |
| Carousel page | `PagerState` (Compose) | Self-saving via `rememberPagerState`; not in the ViewModel |

### MainUiState

| Field | Type | Notes |
|---|---|---|
| `themePreference` | `ThemePreference` | From DataStore flow; splash held until first emission so the window doesn't flash the wrong mode |
| `i18nReady` | Boolean | Gate before composing localized UI |

## Token layer (compile-time data)

Immutable Kotlin mirrors of `docs/design-tokens.json` (D5): `VelaColors` ×2 (light/dark), `VelaSpacing`, `VelaRadius`, `VelaType`, `VelaMotion`, `VelaSizing`. Byte-equality with the export is enforced by `DesignTokenDriftTest` (SC-002a) — the JSON is the model of record; the Kotlin objects are a verified projection, not a second source of truth.
