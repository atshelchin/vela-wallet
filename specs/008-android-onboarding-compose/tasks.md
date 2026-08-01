# Tasks: Android Onboarding (Jetpack Compose)

**Input**: Design documents from `/specs/008-android-onboarding-compose/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D15), data-model.md, quickstart.md

**Organization**: Lettered subsystem phases (the 007 convention — sensible where one screen spans three cross-cutting stories). Story labels map back to spec: US1 Welcome fidelity, US2 localization, US3 theming. `[P]` = parallelizable (different files, no ordering dependency).

## Phase A — Rust/i18n infrastructure (blocks US2; independent of B)

- [x] T001 Install prerequisites (one-time host setup): `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`; `cargo install cargo-ndk`. Evidence: `cargo ndk --version`.
  - `cargo ndk --version` 4.x; targets installed on pinned toolchain 1.97.1 (gotcha recorded in quickstart).
- [x] T002 Write `rust/scripts/build-android.sh` (D2): cargo-ndk for the 3 ABIs, `--platform 31`, output `app-android/vela-wallet/app/src/main/jniLibs/`, NDK auto-discovery from `ANDROID_HOME`, fail-fast messages. Run it; evidence: 3 `.so` files.
  - script builds 3 ABIs ("OK: 3 ABIs"), NDK auto-discovered (27.1).
- [x] T003 Gitignore `app-android/vela-wallet/app/src/main/jniLibs/` (FR-009, CHK019).
  - ignore lives in app-android/vela-wallet/.gitignore (root untouched); `git check-ignore` verified.
- [x] T004 Gradle wiring in `app/build.gradle.kts` + `gradle/libs.versions.toml` (D1, D3, D14, D15): srcDir `rust/bindings/kotlin`; `cargoNdkBuild` exec task (preBuild dependency, `-PvelaSkipRustBuild` opt-out); `syncVelaI18nAssets` copy task `public/i18n/*.json` → generated assets dir; `rustHostLib` task + `jna.library.path` system property for unit tests; deps: `jna@aar` (runtime), `jna` jar (test), coroutines as needed.
  - srcDir bindings, cargoNdkBuild/syncVelaI18nAssets/rustHostLib tasks (config-cache-safe via `enabled` + static File paths), jna @aar + test jar, ndk.abiFilters added.
- [x] T005 `core/i18n/I18nRuntime.kt`: engine singleton over `I18n(enBytes)` (assets), `setLocale(tag)` = `loadCatalog` + `changeLanguage`, `languageTick` state, `t(key)` / `t(key, vars)` helpers (data-model state machine).
  - I18nRuntime (VelaStrings impl, StateFlow state, engine lifecycle per data-model).
- [x] T006 `core/i18n/LocaleResolver.kt` (D4): supported-set ladder with Chinese script mapping, `es→es-MX`, `pt→pt-BR`, LocaleList iteration, `en` terminal fallback.
  - LocaleResolver ladder incl. zh script/region mapping, es/pt representatives, legacy `in`→id guard.
- [x] T007 [A] [US2] `I18nEngineSmokeTest.kt` (SC-002b, CHK006/CHK012): real dylib; all Welcome keys en+zh; every supported tag loads and translates `welcome.createWallet`; `zh-Hant-TW → zh-TW`; `pl → en`.
  - I18nEngineSmokeTest: 6 tests on real dylib incl. all-15-locale sweep, zh exact values, zh-Hant-TW→zh-TW, pl→en, en residency.
- [x] T008 [A] [US2] `LocaleResolverTest.kt`: ladder table tests incl. multi-entry LocaleList priority.
  - LocaleResolverTest: 5 table tests.

## Phase B — Design system (blocks US1/US3; independent of A)

- [x] T009 `core/designsystem/tokens/`: `VelaColors` (light/dark/fixed, D5), `VelaSpacing`, `VelaRadius`, `VelaType` (sizes/weights/leading + Plus Jakarta Sans family), `VelaMotion` (durations/spring approximation D12), `VelaSizing` (controls/hit targets/screen padding) — values byte-equal to `docs/design-tokens.json`.
  - VelaColors/VelaDimens/VelaType/VelaMotion/VelaBrand, byte-equal to export (drift-tested).
- [x] T010 [B] Copy the four Plus Jakarta Sans TTFs into `res/font/` with weight-mapped `FontFamily` (D6).
  - 4 Plus Jakarta Sans weights bundled from repo copies; FontFamily weight-mapped.
- [x] T011 `core/designsystem/theme/VelaTheme.kt`: CompositionLocals + M3 `ColorScheme` mapping, dynamic color off, effective-dark computation from `ThemePreference` (data-model).
  - VelaTheme CompositionLocal + M3 mapping, dynamic color absent, isDarkEffective().
- [x] T012 Window theming (D10): core-splashscreen dep; `themes.xml`/`values-night` DayNight NoActionBar + splash bg `#1A1A18`; manifest theme swap; `allowBackup="false"`; portrait activity (FR-006, FR-012).
  - Theme.SplashScreen w/ fixed #1A1A18, DayNight window bg, allowBackup=false, portrait.
- [x] T013 [B] [US1] `core/designsystem/components/`: `VelaButton` (primary accent pill / secondary outlined, 52dp, press-scale spring + ripple, DV-001/DV-002), `VelaCard` (bg.raised, radius.xl, borderless-shadow default per system), `PagerDots` (6 dots, active accent, ≥24dp hit areas), `VelaLogo` (ImageVector from `logo-*.svg` paths, themed hull `#DED5CE`/`#554B46`, sails `#FF6A45`/`#FFA98E`).
  - VelaButton (press-spring 0.97 + pill), VelaCard, PagerDots (24dp hit areas, N/6 stateDescription), VelaLogo (3-path ImageVector, themed hull), VelaIcons.ArrowLeft (Lucide geometry, no icon dep).
- [x] T014 [B] [US3] `DesignTokenDriftTest.kt` (SC-002a, CHK005): parse `docs/design-tokens.json`, assert every mirrored value.
  - DesignTokenDriftTest: 9 tests incl. XML window colors; perturbation check bites (CHK005).
- [x] T015 `core/data/ThemePreferenceRepository.kt` (D9): DataStore, `Flow<ThemePreference>`, default Auto.
  - ThemePreferenceRepository (DataStore, default Auto).

## Phase C — Feature & navigation (needs A+B)

- [x] T016 `feature/onboarding/WelcomeCards.kt`: fixed 6-card list (data-model order); `feature/onboarding/WelcomeViewModel.kt`: `OnboardingIntent` sink with single-shot nav event (double-tap guard, CHK022) + settings-sheet visibility.
  - WelcomeCards fixed order; WelcomeViewModel intent sink + sheet state.
- [x] T017 `feature/onboarding/WelcomeScreen.kt` (D13): brand block (logo long-press → settings sheet), tagline (`welcome.desktopTagline`), `HorizontalPager` carousel + `PagerDots`, CTA stack, entrance fade ≤500ms, edge-to-edge insets, both-theme `@Preview`s (CHK013).
  - WelcomeScreen per D13 with entrance fade/fadeUp <=500ms, both-theme previews; on-device screenshots committed in spec dir.
- [x] T018 [C] [US1] `feature/onboarding/placeholder/`: Create + Import placeholder screens (existing corpus keys only, D11; back navigation).
  - placeholders reuse create.headerDefault / welcome.alreadyHaveWallet; back arrow labeled via common.cancel.
- [x] T019 `feature/onboarding/ThemeSettingsSheet.kt`: M3 ModalBottomSheet, Light/Dark/Auto radio rows from `onboarding.settings.themeLabel*` + `sectionAppearance`/`title` keys, persists via repository.
  - ThemeSettingsSheet (M3 sheet, settings.* keys), verified on emulator in zh.
- [x] T020 `navigation/VelaNavHost.kt` (D7) + `MainActivity.kt` rewrite (splash hold until theme+i18n ready, edge-to-edge, `VelaTheme`, NavHost) + `VelaWalletApplication.kt` (`AppContainer`, engine init off main thread, locale resolution on start/config change) + manifest application class. Delete template stubs (`Greeting`, nav-suite enum, template colors/type, stub drawables).
  - VelaNavHost (double-nav guard), MainActivity (splash hold, edge-to-edge), VelaWalletApplication (AppContainer, serialized i18n executor); template stubs deleted.

## Phase D — Verification & polish

- [x] T021 `./gradlew :app:assembleDebug` green (SC-001, CHK002/003) — fix what falls out.
  - assembleDebug green; APK: 15 locale JSONs, 3 consistent ABIs (CHK001–003).
- [x] T022 `./gradlew :app:testDebugUnitTest` green (SC-002, CHK004–006).
  - testDebugUnitTest: 20 tests, 0 failures.
- [x] T023 Checklist audits CHK007–CHK012, CHK017–CHK020 (rg/git commands) — record evidence inline.
  - CHK007–012, CHK017–020 audits recorded in checklist with evidence.
- [x] T024 Contrast computation for CHK014 pairs (both modes) — record numeric ratios in the checklist.
  - contrast ratios computed for both modes, all floors met, white/accent 3.60 exception recorded (CHK014).
- [x] T025 Emulator pass if available: US1/US2/US3 manual scenarios (quickstart), theme persistence (CHK015), locale switch; else record previews + adapted evidence (007 T017 precedent).
  - full emulator pass (Pixel 7 API 34): US1 swipe/CTAs/back, US2 zh per-app locale, US3 sheet + persistence across force-stop. Environment note: initial "Error type 3" launches were a corrupted-AVD condition, fixed by -wipe-data; APK exonerated via pristine-template A/B.
- [x] T026 Final scope diff audit (CHK017/018 clean); adversarial multi-agent review (4 dimensions + refutation verifiers: 3 confirmed majors + 15 minors, all fixed and re-verified — see checklist "Adversarial review round"); build docs live in quickstart.md (no separate README needed); committed on branch `008-android-onboarding-compose`.

## Dependencies & Execution Order

- A and B are fully parallel tracks. C needs both. D needs C.
- Within A: T001→T002→(T003,T004); T005/T006 after T004; T007/T008 after T005/T006.
- Within B: T009 first; T010–T015 then parallel (T011 after T009; T013 after T009/T010).
- MVP checkpoint: after T017+T020, US1 is demonstrable with en-only + system theme; T019 completes US3; full US2 evidence lands with T022.
