# Quickstart: iOS Onboarding in SwiftUI

Build, run and verify the feature from a clean checkout. All commands from the
repo root unless noted.

## Prerequisites

- macOS with Xcode 26.3+ (`xcodebuild -version`) and an iOS simulator runtime
  (iPhone 17 Pro / iOS 26.2 used below; any iOS 17+ iPhone works).
- Rust with the iOS targets added to the repo-pinned toolchain
  (`rust-toolchain.toml` pins 1.97.1, so the default-toolchain targets are
  invisible to it):
  `rustup target add aarch64-apple-ios aarch64-apple-ios-sim --toolchain 1.97.1`
- Node ≥ 20 (repo-wide requirement) and repo `npm install` already done
  (fonts are sourced from `node_modules/@expo-google-fonts/plus-jakarta-sans`).

## One-time / after Rust changes: build the core framework

```sh
rust/scripts/build-ios-xcframework.sh
```

Produces `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework` (gitignored)
and regenerates `app-ios/VelaCoreKit/Sources/VelaCore/vela_core_uniffi.swift`
(committed — `git diff` must be empty unless the crate changed).

## Generated-layer gates (SC-003)

```sh
node app-ios/scripts/gen-tokens.mjs --check      # token drift
node app-ios/scripts/sync-catalogs.mjs --check   # catalog drift
node app-ios/scripts/audit-literals.mjs          # no visual literals outside DesignSystem/
```

Run the first two without `--check` to intentionally regenerate after editing
`docs/design-tokens.json` or the i18n corpus.

## Build + unit tests (SC-001)

```sh
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj \
  -scheme VelaWallet \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build test
```

Unit tests cover: locale mapping (D6 fixtures), carousel state, engine
fallback + zh load + key-echo smoke, and the SC-005 contrast computation.

## Run with overrides (SC-002 / SC-004)

```sh
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null || true
xcodebuild … build   # or Xcode ⌘R, then simctl install
SIMCTL_CHILD_VELA_THEME=dark SIMCTL_CHILD_VELA_LANG=zh \
  xcrun simctl launch --terminate-running-process booted app.getvela.VelaWallet
xcrun simctl io booted screenshot /tmp/w1-dark-zh.png
```

Screenshot matrix: `{VELA_THEME=dark, light} × {VELA_LANG=zh, en, de}`.
Compare `dark/zh` against `design/onboarding/W1 Welcome _ default.png` and
`light/zh` against `W1L Welcome _ light.png`; `en`/`de` verify no clipping.
Unset overrides → system appearance + device language (default behaviour).

## Expected outcomes

- Welcome screen matches W1/W1L: brand row, tagline, one feature card with
  six-dot pager, bottom CTA stack; swipe + dot-tap paging, no wrap, no
  autoplay.
- Both CTAs push localized placeholder screens and pop back.
- No raw `onboarding.…` key visible in any locale; unsupported device
  languages render English.
- All three script gates and `xcodebuild test` exit 0.
