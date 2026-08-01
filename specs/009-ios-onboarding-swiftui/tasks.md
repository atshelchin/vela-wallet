# Tasks: iOS Onboarding in SwiftUI

**Input**: [plan.md](./plan.md) (D1–D10), [spec.md](./spec.md) (US1–US3, FR-001…012, SC-001…006), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

Execution order is top-to-bottom; `[P]` marks tasks safe to run in parallel
with their phase neighbours (different files, no pending dependency).

## Phase 1: Setup — project surgery & pipelines

- [ ] T001 Xcode project surgery (D9) in `app-ios/VelaWallet/VelaWallet.xcodeproj/project.pbxproj`: `IPHONEOS_DEPLOYMENT_TARGET=17.0` everywhere, `TARGETED_DEVICE_FAMILY=1`; trim `app-ios/VelaWallet/VelaWallet/VelaWallet.entitlements` to an empty dict; delete SwiftData template (`Item.swift`, template body of `ContentView.swift`, ModelContainer wiring in `VelaWalletApp.swift`); verify the project still builds empty-shell.
- [ ] T002 [P] Token generator (D1): `app-ios/scripts/gen-tokens.mjs` reading `docs/design-tokens.json` → emit committed `app-ios/VelaWallet/VelaWallet/DesignSystem/Tokens.swift` (core scales + light/dark semantic sets as Swift constants; header `// GENERATED — do not edit`), `IOS_ADDITIONS` block (onAccent #FFFFFF, control 36/44/52, each citing design-system.md), `--check` drift mode. Run it; commit output.
- [ ] T003 [P] XCFramework script (D2): `rust/scripts/build-ios-xcframework.sh` — host cdylib build → uniffi-bindgen swift generation (smoke-swift.sh invocation) → `aarch64-apple-ios` + `aarch64-apple-ios-sim` staticlib builds → `xcodebuild -create-xcframework` into `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework`; copies generated `vela_core_uniffi.swift` into `app-ios/VelaCoreKit/Sources/VelaCore/` (committed). Add Artifacts/ to `app-ios/.gitignore`.
- [ ] T004 VelaCoreKit package (D2): `app-ios/VelaCoreKit/Package.swift` — `.binaryTarget(VelaCoreFFI)` + `VelaCore` target (generated swift, modulemap import `vela_core_uniffiFFI`); add local package dependency + product link to the app target in `project.pbxproj`; smoke: app target imports `VelaCore` and constructs a type.
- [ ] T005 [P] Catalog sync (D3): `app-ios/scripts/sync-catalogs.mjs` copying 15 × `public/i18n/<lng>.json` → `app-ios/VelaWallet/VelaWallet/Localization/Catalogs/`, `--check` byte-diff mode. Run it; commit catalogs.
- [ ] T006 [P] Fonts (D5): copy `PlusJakartaSans_{400Regular,500Medium,600SemiBold,700Bold}.ttf` + `LICENSE_FONT` from `node_modules/@expo-google-fonts/plus-jakarta-sans/` into `app-ios/VelaWallet/VelaWallet/DesignSystem/Fonts/`; add `UIAppFonts` to partial `app-ios/VelaWallet/VelaWallet/Info.plist`; verify PostScript names via CoreText and record them in T008.

## Phase 2: Foundational — design system & localization core

- [ ] T007 Theme resolver (D8) in `app-ios/VelaWallet/VelaWallet/DesignSystem/Theme.swift`: `Theme(colorScheme:)` → light/dark semantic palette from `Tokens`; welcome-screen geometry constants (mock-measured, named, cited); SwiftUI `EnvironmentKey` injection.
- [ ] T008 [P] Typography roles (D8) in `app-ios/VelaWallet/VelaWallet/DesignSystem/Typography.swift`: display/title/tagline/body/label/button recipes from token scales + Plus Jakarta PostScript names, Dynamic-Type-relative sizing; preview sheet rendering all roles in both schemes.
- [ ] T009 [P] Loc engine wrapper (D6) in `app-ios/VelaWallet/VelaWallet/Localization/Loc.swift`: `@Observable`, `I18n(fallbackJson:)` from bundled `en.json`, `detectLanguage()` porting `shared.ts` mapping, `changeLanguage` + `loadCatalog` for resolved locale, `t(_:)` sole call site, `VELA_LANG` override read (D7).
- [ ] T010 App shell in `app-ios/VelaWallet/VelaWallet/App/`: `VelaWalletApp.swift` (Loc + Theme wiring, `VELA_THEME` override → `preferredColorScheme`, D7), `AppRoute.swift` (`.createWalletPlaceholder | .importWalletPlaceholder`), `RootView.swift` (`NavigationStack(path:)`).

## Phase 3: US1 — see and understand the welcome screen (P1, MVP)

- [ ] T011 [P] [US1] `VelaMark` in `app-ios/VelaWallet/VelaWallet/Components/VelaMark.swift`: sailboat from `logo-light.svg`/`logo-dark.svg` path geometry as SwiftUI `Path` béziers, hull themed per mode, sails constant (FR-008); preview both schemes.
- [ ] T012 [P] [US1] `BrandRow` + `Tagline` in `app-ios/VelaWallet/VelaWallet/Components/BrandRow.swift`: mark + verbatim "Vela Wallet" wordmark on one row, tagline text below (strings injected); preview.
- [ ] T013 [P] [US1] `VelaButton` in `app-ios/VelaWallet/VelaWallet/Components/VelaButton.swift`: `.primary` (accent fill, onAccent label, pill, control-lg) / `.secondary` (outline, fg.base label per DV-001); pressed + disabled states both themes (FR-004); preview matrix.
- [ ] T014 [P] [US1] `FeatureCard` in `app-ios/VelaWallet/VelaWallet/Components/FeatureCard.swift`: raised surface, radius.xl, numeral label / title / body slots (pre-resolved strings); preview with longest de/ru copy.
- [ ] T015 [US1] `WelcomeModel` + `WelcomeScreen` static composition in `app-ios/VelaWallet/VelaWallet/Features/Onboarding/`: model builds 6 `FeatureCard` items from `Loc` (numerals generated, FR-005/006); screen lays out brand row, tagline, card area showing `currentPage`, dot row (static), bottom CTA stack per W1 geometry at 390×844 flexing to other sizes (FR-001); wired as root of `RootView`.
- [ ] T016 [US1] US1 checkpoint: build + run dark/zh and light/zh, side-by-side against `design/onboarding/W1 Welcome _ default.png` / `W1L Welcome _ light.png`; fix geometry/palette until matching; verify live appearance switch (AS-3) and en/de fallback rendering (AS-4).

## Phase 4: US2 — explore the six feature cards (P2)

- [ ] T017 [US2] Carousel paging in `WelcomeScreen`: horizontal paging (TabView page style or paging ScrollView) bound to `WelcomeModel.currentPage`, clamped 0…5, no wrap, no autoplay; `motion.base` transition.
- [ ] T018 [US2] `PagerDots` in `app-ios/VelaWallet/VelaWallet/Components/PagerDots.swift`: active dot accent + pill-widened, inactive fg.subtle; each dot a button (≥24 pt hit area, FR-004) jumping `currentPage`; VoiceOver "page N of 6"; preview both themes.

## Phase 5: US3 — choose a path (P3)

- [ ] T019 [US3] Intent routing: `WelcomeModel.intent(_:)` single sink (FR-010) appending `AppRoute`; placeholder `CreateWalletPlaceholderView` / `ImportWalletPlaceholderView` in `Features/Onboarding/` with Loc-resolved titles (AS-2), back navigation to Welcome.

## Phase 6: Polish — verification gates & evidence

- [ ] T020 [P] Unit tests (D10) in `app-ios/VelaWallet/VelaWalletTests/`: locale-mapping fixtures (zh-Hant-HK/zh-TW/es-AR/pt-PT/in/fr-CA/unsupported), carousel clamp/no-wrap, engine smoke (en fallback, zh load, key-echo detect), SC-005 contrast computation from `Tokens` (4.5:1 body pairs; 3.0:1 floor for DV-004 accent + DV-001 secondary pairs).
- [ ] T021 [P] Literal audit script (SC-003): `app-ios/scripts/audit-literals.mjs` — rg for hex/`Color(red:`/numeric point literals in `Components/ Features/ App/ Localization/` (DesignSystem exempt); wire all three gates' commands into quickstart wording if they drifted.
- [ ] T022 Screenshot matrix (SC-002/SC-004): `xcrun simctl` runs for {dark,light} × {zh,en,de} via `VELA_THEME`/`VELA_LANG`; store evidence paths + comparison notes.
- [ ] T023 Rewrite `specs/009-ios-onboarding-swiftui/checklists/requirements.md` into 007-style verification gates (CHK-SCOPE FR-011/SC-006 diff audit, CHK-TOKENS, CHK-I18N, CHK-CONTRAST, CHK-STATES, CHK-VISUAL) with executed evidence; update spec Status line; final full run of quickstart commands (SC-001).

## Dependencies

```
T001 ─┬─ T004 (needs project buildable)          T002,T003,T005,T006 [P] anytime
T003 ──┘   T004 → T009 (imports VelaCore)
T002 → T007 → T008,T013,T014                     T005,T009 → T010 → T015
T011…T014 [P] → T015 → T016 (US1 ✅ MVP)
T015 → T017 → T018 (US2 ✅)                      T010,T015 → T019 (US3 ✅)
T016…T019 → T020…T023
```

**MVP scope**: Phases 1–3 (T001–T016) deliver a demoable, mock-faithful,
localized, themed welcome screen. US2/US3 are small increments on top.

**Parallel opportunities**: T002/T003/T005/T006 after T001; T007–T009 pair-wise;
T011–T014 fully parallel; T020/T021 parallel.
