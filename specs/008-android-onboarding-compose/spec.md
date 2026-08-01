# Feature Specification: Android Onboarding (Jetpack Compose)

**Feature Branch**: `008-android-onboarding-compose`

**Created**: 2026-08-01

**Status**: Implemented on this branch (2026-08-01) — all SC verified; on-device evidence in `welcome_dark.png` / `welcome_light.png` / `welcome_light_zh.png`

**Input**: User description: "Rewrite the Vela Wallet Android client in `app-android/vela-wallet` with Jetpack Compose; first release implements the onboarding flow with the design system, vela-core i18n, and light/dark themes" (full brief: `design/onboarding/android.prompt.md`)

## Why

Specs 006 (web) and 007 (desktop/GPUI) established the onboarding Welcome experience on two platforms, both consuming the shared `vela-core` i18n corpus and the Penpot design-token export. The Android native scaffold (`app-android/vela-wallet`, created as a drop-in successor to the Expo/RN app's `app.getvela.wallet` identity) contains zero product code. This feature is the third platform adoption of onboarding and the first real slice of the native Android client: it establishes the Compose design-token layer, the uniffi/JNI binding channel to `vela-core` i18n (the "native adoption" that spec 005's results licensed to proceed), the theming strategy, and the navigation/architecture skeleton that every later Android feature builds on.

