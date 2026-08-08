# Quickstart — validating spec 014

Prereqs: repo root `npm install` done; `app-web/vela-wallet` uses **pnpm**; Android needs
JAVA_HOME=JDK17 (daemon 21 auto-provisions), SDK at `/Volumes/data/Library/Android/sdk`;
iOS needs Xcode 26 + `VelaCoreFFI.xcframework` built
(`rust/scripts/build-ios-xcframework.sh`, rust 1.97.1 with ios targets); desktop needs
only `cargo` (warm target/ exists).

## 1. Corpus round-trip (once, after adding the new keys)

```bash
# repo root
npm run gen:i18n        # regenerates paths.rs, i18n_catalogs, resources.ts, public/i18n
npm run lint:i18n       # no NEW defects allowed
npm run verify:i18n
cargo test -p vela-core --features i18n-all   # run inside rust/
git status              # corpus + generated artifacts must be committed together
```

Expected: generator passes with the bumped count pins (see contracts/i18n-keys.md);
`public/i18n/zh.json` contains e.g. `onboarding.common.networkTitle` = 网络连接不稳定.

## 2. Web

```bash
cd app-web/vela-wallet
pnpm check && pnpm lint && pnpm test:unit -- --run && pnpm build
pnpm dev
```

- Gallery: open `http://localhost:5173/dev/gallery` — all fixtures listed Create/Login,
  theme toggle light/dark, locale zh/en. Compare against `design/onboarding/**`.
- Welcome: `http://localhost:5173/zh` — ≥1280px window: buttons swap the right column in
  place (hero column must not move); <1280px: bottom sheet. Close × restores.
- Prod guard: after `pnpm build`, `/dev/gallery` must 404 in `pnpm preview`; the existing
  e2e wasm-bundle guard stays green (`pnpm test:e2e`).

## 3. iOS

```bash
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj -scheme VelaWallet \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build test
node app-ios/scripts/gen-tokens.mjs --check
node app-ios/scripts/audit-literals.mjs
# run with gallery:
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null || true
xcrun simctl install booted <DerivedData>/Build/Products/Debug-iphonesimulator/VelaWallet.app
SIMCTL_CHILD_VELA_GALLERY=1 SIMCTL_CHILD_VELA_THEME=dark SIMCTL_CHILD_VELA_LANG=zh \
SIMCTL_CHILD_VELA_SKIP_LAUNCH_ANIMATION=1 \
  xcrun simctl launch --terminate-running-process booted app.getvela.VelaWallet
```

Welcome → tap either
button → bottom sheet with drag handle; gallery run shows the fixture list.
`xcrun simctl io booted screenshot /tmp/<code>.png` for mock comparison.

## 4. Android

```bash
cd app-android/vela-wallet
./gradlew :app:assembleDebug -PvelaSkipRustBuild
./gradlew :app:testDebugUnitTest -PvelaSkipRustBuild    # needs host dylib: drop the flag on first run
./gradlew :app:installDebug -PvelaSkipRustBuild
adb shell am start -n app.getvela.wallet/.MainActivity --ez vela.gallery true \
  --ez vela.skipLaunchAnimation true
```

Gallery opens instead of Welcome; normal launch (no extra) shows Welcome → buttons open
the modal bottom sheet.

## 5. Desktop

```bash
cd app-desktop/vela-wallet
cargo check && cargo clippy --all-targets && cargo test
VELA_SKIP_LAUNCH_ANIMATION=1 cargo run                       # Welcome; click CTAs → panel swaps in right column
VELA_GALLERY=1 VELA_THEME=dark VELA_LANG=zh VELA_SKIP_LAUNCH_ANIMATION=1 cargo run   # gallery
```

## 6. Cross-platform acceptance sweep

1. **Coverage (SC-001)**: fixture-count unit test green on each platform; manually step
   all fixtures in each gallery once, dark + light.
2. **Fidelity (SC-002)**: side-by-side with `design/onboarding/create|login/*.png`
   (dark); light pass checks tokens only (no unthemed element).
3. **Reuse (SC-003)**: each pattern capability resolves to exactly one file per platform
   (see contracts/presentation-states.md §1 and research D6 tables).
4. **No business I/O (SC-004)**:
   `grep -RInE 'fetch\(|URLSession|OkHttp|reqwest|navigator\.credentials|ASAuthorization|CredentialManager' <new module dirs>`
   → no hits.
5. **Copy (SC-006)**: switch zh/en on every platform; no key echoes, no annotation
   strings anywhere.
6. **Wiring readiness (SC-007)**: data-model §6 mapping table exists and names every
   crux ViewModel field.
