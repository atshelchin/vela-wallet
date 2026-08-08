# Quickstart: Wallet Home UI Galleries (spec 015)

Every state is fixture-driven and works fully offline. The mocks to
compare against live in `design/wallet/`.

## Web (SvelteKit)

```bash
cd app-web/vela-wallet
pnpm install && pnpm build && pnpm preview   # or: pnpm dev
# open http://localhost:4173/zh/gallery   (component boards + state links)
# states: /zh/gallery/h1 … h8, h7x, /zh/gallery/d1 d2 d3 — /en/… for English
```

Overlay controls (top-right): gallery root · zh/en switch · theme cycle
(auto → dark → light). Mobile states render in a 390×844 frame (`h1s`
expands to full scroll height); desktop states need a ≥1280 px window.
Gates: `pnpm check && pnpm lint && pnpm test:unit && pnpm build`.

## Desktop (GPUI)

```bash
cd app-desktop/vela-wallet
VELA_PAGE=gallery cargo run          # D1/D2/D3 chips + Components + Identicons boards
VELA_PAGE=wallet cargo run           # the plain wallet page (D1; panels open on click)
# combine with the existing pins: VELA_THEME=dark|light, VELA_LANG=zh|en|…
```

In the wallet layout: 收款 opens the Receive panel, any asset row opens
the Asset detail panel, ✕ or Esc closes (the third column is the desktop
stand-in for the mobile bottom sheet). Tests: `cargo test`.

## Android (Compose)

```bash
cd app-android/vela-wallet
./gradlew :app:assembleDebug         # builds the Rust .so via cargo-ndk
adb install app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n app.getvela.wallet/.MainActivity --es vela.startDestination gallery
# or --es vela.startDestination wallet
# per-app locale: adb shell cmd locale set-app-locales app.getvela.wallet --user 0 --locales zh-CN
```

Tests: `./gradlew :app:testDebugUnitTest`.

## iOS (SwiftUI)

```bash
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj -scheme VelaWallet \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcrun simctl boot 'iPhone 17 Pro' || true
xcrun simctl install booted <path-to>/VelaWallet.app
SIMCTL_CHILD_VELA_PAGE=gallery SIMCTL_CHILD_VELA_THEME=dark \
  xcrun simctl launch booted app.getvela.VelaWallet
# VELA_PAGE=wallet for the home screen alone; VELA_LANG pins locale
```

Gates: `node app-ios/scripts/audit-literals.mjs` and the Xcode test plan.

## Cross-platform identicon board (US3 / SC-003)

Each platform's gallery has an identicon board rendering the same seeds
(`data-model.md` §Identity). The avatars must match pairwise across
platforms; byte-level parity is enforced by vela-core's conformance
suite (`npm run verify:identicon`).
