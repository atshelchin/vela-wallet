# Quickstart: Verifying the Launch Animation

**Feature**: `012-launch-animation-lottie` | **Date**: 2026-08-05

How to run each app and prove the feature works. Every command is run from the
repository root unless stated otherwise.

## Prerequisites

| Platform | Needs |
| --- | --- |
| All | Node 22, the repo's `npm ci` already run |
| iOS | Xcode 16+, an iOS 17+ simulator |
| Android | JDK 17, Android SDK 36, a device or API 31+ emulator. The physical test device on record is `9d5f42fb` (Xiaomi alioth) |
| Desktop | Rust 1.97.1 and a C++ toolchain (ThorVG is compiled from vendored C++ — see `contracts/desktop-frame-pump.md`) |
| Web | `pnpm install` inside `app-web/vela-wallet` |

---

## 0. The shared gate — run this first

```bash
node scripts/lint-lottie-assets.mjs
```

**Expected**: exit 0, both launch files reported legal.

Prove the check is alive (SC-005):

```bash
node scripts/lint-lottie-assets.mjs --fixture specs/012-launch-animation-lottie/fixtures/illegal-gradient.json
```

**Expected**: exit 1, and the message names the file, the layer and
`gradient fill (ty:"gf")`.

---

## 1. Desktop

```bash
cd app-desktop/vela-wallet
cargo run
```

**Expected**: the window opens, the mark slides left while "Vela Wallet" builds
letter by letter, and the Welcome page crossfades in. Total ≈ 1.9 s.

Both appearances, without touching system settings (the app already honours a
`VELA_THEME` pin):

```bash
VELA_THEME=light cargo run
VELA_THEME=dark  cargo run
```

Tests:

```bash
cargo test                      # includes the fit-rule table and the texture-lifetime bound
cargo test --  --nocapture launch_golden   # golden frames at progress 0 / .25 / .5 / 1
```

**The texture-lifetime test is not optional decoration.** A leak of one GPU
texture per frame is invisible on screen and only shows up after repeated
launches; `contracts/desktop-frame-pump.md` explains why it exists.

---

## 2. Android

```bash
cd app-android/vela-wallet
./gradlew installDebug          # add -PvelaSkipRustBuild to skip the NDK build
adb shell am start -n app.getvela.wallet/.MainActivity
```

**Expected**: system splash → animation → Welcome, with **no background flash**
at the first seam when the in-app theme agrees with the OS setting (SC-008).

Check both appearances and the seam that cannot be made perfect:

```bash
adb shell "cmd uimode night yes"   # then relaunch — splash and animation both dark
adb shell "cmd uimode night no"    # then relaunch — splash and animation both light
```

Then set the in-app theme (long-press the logo on Welcome → theme sheet) to the
**opposite** of the OS setting and cold-start again. The seam is now a
crossfade rather than an instant switch — this is FR-023's accepted degradation,
not a bug. Research D5 explains why nothing better is possible: the OS paints the
splash before `onCreate` can read the stored preference.

Reduce motion:

```bash
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

**Expected**: the final composed lockup appears statically and Welcome follows
immediately.

Tests:

```bash
./gradlew testDebugUnitTest              # fit rule, constants, drift
./gradlew connectedDebugAndroidTest      # golden frames + reduce-motion + missing-asset
```

---

## 3. iOS

```bash
cd app-ios/VelaWallet
xcodebuild -resolvePackageDependencies -project VelaWallet.xcodeproj
xcodebuild -project VelaWallet.xcodeproj -scheme VelaWallet \
           -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Then run from Xcode, or:

```bash
xcrun simctl launch --console booted app.getvela.wallet
```

**Expected**: same sequence as the other platforms.

Appearance and reduce-motion on the simulator:

```bash
xcrun simctl ui booted appearance dark
xcrun simctl ui booted appearance light
# Settings → Accessibility → Motion → Reduce Motion
```

Asset declaration is in sync (the spec 010 pattern, extended to animations):

```bash
node app-ios/scripts/gen-animation-filelists.mjs --check
```

