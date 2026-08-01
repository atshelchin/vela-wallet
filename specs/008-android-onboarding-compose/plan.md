# Implementation Plan: Android Onboarding (Jetpack Compose)

**Branch**: `008-android-onboarding-compose` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-android-onboarding-compose/spec.md`

## Summary

Deliver the third-platform adoption of the Vela onboarding Welcome experience as the first real slice of the native Android client: a Jetpack Compose Welcome screen at W1/W1L mock fidelity inside the existing `app-android/vela-wallet` scaffold, backed by (a) a hand-mirrored, drift-tested token layer from the Penpot DTCG export (research D5), (b) the `vela-core` i18n engine over the committed uniffi Kotlin bindings with cargo-ndk cross-compilation (D1–D4), (c) DataStore-persisted Light/Dark/Auto theming with a fixed-ink splash (D9–D10), and (d) a navigation/intent skeleton whose Create/Import destinations are deliberate placeholders (spec scope, 006/007 precedent). Verification is executable: assembleDebug, token-drift + engine-smoke unit tests on the real dylib (D14), and rg-based no-hardcoded-values audits.

## Technical Context

**Language/Version**: Kotlin 2.2.10 (AGP 9.3.1 built-in), JVM toolchain 21 (foojay auto-provisioned); Rust (workspace toolchain) for `vela-core-uniffi` cdylib

**Primary Dependencies**: Compose BOM 2025.12.00 + Material3, navigation-compose, lifecycle-viewmodel-compose, datastore-preferences, core-splashscreen, JNA 5.14.0 (`@aar` runtime / jar for JVM tests), generated uniffi bindings from `rust/bindings/kotlin`

**Storage**: DataStore Preferences (theme preference only); i18n catalogs as packaged assets; no database, no network

**Testing**: JUnit4 JVM unit tests (`testDebugUnitTest`): token-drift vs `docs/design-tokens.json`, engine smoke via host dylib (D14), locale-resolver table tests; Compose previews for both themes; instrumented tests out of scope

**Target Platform**: Android phone, minSdk 31 / targetSdk 36, portrait-primary

**Project Type**: Single-module Android app (`:app`) with package-level layering (mobile-app)

**Performance Goals**: Cold start to interactive Welcome without visible jank; entrance animation ≤500 ms; one FFI crossing per `t()` call (measured 0.605 µs — no caching layer needed)

**Constraints**: Zero hardcoded user-facing strings / design values in feature code; token values byte-equal to the DTCG export; no INTERNET permission; artifacts (.so, copied catalogs) never committed; change scope per FR-011

**Scale/Scope**: 3 destinations (1 real screen + 2 placeholders + 1 settings sheet), ~15 locale catalogs, ~25 new Kotlin files

## Constitution Check

`.specify/memory/constitution.md` is the unfilled template — no ratified principles to gate against. Applied the repo's operative conventions instead (the 007 move): spec-kit document set; generated-files-stay-generated (bindings consumed in place, catalogs copied at build, corpus untouched); scope discipline enumerated as FR-011 and audited by checklist; dependency pinning via the version catalog. Re-checked after Phase 1: no violations, no Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-android-onboarding-compose/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D15
├── data-model.md        # Phase 1 — entities & state machines
├── quickstart.md        # Phase 1 — build/run/verify recipe
├── checklists/
│   └── requirements.md  # Executable verification checklist
└── tasks.md             # Phase 2 (/speckit-tasks output)
```

### Source Code (repository root)

```text
rust/scripts/
└── build-android.sh                     # NEW: cargo-ndk cross-compile → jniLibs (D2)

app-android/vela-wallet/
├── gradle/libs.versions.toml            # + navigation, datastore, splashscreen, jna, lifecycle bumps (D15)
└── app/
    ├── build.gradle.kts                 # + srcDir(rust/bindings/kotlin), cargoNdkBuild, syncVelaI18nAssets,
    │                                    #   rustHostLib for tests, jna deps
    ├── src/main/AndroidManifest.xml     # allowBackup=false, portrait activity, splash theme
    ├── src/main/res/
    │   ├── font/                        # plus_jakarta_sans_{regular,medium,semibold,bold}.ttf (D6)
    │   ├── values/{colors,themes,strings}.xml   # splash/DayNight window theming only (D10)
    │   └── values-night/themes.xml
    └── src/main/java/app/getvela/wallet/
        ├── VelaWalletApplication.kt     # AppContainer composition root (D8)
        ├── MainActivity.kt              # splash, edge-to-edge, VelaTheme, NavHost
        ├── core/
        │   ├── designsystem/
        │   │   ├── tokens/              # VelaColors/Spacing/Radius/Type/Motion/Sizing (D5)
        │   │   ├── theme/               # VelaTheme, CompositionLocals, M3 ColorScheme mapping
        │   │   └── components/          # VelaButton (primary/secondary), VelaCard, PagerDots, VelaLogo
        │   ├── i18n/                    # I18nRuntime (engine wrapper), LocaleResolver (D4), Strings access
        │   └── data/                    # ThemePreferenceRepository (DataStore, D9)
        ├── feature/onboarding/
        │   ├── WelcomeScreen.kt         # brand block, carousel, CTA stack (D13)
        │   ├── WelcomeViewModel.kt      # OnboardingIntent sink, settings-sheet state
        │   ├── WelcomeCards.kt          # fixed 6-card definition (key mapping)
        │   ├── ThemeSettingsSheet.kt    # Light/Dark/Auto (US3)
        │   └── placeholder/             # CreatePlaceholderScreen, ImportPlaceholderScreen (D11)
        └── navigation/                  # VelaNavHost, destinations

    └── src/test/java/app/getvela/wallet/
        ├── DesignTokenDriftTest.kt      # vs docs/design-tokens.json (FR-005/SC-002a)
        ├── I18nEngineSmokeTest.kt       # real dylib: en/zh keys, zh-Hant-TW→zh-TW, fallback (SC-002b)
        └── LocaleResolverTest.kt        # ladder table tests (D4)
```

**Structure Decision**: Single `:app` module with strict package layering (`core/designsystem`, `core/i18n`, `core/data`, `feature/onboarding`, `navigation`) — the FR-008 separation without multi-module ceremony that three screens cannot justify. The uniffi bindings stay outside the tree as a referenced source dir; generated/copied artifacts live only under `build/` and gitignored `jniLibs/`.

## Phase Log

- **Phase 0 — research.md**: complete (D1–D15; binding channel, cross-compile, catalog assets, locale ladder, token drift gate, fonts, navigation, state, persistence, splash, placeholder copy, press feedback, layout metrics, JVM test seam, dependency policy).
- **Phase 1 — data-model.md, quickstart.md, checklists/requirements.md**: complete alongside this plan. No `contracts/` — the only API surface consumed (uniffi `I18n`) is pre-existing and documented in research D1/D4.
- **Phase 2 — tasks.md**: generated by the tasks step, not this plan.
