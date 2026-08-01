# Verification Checklist: Android Onboarding (Jetpack Compose)

**Purpose**: Executable, evidence-bearing verification of spec FR/SC items
**Created**: 2026-08-01
**Feature**: `specs/008-android-onboarding-compose/spec.md`

All `rg`/`git` commands run from the repo root unless noted. `APP=app-android/vela-wallet/app/src/main/java/app/getvela/wallet`.

## CHK-BUILD (SC-001)

- [x] CHK001 `rust/scripts/build-android.sh` exits 0 → "OK: 3 ABIs" (arm64-v8a 3.36MB, armeabi-v7a 1.81MB, x86_64 2.83MB). **Gotcha recorded in quickstart**: the rustup Android targets must be installed on the toolchain pinned by `rust/rust-toolchain.toml` (1.97.1), not the default.
- [x] CHK002 `./gradlew :app:assembleDebug` exits 0 (both with and without the rust tasks; config cache stored clean).
- [x] CHK003 APK verified: exactly 15 `assets/i18n/*.json`; `lib/{arm64-v8a,armeabi-v7a,x86_64}/libvela_core_uniffi.so` present; `ndk.abiFilters` prunes the JNA aar's legacy ABIs (mips/x86/armeabi jnidispatch) so every packaged ABI has the full native set.

## CHK-TESTS (SC-002)

- [x] CHK004 `cd app-android/vela-wallet && ./gradlew :app:testDebugUnitTest` exits 0. **Evidence**: 20 tests, 0 failures (DesignTokenDriftTest 9, I18nEngineSmokeTest 6, LocaleResolverTest 5), 2026-08-01.
- [x] CHK005 `DesignTokenDriftTest` asserts every color hex (light+dark+fixed), spacing, radius, text-size, weight, leading, letterSpacing, motion, opacity, icon/size value against `docs/design-tokens.json`, plus the window XML colors. **Perturbation verified 2026-08-01**: `fgMuted → #7A776E` (the stale DESIGN_SYSTEM.md value) makes `lightPaletteMatchesExport` FAIL; reverted, suite green.
- [x] CHK006 `I18nEngineSmokeTest` exercises the real dylib: all screen keys in `en` (22 keys) and `zh` exact values (创建钱包/我已有钱包/您的密钥，您的资产/不用助记词); every one of the 15 supported tags loads and translates; `zh-Hant-TW → zh-TW`; `pl → en` fallback; en stays resident across switches.

## CHK-TOKENS (FR-005/FR-007, SC-003)

- [x] CHK007 No color literals outside the token package: `rg -n '0x[0-9A-Fa-f]{8}|Color\(' $APP --glob '!**/core/designsystem/tokens/**'` → zero raw ARGB literals. **Recorded compliant exceptions** (all inside `core/designsystem/components`): `SolidColor(VelaBrand.*)`/`SolidColor(hull)` are brand-token references in VelaLogo; `SolidColor(Color.Black)` in VelaIcons is the vector tint placeholder (always overridden by `Icon(tint=…)`).
- [x] CHK008 No raw dp/sp design values in feature code: `rg -n '\b[0-9]+\.?[0-9]*\.(dp|sp)\b' $APP/feature $APP/navigation` → empty.
- [x] CHK009 Dynamic color disabled: `rg -n 'dynamicColorScheme|dynamicDarkColorScheme|dynamicLightColorScheme' $APP` → empty.

## CHK-I18N (FR-003/FR-004, SC-003)

- [x] CHK010 No hardcoded user-facing strings in composables: `rg -n 'Text\(\s*"' $APP` → empty. (Brand wordmark renders via `VelaBrand.WORDMARK`; preview sample copy lives behind the `VelaStrings` fake, not in `Text(` literals.)
- [x] CHK011 Card numerals generated: `%02d` appears once, in `WelcomeScreen.kt` with `Locale.ROOT`; `rg -n '"0[1-6]"' $APP` → empty.
- [ ] CHK012 All 15 locales load: engine smoke test iterates every tag in the supported set and `t("onboarding.welcome.createWallet")` differs from the key for each.

## CHK-THEME (FR-005/FR-006, SC-004)

- [x] CHK013 Light + dark `@Preview` composables exist (`WelcomePreviews.kt`), and **on-device screenshots** are committed in this spec dir: `welcome_dark.png` (W1), `welcome_light.png` (W1L), `welcome_light_zh.png` (zh locale) — captured 2026-08-01 on a Pixel 7 API 34 emulator.
- [x] CHK014 Contrast floors (computed 2026-08-01, WCAG relative luminance): **light** fg.base/bg.base 16.68, fg.base/bg.raised 17.43, fg.muted/bg.raised 5.33, fg.muted/bg.base 5.10 (tagline), accent-dot/bg.base 3.45; **dark** 14.79 / 13.40 / 5.73 / 6.33 / 5.12 — all ≥ their floors. **Two recorded exceptions** (spec DVs): white/accent = 3.60 both modes (FR-010, matches 006/007), and fg.subtle caption text 3.54 light / 4.35 dark (DV-005: card ordinal + section label; ≥3:1, below the 4.5 body floor, mock/design-system prescribed). Inactive dots (border.strong) are decorative — page state is conveyed by the accent dot + numeral stateDescription.
- [x] CHK015 Theme preference persists — verified on emulator 2026-08-01: system in LIGHT mode, long-press logo → sheet → 深色 → `am force-stop` → relaunch → app opens DARK (screenshot `after_restart` in session records).
- [x] CHK016 Splash window background `#1A1A18` via `Theme.SplashScreen` + `vela_splash_bg` in both `values/` (fixed color, no night variant needed) — config-verified; splash held until engine ready (`setKeepOnScreenCondition`).