**Expected**: exit 0. It fails if the `.xcfilelist`s are stale **or** if a
copy of an animation JSON has been committed under `app-ios/` — the duplication
FR-001 forbids.

Tests:

```bash
xcodebuild test -project VelaWallet.xcodeproj -scheme VelaWallet \
                -destination 'platform=iOS Simulator,name=iPhone 16'
```

---

## 4. Web

```bash
cd app-web/vela-wallet
pnpm dev
```

Open `http://localhost:5173/en`.

**Expected**: the animation plays over the Welcome page on the first view of the
session, then never again until the tab is closed. Reload — no animation. Open a
new tab — animation again.

Force a replay while developing:

```js
sessionStorage.removeItem('vela.launch.played'); location.reload();
```

Checks specific to web:

```bash
pnpm check          # svelte-check + token drift
pnpm test:unit      # fit rule, session gate
pnpm test:e2e       # golden frames, plus the two SSR guarantees below
```

Two things the e2e suite must assert, because they are the web-specific failure
modes (spec Edge Cases):

1. With JavaScript disabled, the page renders completely and the overlay is
   absent — it is client-mounted only, never server-rendered.
2. The animation is not the LCP element.

Bundle cost, if you want to confirm the choice made in research D2:

```bash
pnpm build && du -h .svelte-kit/cloudflare/_app/immutable/chunks/*lottie*
```

**Expected**: roughly 46 KB gzip, in a chunk that is **not** part of the initial
page load. The dotLottie alternative would have been ~513 KB brotli of
WebAssembly, fetched from a third-party CDN by default.

---

## 5. Cross-platform: proving the checks are alive

This is SC-006 and it is worth running once, by hand, before believing any of the
green ticks above:

```bash
# temporarily perturb the asset
python3 - <<'PY'
import json
for path in ('design/onboarding/launch/vela-wallet-launch-phone-core-dark.json',
             'design/onboarding/launch/vela-wallet-launch-desktop-core-dark.json'):
    d = json.load(open(path))
    d['layers'][0]['ks']['o']['k'][1]['t'] = 40   # shift the first glyph's fade by 14 frames
    json.dump(d, open(path, 'w'))
PY
```

Re-run all four golden-frame suites. **Every one of them must fail.** A suite
that stays green is not looking at the asset, and should be fixed before it is
trusted. Then `git checkout design/onboarding/launch/`.

---

## 6. Requirement → verification map

| Requirement | Verified by |
| --- | --- |
| FR-001, FR-004, SC-004 | `gen-animation-filelists.mjs --check`; `git ls-files` guard; adding a second file touches no build config |
| FR-002, FR-003 | each platform's build; desktop's `include_bytes!` makes a missing asset a compile error |
| FR-005…FR-007, SC-005 | §0 above |
| FR-008 | §1–§4 "reload / navigate back / resume" steps |
| FR-009, FR-010 | appearance toggles in §2–§4 |
| FR-011 | per-platform fit-rule unit test against research D1's table (form-factor predicate + box ratio), plus the linter's `BOX_W_RATIO == core ÷ full-bleed` assertion; on web, resize across 768 px and confirm the composition swaps without restarting |
| FR-012 | visual check at the hand-off (see plan.md Complexity Tracking for the crossfade interpretation) |
| FR-013 | launch with a breakpoint on the Welcome screen's first draw: nothing of it may be visible while the animation plays |
| FR-013a | trace timestamps — Welcome composition starts after the animation's first presented frame and finishes before `onFinished` |
| FR-014…FR-018 | missing-asset, budget-expiry, skip and ceiling tests per platform |
| FR-019…FR-021 | reduce-motion runs in §2–§4; accessibility-tree assertion on web |
| FR-022, FR-023, SC-008 | §2's four appearance combinations |
| FR-024, FR-025, SC-009 | `grep -rl` for the runtime symbol in each app returns exactly one file |
| FR-026, SC-006 | §5 |
| FR-027, FR-028 | per-platform missing-asset and reduce-motion tests |
| FR-029 | existing onboarding suites still pass, using the deterministic disable rather than a sleep |
