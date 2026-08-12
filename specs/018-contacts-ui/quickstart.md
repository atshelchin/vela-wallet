# Quickstart: Contacts UI galleries (018-contacts-ui)

How to open and validate every contacts state per platform. All states
are fixture-driven and work fully offline.

## Web (fastest loop)

```bash
cd app-web/vela-wallet
pnpm dev            # http://localhost:5173
```

- Gallery root (component boards): `http://localhost:5173/zh/gallery`
  (contacts boards live alongside the 015 wallet boards; `…/en/gallery`
  for English).
- Full-screen states: `/zh/gallery/c1 … c6`, `c1s`, `c1f`, `c2s`
  (mobile, 390×844 frame), `/zh/gallery/dc1 … dc6` (≥1280 stage),
  `/zh/gallery/dc2n` (1024 stage — overlay third column).
- Theme chip cycles auto → dark → light; zh ↔ en link swaps locale.

Gates:

```bash
pnpm check && pnpm lint && pnpm test:unit && pnpm build && pnpm test:e2e
```

## Android

```bash
cd app-android/vela-wallet
./gradlew :app:assembleDebug :app:installDebug
adb shell am start -n app.getvela.wallet/.MainActivity \
  --es vela.startDestination contacts-gallery --ez vela.skipLaunchAnimation true
# plain contacts screen instead of the gallery:
#   --es vela.startDestination contacts
adb shell cmd locale set-app-locales app.getvela.wallet --user 0 --locales zh-CN
```

Gallery chips: C1…C6, C1S, C1F, C2S, Components + theme toggle + 1.35×
text-scale chip. Unit gates: `./gradlew :app:testDebugUnitTest`
(includes `ContactsFixturesTest`, `DesignTokenDriftTest`).

## iOS

```bash
xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj -scheme VelaWallet \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build test
xcrun simctl boot 'iPhone 17 Pro' || true
xcrun simctl install booted <DerivedData>/…/VelaWallet.app
SIMCTL_CHILD_VELA_PAGE=contacts-gallery SIMCTL_CHILD_VELA_THEME=dark \
SIMCTL_CHILD_VELA_LANG=zh SIMCTL_CHILD_VELA_SKIP_LAUNCH_ANIMATION=1 \
  xcrun simctl launch --terminate-running-process booted app.getvela.VelaWallet
# preselect a state: SIMCTL_CHILD_VELA_STATE=c4
xcrun simctl io booted screenshot /tmp/c4.png
```

Also: `#Preview`s per component in Xcode canvas. Literal/token gates:
`node app-ios/scripts/audit-literals.mjs` and
`node app-ios/scripts/gen-tokens.mjs --check`.

## Desktop

```bash
cd app-desktop/vela-wallet
VELA_PAGE=gallery  VELA_LANG=zh cargo run   # chip bar gains DC1…DC6 + Contacts components
VELA_PAGE=contacts VELA_LANG=zh cargo run   # plain contacts section (dc1)
```

Esc closes the third column / any open menu; right-click the 家人 rail
row for the context menu (dc6); theme chip pins light/dark.
Gates: `cargo check && cargo clippy --all-targets && cargo test`.

## Core / i18n round-trip (only when corpus keys change)

```bash
npm run gen:i18n && npm run lint:i18n && npm run verify:i18n
cd rust && cargo test -p vela-core --features i18n-all
```

**Two root-level gates the four platform sweeps do NOT cover** — spec 018's
CI failed on both before they were added here:

```bash
npm run dump:vectors                       # conformance vectors pin every string
npx jest src/__tests__/i18n/               # resources-generated.test.ts pins the
                                           #   TOTAL leaf count (18,543 after 018)
npm run build:wasm                         # rust/pkg-web is a COMMITTED artifact
node rust/scripts/build-web.mjs --check     #   built from vela-core, whose i18n
                                           #   catalogs are compiled in — any
                                           #   corpus edit makes it stale
```

Green per-platform gates do not imply a green repo: the leaf-count pin lives
in the root RN app's jest suite, and the wasm bundle is checked in.

## Review walkthrough (SC-001)

Open each state next to its mock in `design/contacts/`:
C1→c1, C2→c2, C3→c3, C4→c4, C5→c5, C6→c6, DC1→dc1 … DC6→dc6,
M1/M2→menu component boards, swipe/delete-confirm→c1s/c2s. Known
intentional deltas (recorded in results.md as they land): eight-contact
roster with 妈妈 under M (spec Assumptions); identicon artwork for the
seven pinned invented addresses (research.md D7); native desktop skips
the <1120 overlay (research.md D6 — web `dc2n` covers it).