Scope follows the 006/007 precedent exactly: the Welcome screen ships at full fidelity; **Create Wallet and Import/Sign-in remain out of scope** (the full flow exists only in the RN app today; on Android the two CTAs navigate to placeholder destinations behind a single typed intent sink, the direct analog of 007's FR-010).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Welcome screen at mock fidelity (Priority: P1)

A first-time user launches the app and lands on the Welcome screen matching the `W1 Welcome _ default.png` (dark) / `W1L Welcome _ light.png` (light) mocks: Vela sailboat mark + "Vela Wallet" wordmark, tagline, a swipeable single-card carousel of the six numbered value-proposition cards (01–06) with a 6-dot pager, an accent "Create Wallet" primary button and an outlined "I already have a wallet" secondary button. Tapping either CTA navigates to the corresponding placeholder destination.

**Why this priority**: This is the entire user-visible deliverable; everything else (i18n, theming) manifests through this screen.

**Independent Test**: Launch a debug build on an API 31+ phone/emulator with device language English; swipe through all six cards; tap both CTAs and observe navigation to the Create / Import placeholder screens and back.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the app launches, **Then** the Welcome screen renders brand block, tagline, card 01 ("No seed phrase"), 6 pager dots with the first active, and both CTAs — with no dead-end UI.
2. **Given** the Welcome screen, **When** the user swipes the carousel, **Then** cards advance 01→06 in fixed order with the active dot tracking, stop firmly at both ends, and never auto-advance.
3. **Given** the Welcome screen, **When** the user taps "Create Wallet" or "I already have a wallet", **Then** the app navigates to the Create / Import placeholder destination (which titles itself with the target flow's name and offers back navigation — placeholders reuse existing corpus keys only, research D11; amended 2026-08-01 from "states the flow is coming", which would have required minting 15-locale throwaway copy against FR-011), and the tap is recorded through a single typed onboarding-intent sink.
4. **Given** card content longer than one line (e.g. de/ru), **When** the card renders, **Then** text wraps without clipping and the layout stays within the screen with the CTA stack fully visible.

---

### User Story 2 - Fully localized experience (Priority: P2)

A user whose device language is any of the 15 supported locales sees every string on the screen in that language, translated by the `vela-core` i18n engine (uniffi Kotlin binding, the same corpus and resolution ladder as web/desktop). Unsupported locales fall back to English — never a mixed-language screen.

**Why this priority**: Localization is a hard requirement of the brief ("所有面向用户的文案必须可本地化"), but it is testable independently of visual fidelity.

**Independent Test**: Switch device language to 中文(简体), relaunch — every string is Simplified Chinese ("创建钱包" / "我已有钱包" / "不用助记词"...). Switch to an unsupported locale (e.g. Polish) — everything is English.

**Acceptance Scenarios**:

1. **Given** device language zh-Hans, **When** Welcome renders, **Then** tagline, all card titles/bodies, and both CTAs come from the `zh` catalog.
2. **Given** device language zh-Hant-TW, **When** the engine resolves the locale, **Then** the `zh-TW` catalog is used (regional resolution, not bare `zh`).
3. **Given** an unsupported device language, **When** Welcome renders, **Then** all strings come from the `en` fallback catalog.
4. **Given** any locale, **When** cards render, **Then** the numerals 01–06 are generated by the app (`%02d`), never translated, and "Vela Wallet" renders verbatim as a proper noun.
5. **Given** the app is running, **When** the user changes device language in system settings and returns, **Then** the UI re-renders in the new language without reinstall.

---

### User Story 3 - Light/dark theme with in-app override (Priority: P3)

The app follows the system appearance by default (dark when there is no preference signal, matching the "default = dark" rule from 006/007). A settings sheet (opened by long-pressing the brand mark, the RN precedent) offers Light / Dark / Auto; the choice persists across restarts. Both themes use the exact Penpot token values; the accent orange is identical in both.

**Why this priority**: Both themes are mandatory, but the override control is the smallest slice and depends on US1's screen existing.

**Independent Test**: Toggle system dark mode — screen switches between W1/W1L palettes. Long-press the logo, pick "Light", restart the app — it opens in light regardless of system setting.

**Acceptance Scenarios**:

1. **Given** system dark mode on and preference Auto, **When** Welcome renders, **Then** background is `#141412`, card surface `#1E1E1B`, primary text `#E8E6E1`, accent `#E8572A`.
2. **Given** system light mode on and preference Auto, **When** Welcome renders, **Then** background is `#FAFAF8`, card surface `#FFFFFF`, primary text `#1A1A18`, accent `#E8572A`.
3. **Given** the settings sheet, **When** the user selects Light or Dark, **Then** the UI switches immediately and the choice survives process death and restart.
4. **Given** either theme, **When** any screen renders, **Then** no color, spacing, radius, or type value is hard-coded in feature UI — all come from the token layer.

---

### Edge Cases

- Device locale list contains multiple entries (e.g. [pl, zh-TW, en]): first supported match wins per the engine's resolution ladder.
- Carousel at either end: firm stop, no wrap-around, no dead zone.
- OS font scale up to system maximum: text scales (sp), layout wraps, CTAs remain tappable; card region grows rather than clipping.
- 320 dp narrow screens: no horizontal overflow; ≥44 dp touch targets kept (pager dots ≥24 dp visual with expanded hit area).
- Process death on the Create/Import placeholder: back stack and theme preference restore correctly.
- None of the 15 locales is RTL; `dir()` is still consulted so a future RTL locale cannot silently break layout assumptions.
- Rapid double-tap on a CTA: single navigation, no double-push.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Welcome screen MUST match W1 (dark) / W1L (light): themed sailboat mark (hull `#DED5CE` dark / `#554B46` light, sails `#FF6A45`/`#FFA98E` per `design/onboarding/logo-*.svg`), "Vela Wallet" wordmark, tagline (`onboarding.welcome.desktopTagline` — the string shown in both mocks), single-card carousel of the six cards in fixed order (noSeedPhrase, oneAddress, openSource, keyCustody, safeContract, stablecoinGas), 6-dot pager, accent primary CTA (`welcome.createWallet`), outlined secondary CTA (`welcome.alreadyHaveWallet`).
- **FR-002**: Both CTAs MUST navigate to distinct placeholder destinations (Create / Import) through one typed `OnboardingIntent` sink; placeholders MUST support back navigation and use localized copy. No passkey-index link appears anywhere (removed at founder direction 2026-08-01 on both prior platforms).
- **FR-003**: Every user-facing string MUST be produced by the `vela-core` i18n engine through the uniffi Kotlin binding (`I18n` object; `loadCatalog`/`changeLanguage`/`t`). Zero hardcoded user-facing string literals in composables. Card numerals are `%02d`-formatted, never translated; "Vela Wallet" is verbatim.
- **FR-004**: All 15 locales MUST work at runtime: system `LocaleList` → supported-tag resolution → catalog load from bundled assets → `en` fallback for unsupported locales; system language change applies on configuration change without reinstall.
- **FR-005**: Light and dark palettes MUST use exactly the values of `docs/design-tokens.json` (`core` + `color-light` / `color-dark` sets; WCAG-corrected values — never the stale `DESIGN_SYSTEM.md` hexes). Material dynamic color MUST be disabled. Accent `#E8572A` identical in both modes. A unit test MUST fail if Kotlin token values drift from the JSON export.
- **FR-006**: Theme preference (Light/Dark/Auto) MUST persist across restarts (default Auto); the settings sheet opens via long-press on the brand mark. The splash/launch window background is fixed `#1A1A18` (`color.fixed.splashBg`) in both modes, and the Android theme MUST no longer be Light-only.
- **FR-007**: Typography, spacing, radius, elevation, motion MUST come from the token layer: Plus Jakarta Sans 400/500/600/700 bundled (repo copies), text sizes/weights per the type scale, 4 dp spacing grid, `radius.full` pill CTAs, press feedback per design system (scale ≈0.97 spring or Material ripple), entrance animation ≤500 ms, no autoplay anywhere.
- **FR-008**: Code MUST be layered: design-system (tokens/theme/components), i18n runtime, preferences data, onboarding feature (screens + ViewModel state), navigation — separate packages with UI free of business logic, matching the brief's 高内聚低耦合 requirement.
- **FR-009**: The Rust integration MUST be reproducible from the repo: an Android cross-compile script + Gradle wiring builds `libvela_core_uniffi.so` per ABI into `jniLibs` (artifacts not hand-committed), the committed generated Kotlin bindings at `rust/bindings/kotlin` are consumed as a source directory (no copy-paste fork), and per-locale catalog JSONs are copied at build time from the generated `public/i18n/` (generated files stay generated — zero hand edits).
- **FR-010**: Accessibility: ≥44 dp touch targets (dots get expanded hit areas), content descriptions for the brand mark and pager, AA contrast in both themes for all token pairs used — with the single recorded exception: white-on-accent primary CTA ≈3.6:1 (the same documented exception as 006/007).
- **FR-011**: Change-scope discipline: modifications limited to `app-android/vela-wallet/`, `specs/008-android-onboarding-compose/`, an Android build script under `rust/scripts/`, this feature's design assets, and `.specify/feature.json` (the spec-kit feature pointer its own tooling rewrites). No edits to the i18n corpus, engine, web app, desktop app, or generated files.
- **FR-012**: Security posture: `allowBackup="false"` (matching the Expo app's stance), no `INTERNET` permission (nothing in this slice touches the network), no secrets or key material anywhere.

### Key Entities

- **WelcomeCard**: ordinal (1–6), title key, body key — fixed order, keys from `onboarding.welcome.*` (flat RN/desktop lineage; the nested `welcomeWeb.*` set is web-only and not minted a third time).
- **OnboardingIntent**: `CreateWallet` | `RecoverWallet` — the single typed sink both CTAs route through (007 FR-010 analog).
- **ThemePreference**: `Light` | `Dark` | `Auto` — persisted; `Auto` = follow system.
- **ResolvedLocale**: supported tag chosen from the system `LocaleList` (one of the 15, or `en`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `cd app-android/vela-wallet && ./gradlew :app:assembleDebug` succeeds from a clean checkout that has run the documented Rust prerequisites (quickstart), producing an APK containing the cross-compiled `.so` per packaged ABI and 15 locale JSON assets.
- **SC-002**: `./gradlew :app:testDebugUnitTest` is green and includes: (a) a token-drift test asserting every Kotlin color/spacing/radius/type value equals `docs/design-tokens.json`; (b) an i18n engine smoke test through the real native library (host dylib) covering `t()` for all Welcome keys in `en` and `zh`, regional resolution `zh-Hant-TW → zh-TW`, and unsupported-locale → `en` fallback.
- **SC-003**: A checklist `rg` audit finds no user-facing string literals in feature composables and no hex color literals outside the token package (exact commands in `checklists/requirements.md`).
- **SC-004**: Both themes verified: light + dark Compose previews for the Welcome screen exist and render, and every fg/bg token pair used on the screen meets its numeric contrast floor (4.5:1 body text, 3:1 large text/UI) in both modes, with the CTA exception recorded.
- **SC-005**: `git status` shows no modifications under `rust/crates/vela-core/i18n/`, `public/i18n/`, or `rust/bindings/` (corpus, generated assets, and bindings untouched), and `git diff --stat main` touches only the paths FR-011 allows.

## Deviations from the mocks (deliberate)

- **DV-001**: Secondary CTA label uses `color.fg.base` instead of the mock's ≈2:1 gray label — the same contrast lift 007 recorded as its DV-001; the outlined border stays per mock.
- **DV-002**: CTA corner treatment is `radius.full` pill/capsule, following the shipped 006 web and 007 desktop precedent.
- **DV-003**: CJK text renders through the Android system CJK fallback (Source Han Sans) rather than a bundled Noto Sans SC — the same licensing/size trade 007 recorded as DV-003. Latin UI text uses bundled Plus Jakarta Sans.
- **DV-004**: No mono font is bundled — nothing in this slice renders addresses/hashes.
- **DV-005**: `fg.subtle` caption text (the card ordinal "01"–"06" and the settings sheet's uppercase section label) measures 3.54:1 (light, on bg.raised) / 4.35:1 (dark) — above the 3:1 UI floor, below the 4.5:1 body floor. Kept deliberately: it matches the mock's gray ordinal and the design system's section-label prescription (`fg.subtle`), and the ordinal's information is redundant with the pager dots. Recorded as the second contrast exception alongside white-on-accent.

## Out of scope

- Create Wallet flow (passkey ceremony, verify-before-persist, index upload) and Import/sign-in flow (authenticate, signature recovery) — RN remains the only complete implementation; Android placeholders route intent only.
- Passkey Index health probe, endpoint settings editor, bug-report modal.
- In-app language picker (system locale only for v1) and the six-level user text-scale setting.
- App icon / adaptive icon rework (the `#0A1929` adaptive-background token vs orange icon tension stays open with the design team).
- Tablet/desktop layouts, RTL locales, CI workflow for Android (noted as follow-up), Play release signing/R8 hardening.

## Assumptions

- Portrait is the primary orientation (phone-only brief); landscape must not crash but is not pixel-tuned.
- minSdk 31 / targetSdk 36 / AGP 9.3.1 / Compose BOM 2025.12.00 from the scaffold are retained.
- The `app.getvela.wallet` application-id collision with the shipped Expo app is intentional (native successor); dev installs overwrite each other.
- The Rust toolchain on the dev machine may install `cargo-ndk` and the Android rustup targets; NDK 27.x from the local SDK is used.
- `welcome.desktopTagline` is the tagline string shown in both W1/W1L mocks (verified against the zh corpus) despite its desktop-flavored key name; adopting it avoids minting a new key. The two-line `welcome.tagline` remains the RN mobile string.