## CHK-SCOPE (FR-011/FR-012, SC-005)

- [x] CHK017 Change set audited 2026-08-01: every modified/added/deleted path is under `app-android/vela-wallet/`, `specs/008-android-onboarding-compose/`, `rust/scripts/build-android.sh`, `design/onboarding/android.prompt.md`, plus `.specify/feature.json` (spec-kit machinery). The jniLibs gitignore lives in `app-android/vela-wallet/.gitignore` (root `.gitignore` untouched).
- [x] CHK018 `git status --porcelain rust/crates/vela-core/i18n public/i18n rust/bindings` → empty (corpus, generated catalogs, bindings untouched).
- [x] CHK019 No committed artifacts: `git ls-files app-android | rg '\.so$|jniLibs'` → empty; `git check-ignore` confirms jniLibs ignored.
- [x] CHK020 Manifest posture: `allowBackup="false"` → 1 hit; `INTERNET` → absent.

## CHK-A11Y (FR-010)

- [x] CHK021 Pager dots row exposes `stateDescription = "N/6"` (generated numerals, locale-neutral); brand mark contentDescription = wordmark; CTAs are `heightIn(min = 52.dp)`. **Dot targets (re-verified after review fix)**: the dot row is a single 44dp-tall (`size.hitTarget`) tap surface whose `pointerInput` maps tap x to the nearest dot — per-dot effective hit rects are ≥44dp tall and overlap across the full row (FR-010 "expanded hit areas"); visuals stay at mock pitch (8dp dots, 4dp gaps). Theme option rows use `selectable(role = RadioButton)` so TalkBack announces the selected theme.
- [x] CHK022 Double-nav guard: navigation only fires when `currentDestination == welcome` + `launchSingleTop` (VelaNavHost.kt) — a second tap while the first transition is in flight cannot double-push. Code-verified; emulator tap-through of both CTAs and back navigation exercised 2026-08-01.

## Manual on-device pass (quickstart §Manual verification, emulator Pixel 7 API 34, 2026-08-01)

- [x] US1: Welcome renders at mock fidelity (dark + light screenshots in spec dir); carousel swipes 01→02 with dot tracking and firm end stops; both CTAs navigate to their placeholder screens; back returns.
- [x] US2: per-app locale zh-CN → entire screen Simplified Chinese from the on-device Rust engine (`welcome_light_zh.png`); en default verified; 15-locale load coverage via unit tests.
- [x] US3: settings sheet (long-press logo) shows 设置/外观/浅色/深色/自动; selection applies immediately and survives force-stop (CHK015).

## Adversarial review round (2026-08-01 evening)

Four-dimension multi-agent review (Compose runtime, i18n binding, Gradle build, spec/design fidelity) with per-finding refutation verifiers. 3 confirmed majors + 15 minors — all fixed and re-verified:

- **System bars follow the theme override** (was: enableEdgeToEdge defaults keyed to system uiMode only): `DisposableEffect(darkTheme)` re-applies `SystemBarStyle.auto` for the effective theme. Visually verified: system light + persisted Dark → light bar icons over `#141412`.
- **Stale-green tests** (was: repo files behind system properties untracked): declared as `test.inputs` (tokens JSON, `public/i18n`, host engine lib via `System.mapLibraryName`). Re-verified empirically: perturbing `accent.base` now makes `testDebugUnitTest` EXECUTE and FAIL (was UP-TO-DATE); reverted → green.
- **Dot targets** (was: 24dp per-dot boxes): row-level 44dp tap surface with x→nearest-dot mapping, visuals at mock pitch. On-device: tap at row's right end jumps to card 06; tap outside row bounds is a no-op.
- Minors fixed: splash now also gated on the first DataStore emission (no wrong-theme first frame); `key()` replaced with a language-keyed `VelaStrings` provider identity (recompose without nav/pager state loss); theme rows use `selectable(Role.RadioButton)`; DataStore read has an `IOException → emptyPreferences` catch; engine `dir()` now drives `LocalLayoutDirection`; explicit `kotlinx-coroutines-android` dependency; Welcome hero/carousel region scrolls at large font scale with CTAs pinned (US1 AS4); fg.subtle caption contrast recorded as DV-005; spec AS3 amended to the D11 placeholder shape; FR-011 amended to include `.specify/feature.json`.

## Environment note (not an app defect)

"Error type 3: Activity class does not exist" on install/launch was root-caused to **corrupted emulator /data state** (a years-old AVD filtered ALL side-loaded apps from activity resolution — even previously installed third-party apps). `emulator -wipe-data` fixed it; the identical symptom on a physical Xiaomi device is typically stale package state or the MIUI 优化 developer toggle. The APK itself was verified sound throughout (manifest, dex, signing).
