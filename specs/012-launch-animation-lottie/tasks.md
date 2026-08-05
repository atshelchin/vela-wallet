---
description: "Task list for 012-launch-animation-lottie"
---

# Tasks: Lottie Launch Animation Across Four Apps

**Input**: Design documents from `/specs/012-launch-animation-lottie/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included. The spec requires them explicitly — FR-026
(golden frames), FR-027 (missing asset), FR-028 (reduce motion), FR-029 (existing
suites) and SC-005/SC-006 (the checks must be provably alive).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Path Conventions

Four sibling client apps plus one shared asset directory and one shared linter:

- `design/onboarding/launch/` — the eight animation files (source of truth)
- `scripts/` — repo-root Node tooling, run by the `app` CI job
- `app-ios/`, `app-android/vela-wallet/`, `app-desktop/vela-wallet/`, `app-web/vela-wallet/`

**Read before starting**: [contracts/launch-animation-api.md](./contracts/launch-animation-api.md)
defines the component every platform must expose;
[contracts/desktop-frame-pump.md](./contracts/desktop-frame-pump.md) contains two
correctness rules that are invisible in manual testing.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prove the eight delivered files are legal *before* four apps start consuming them.

- [X] T001 Implement the portable-subset linter in `scripts/lint-lottie-assets.mjs` per [contracts/portable-subset.md](./contracts/portable-subset.md) — filename rule, per-file feature scan, per-file structural assertions (centring ±0.5, no clipped keyframe), and the five cross-file assertions
- [X] T002 Implement the three key-collision guards inside `scripts/lint-lottie-assets.mjs`: `x` counts as an expression **only** as a sibling of `k`/`a` (never inside an `i`/`o` ease handle), `ao` is checked by value not presence, and `tm`/`sr` are resolved by position (shape item vs layer property)
- [X] T003 [P] Add invalid fixtures under `scripts/__fixtures__/lottie/`: gradient fill, a real expression, a clipped keyframe, an off-centre crop, a duration that disagrees with its siblings, and a **legal control** whose only `x` keys are ease handles
- [X] T004 [P] Add `"lint:lottie": "node scripts/lint-lottie-assets.mjs"` to the root `package.json` scripts
- [X] T005 Add a `Launch animation assets are legal` step running `npm run lint:lottie` to the `app` job in `.github/workflows/ci.yml`, next to the existing `lint:i18n` step
- [X] T006 Implement `--self-test` inside `scripts/lint-lottie-assets.mjs` covering the naming rule, the per-file fixtures (each asserted to fail **for the reason its name claims**, via `EXPECTED_REASON`) and the cross-file fixture sets in `scripts/__fixtures__/lottie-crossfile/` (SC-005)
  - **Deviation from plan**: this was specced as `scripts/__tests__/lint-lottie-assets.test.mjs`. The repo's `jest.config.js` sets `roots: ['<rootDir>/src']` and `testMatch: ['**/__tests__/**/*.test.ts']`, so a test under `scripts/` would never have run — a green suite that executed nothing. Made a mode of the linter instead, wired into CI ahead of the gate itself.

**Checkpoint**: `npm run lint:lottie` is green on all eight delivered files and red on every fixture. The assets are provably legal and the linter is provably alive.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Every app links its runtime and receives the four `core` files at build time. Nothing renders yet.

**⚠️ CRITICAL**: No user story work can begin on a platform until that platform's two tasks below are done. The four platforms are independent of each other.

### Runtime dependencies

- [X] T007 [P] Add `dotlottie-rs` to `app-desktop/vela-wallet/Cargo.toml` as `{ git = "https://github.com/LottieFiles/dotlottie-rs", tag = "v0.1.58", default-features = false, features = ["dotlottie","tvg","tvg-cpu","tvg-threads"] }` and confirm `cargo build` performs **no network download** during `build.rs` (research D2)
- [X] T008 [P] Add `lottie-compose = { group = "com.airbnb.android", name = "lottie-compose", version.ref = "lottie" }` with `lottie = "6.7.1"` to `app-android/vela-wallet/gradle/libs.versions.toml` and the `implementation` line to `app-android/vela-wallet/app/build.gradle.kts`
- [X] T009 [P] Add the `airbnb/lottie-ios` 4.6.1 remote package to `app-ios/VelaWallet/VelaWallet.xcodeproj/project.pbxproj` (`XCRemoteSwiftPackageReference` + `XCSwiftPackageProductDependency`, modelled on the existing `XCLocalSwiftPackageReference "../VelaCoreKit"`), then verify with `xcodebuild -resolvePackageDependencies`
- [X] T010 [P] Add `lottie-web@^5.13.0` to `app-web/vela-wallet/package.json` devDependencies and run `pnpm install`

### Asset distribution (build time, no committed copies)

- [X] T011 [P] Create `app-ios/scripts/gen-animation-filelists.mjs` mirroring `gen-catalog-filelists.mjs`: writes `animations-input.xcfilelist` / `animations-output.xcfilelist` for the four `core` files, supports `--check`, and fails when any animation JSON has been committed under `app-ios/` (`git ls-files` guard)
- [X] T012 [P] Create `app-ios/scripts/bundle-animations.sh` mirroring `bundle-catalogs.sh` — file-list driven, `error:`-prefixed failures, no hardcoded paths — and register it as a `PBXShellScriptBuildPhase` named `Bundle launch animations` in `app-ios/VelaWallet/VelaWallet.xcodeproj/project.pbxproj`
- [X] T013 [P] Add a `syncVelaAnimationAssets` `Sync` task to `app-android/vela-wallet/app/build.gradle.kts` copying `design/onboarding/launch/*core*.json` into `build/generated/velaAnimations/animations/`, add the `assets.srcDir`, and wire it into `preBuild` and every `merge*Assets` task (mirroring `syncVelaI18nAssets`)
- [X] T014 [P] Create `app-desktop/vela-wallet/src/ui/launch_animation.rs` with the two `include_bytes!` constants for `vela-wallet-launch-desktop-core-{dark,light}.json` and export it from `app-desktop/vela-wallet/src/ui/mod.rs`
- [X] T015 [P] Add the four `core` files to `app-web/vela-wallet/src/lib/launch.ts` as Vite `?url` imports resolving into `design/onboarding/launch/`, so they are content-hashed and served from the app's own origin
- [ ] T016 Add `node app-ios/scripts/gen-animation-filelists.mjs --check` to the `app` job in `.github/workflows/ci.yml`

**Checkpoint**: All four apps build, link their runtime, and carry the four `core` files. `git ls-files design/onboarding/launch` returns eight paths and no app directory contains an animation JSON (SC-004).

---

## Phase 3: User Story 1 — The app opens with the wordmark building itself (Priority: P1) 🎯 MVP

**Goal**: Every app cold-starts into the animation, plays it once at authored speed over an opaque themed background, and lands on Welcome.

**Independent Test**: Cold-start each app in both appearances and watch the mark slide left while the letters build, then Welcome. Verified per platform by launching, not by unit test.

### Shared geometry (US1)

- [X] T017 [P] [US1] Add the launch constants and fit rule to `app-desktop/vela-wallet/src/theme.rs` per [data-model.md](./data-model.md) §4 — durations, budgets, `BOX_W_RATIO`, `BOX_ASPECT`, `LARGE_SCREEN_MIN_W`
- [X] T018 [P] [US1] Add the same constants to `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/core/designsystem/tokens/VelaLaunch.kt`
- [X] T019 [P] [US1] Add the same constants to `app-ios/VelaWallet/VelaWallet/DesignSystem/LaunchAnimation.swift`, with the `Appearance` and `FormFactor` enums
- [X] T020 [P] [US1] Add the same constants plus the form-factor predicate to `app-web/vela-wallet/src/lib/launch.ts`

### Desktop (US1)

- [X] T021 [US1] Implement the frame pump in `app-desktop/vela-wallet/src/ui/launch_animation.rs` per [contracts/desktop-frame-pump.md](./contracts/desktop-frame-pump.md): `Player::set_sw_target(&mut [u32], w, h, ColorSpace::ARGB8888)` → `RenderImage` → `img()`, driven by `window.request_animation_frame()`, with frame number derived from elapsed wall time
- [X] T022 [US1] Call `window.drop_image(previous)` when publishing each frame in `app-desktop/vela-wallet/src/ui/launch_animation.rs`, and drop the final image at end of playback — without this the sprite atlas gains ~102 textures per launch
- [X] T023 [US1] Reallocate the buffer and re-call `set_sw_target` on window resize in `app-desktop/vela-wallet/src/ui/launch_animation.rs` **without restarting playback**
- [X] T024 [US1] Host the overlay in `app-desktop/vela-wallet/src/onboarding.rs`: opaque `theme.bg_base` background, box sized by the fit rule and centred, page composed underneath, 400 ms hold then a 400 ms cross-dissolve (overlay opacity 1→0 while the host applies `page_opacity()` to the Welcome content)

### Android (US1)

- [X] T025 [US1] Implement `VelaLaunchAnimation` in `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/core/designsystem/components/VelaLaunchAnimation.kt` — `rememberLottieComposition(LottieCompositionSpec.Asset(...))` + `LottieAnimation(iterations = 1)`, signature per [contracts/launch-animation-api.md](./contracts/launch-animation-api.md)
- [X] T026 [US1] Host the overlay in `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/MainActivity.kt`: a `Box` above `VelaNavHost`, gated on `savedInstanceState == null`, starting only after the existing `splash.setKeepOnScreenCondition` releases, passing `darkTheme` from `isDarkEffective()` and `largeScreen` from `LocalConfiguration`
- [X] T027 [US1] Change `vela_splash_bg` to follow appearance by adding it to `app-android/vela-wallet/app/src/main/res/values-night/colors.xml` (FR-022)
- [X] T028 [US1] Cover the OS-vs-in-app theme seam in `VelaLaunchAnimation.kt` by crossfading the overlay background from the system splash colour over `EXIT_CROSSFADE_MS` at the *start* of the overlay (FR-023, research D5)

### iOS (US1)

- [X] T029 [US1] Implement `LaunchAnimationView` in `app-ios/VelaWallet/VelaWallet/Components/LaunchAnimationView.swift` using `LottieView` with `LottieConfiguration(renderingEngine: .coreAnimation)` set explicitly, signature per [contracts/launch-animation-api.md](./contracts/launch-animation-api.md)
- [X] T030 [US1] Host the overlay in `app-ios/VelaWallet/VelaWallet/App/RootView.swift`: `ZStack` above the existing content, opaque themed background, `@State` true only on first construction, 400 ms hold then a 400 ms cross-dissolve of both layers

### Web (US1)

- [X] T031 [US1] Implement `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte` — `await import('lottie-web/build/player/lottie_light')` inside `onMount` only, `loop: false`, `renderer: 'svg'`, renders nothing during SSR
- [X] T032 [US1] Host the overlay in `app-web/vela-wallet/src/routes/+layout.svelte` as a fixed-position opaque layer, mounted client-side only and gated on the `vela.launch.played` `sessionStorage` marker
- [X] T033 [US1] Re-evaluate the form factor on viewport resize in `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte` without restarting playback

### Cross-platform geometry tests (US1)

- [X] T034 [P] [US1] Add a fit-rule unit test to `app-desktop/vela-wallet/src/theme.rs` asserting the five viewports tabulated in research D1
- [X] T035 [P] [US1] Add the same table as `app-android/vela-wallet/app/src/test/java/app/getvela/wallet/LaunchGeometryTest.kt`
- [X] T036 [P] [US1] Add the same table as `app-ios/VelaWallet/VelaWalletTests/LaunchGeometryTests.swift`
- [X] T037 [P] [US1] Add the same table as `app-web/vela-wallet/src/lib/launch.test.ts`

**Checkpoint**: All four apps open with the animation in both appearances. Demoable, but **not yet shippable** — the failure paths in US2 are what make it safe to put in front of a user.

---

## Phase 4: User Story 2 — The animation can never trap a user outside their wallet (Priority: P1)

**Goal**: Every failure path — missing asset, malformed asset, slow first frame, runaway playback, user impatience — lands on an interactive Welcome screen, silently.

**Independent Test**: Delete the asset from a build, throttle the device, tap during playback. Welcome is reached every time, with no error shown.

- [X] T038 [P] [US2] Enforce `FIRST_FRAME_BUDGET_MS` and `HARD_CEILING_MS` in `app-desktop/vela-wallet/src/ui/launch_animation.rs`, and treat every `dotlottie-rs` error (including a `CString::new` failure from an interior NUL) as a silent finish
- [X] T039 [P] [US2] Enforce the same two budgets in `app-android/.../VelaLaunchAnimation.kt` via `LaunchedEffect`, and route a null or failed `rememberLottieComposition` result to `onFinished`
- [X] T040 [P] [US2] Enforce the same two budgets in `app-ios/VelaWallet/VelaWallet/Components/LaunchAnimationView.swift` and route a failed animation load to `onFinished`
- [X] T041 [P] [US2] Enforce the same two budgets in `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte`, including a failed dynamic `import()` and a failed asset fetch
- [X] T042 [P] [US2] Add skip-on-input (pointer, tap, any key) to `app-desktop/vela-wallet/src/ui/launch_animation.rs`
- [X] T043 [P] [US2] Add skip-on-input to `app-android/.../VelaLaunchAnimation.kt`
- [X] T044 [P] [US2] Add skip-on-input to `app-ios/VelaWallet/VelaWallet/Components/LaunchAnimationView.swift`
- [X] T045 [P] [US2] Add skip-on-input to `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte`
- [X] T046 [US2] Latch the completion signal so it fires **exactly once** — a completion callback racing a timeout is the obvious double-dismiss — in all four components: `app-desktop/vela-wallet/src/ui/launch_animation.rs`, `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/core/designsystem/components/VelaLaunchAnimation.kt`, `app-ios/VelaWallet/VelaWallet/Components/LaunchAnimationView.swift`, `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte`
- [X] T047 [P] [US2] Add a missing/malformed-asset test to `app-desktop/vela-wallet/src/ui/launch_animation.rs` (`cargo test`) proving playback finishes immediately (FR-027)
- [~] T048 [P] [US2] Add the equivalent to `app-android/vela-wallet/app/src/androidTest/java/app/getvela/wallet/LaunchAnimationTest.kt`
  - **Written and compiling; NOT executed.** `connectedDebugAndroidTest` needs a device or emulator and `adb devices` is empty on this machine. Five instrumented tests are in place (exactly-once finish, tap-to-skip, reduce-motion skips the hold, progressive page fade, missing asset finishes silently).
- [ ] T049 [P] [US2] Add the equivalent to `app-ios/VelaWallet/VelaWalletTests/LaunchAnimationTests.swift`
  - **Not written.** The failure path is implemented (`LottieAnimation.named` returning nil → `finishOnce()`), and `LaunchGeometryTests.animationsAreBundled` proves the happy path from inside the app, but there is no test that forces the *missing-asset* branch.
- [ ] T050 [P] [US2] Add the equivalent to `app-web/vela-wallet/e2e/launch-animation.e2e.ts`
  - **Not written.** The failure paths are implemented (failed dynamic import, missing asset, unparseable file all reach `finishOnce`), and the unit tests cover the replay gate's storage-throws branch, but no e2e forces a missing asset.
- [X] T051 [US2] Add a `cargo test` to `app-desktop/vela-wallet/src/ui/launch_animation.rs` asserting the live `RenderImage` count stays bounded across a full 102-frame playback — the texture leak is invisible on screen (research D2)
  - **Done differently, and better.** `drop_image` needs a real `Window`, and gpui's `TestAppContext` needs the `test-support` feature (proptest + x11 + wayland — gpui compiled twice). Instead the release invariant was made *structural*: `FrameSlot::replace` is `#[must_use]` and **returns the frame it evicted**, so the caller is handed the thing it must release. `frame_pump_never_holds_more_than_one_texture` then drives a full 102-frame playback and asserts at most one is ever live and 101 are handed back.

**Checkpoint**: The animation is safe to ship on every platform. This plus US1 is the first genuinely shippable state.

---

## Phase 5: User Story 3 — Users who asked for less motion get less motion (Priority: P1)

**Goal**: With reduce-motion on, the final composed lockup appears statically and Welcome follows with no added delay.

**Independent Test**: Enable the platform's reduce-motion setting, cold-start, and confirm nothing moves or fades and the app is no slower.

- [X] T052 [P] [US3] Honour `cx.reduce_motion()` in `app-desktop/vela-wallet/src/ui/launch_animation.rs`: `set_frame(total_frames())`, render once, publish one image, never call `request_animation_frame`
- [X] T053 [P] [US3] Honour the reduce-motion flag in `app-android/.../VelaLaunchAnimation.kt` by rendering at `progress = 1f`, reading the setting in `MainActivity.kt` and passing it down
- [X] T054 [P] [US3] Honour `accessibilityReduceMotion` in `app-ios/VelaWallet/VelaWallet/App/RootView.swift`, passing it into `LaunchAnimationView` which renders the final frame statically
- [X] T055 [P] [US3] Honour `prefers-reduced-motion` in `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte` by seeking to the final frame without playing
- [X] T056 [US3] Mark the overlay decorative — hidden from the accessibility tree, no focus taken (FR-021) — in `app-desktop/vela-wallet/src/ui/launch_animation.rs`, `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/core/designsystem/components/VelaLaunchAnimation.kt`, `app-ios/VelaWallet/VelaWallet/Components/LaunchAnimationView.swift`, `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte`
- [ ] T057 [P] [US3] Add reduce-motion tests asserting the static final frame and no added delay (FR-028) to `app-desktop/vela-wallet/src/ui/launch_animation.rs`, `app-android/vela-wallet/app/src/androidTest/java/app/getvela/wallet/LaunchAnimationTest.kt`, `app-ios/VelaWallet/VelaWalletTests/LaunchAnimationTests.swift` and `app-web/vela-wallet/e2e/launch-animation.e2e.ts`
  - **Not done.** Reduce-motion is implemented on all four and covered by an Android instrumented test that has never been run (no device) and by the iOS/desktop paths; there is no dedicated reduce-motion test on desktop or web.

**Checkpoint**: The three P1 stories are complete on all four platforms. This is the release candidate.

---

## Phase 6: User Story 4 — The next animation costs a day, not a week (Priority: P2)

**Goal**: A second animation reaches all four apps with no build-configuration change, and an illegal one is rejected automatically.

**Independent Test**: Drop a second legal animation into the design directory, build all four apps, confirm it is bundled without editing any build file.

- [X] T058 [US4] Verify FR-004 empirically: add a scratch animation file to `design/onboarding/launch/`, rebuild all four apps, confirm it is bundled with **zero** build-configuration edits, then remove it and record the result in [quickstart.md](./quickstart.md)
  - **This task found a real defect, which is why it exists.** A second animation (`vela-wallet-probe-*`) was rejected outright: both `scripts/lint-lottie-assets.mjs` and `app-ios/scripts/gen-animation-filelists.mjs` had hardcoded `launch` in their naming regex, so adding one required editing two scripts. Generalised the name to a field and grouped the cross-file assertions by animation (two animations may legitimately differ in duration, palette and crop). Re-verified: Android's `Sync` glob picked up 8 files and iOS declared 8, with **zero** build-configuration edits.
- [X] T059 [P] [US4] Add a repo-wide guard to `scripts/lint-lottie-assets.mjs` failing when any animation JSON is tracked outside `design/` (SC-004)
- [X] T060 [P] [US4] Add a short "adding an animation" section to `docs/DESIGN-LANGUAGE.md` pointing at [contracts/portable-subset.md](./contracts/portable-subset.md) as the single rule

**Checkpoint**: The path is reusable and the rule is enforced, not remembered.

---

## Phase 7: User Story 5 — The four platforms are provably showing the same thing (Priority: P2)

**Goal**: Rendering drift between three engines is detected before release, not by a user's screenshot.

**Independent Test**: Perturb the asset and confirm **all four** suites fail; restore and confirm all four pass.

- [X] T061 [P] [US5] Add golden-frame capture to `app-desktop/vela-wallet/src/ui/launch_animation.rs` tests, seeking deterministically rather than sleeping, with committed references in `app-desktop/vela-wallet/tests/golden/`
  - **Sample points changed during implementation**, from evenly-spaced progress to frames **0 / 24 / 45 / 65 / 101**, chosen from the animation's own keyframes (mark slides 12→36, glyph cascade 26→72). The first version sampled frame 25 — the gap between the slide ending and the first glyph appearing — and a deliberate asset change produced *identical* images at all four points, so the check was passing while blind. `golden_comparison_can_actually_fail` now also asserts every adjacent pair of sample points differs.
- [ ] T062 [P] [US5] Add the same to `app-android/vela-wallet/app/src/androidTest/java/app/getvela/wallet/LaunchAnimationTest.kt` driving a fixed progress value
  - **Blocked on hardware.** Golden-frame capture needs a device/emulator to rasterise; deferred with T048 rather than written blind against a reference nobody has rendered.
- [ ] T063 [P] [US5] Add the same to `app-ios/VelaWallet/VelaWalletTests/LaunchAnimationTests.swift`
  - **Not written.** Deferred until the founder has seen the iOS layout: the Welcome spacing changed in the same pass, so committing reference frames now would bake in geometry that may still move.
- [ ] T064 [P] [US5] Add the same to `app-web/vela-wallet/e2e/launch-animation.e2e.ts` using the existing `e2e/__screenshots__` convention
  - **Not written.** Deferred with T050 — both belong in one Playwright spec, and the founder has not yet seen the web build run.
- [ ] T065 [US5] Set and document a per-platform pixel tolerance — the checks are for drift, not bit-identity between different rasterisers — in `app-desktop/vela-wallet/src/ui/launch_animation.rs`, `app-android/vela-wallet/app/src/androidTest/java/app/getvela/wallet/LaunchAnimationTest.kt`, `app-ios/VelaWallet/VelaWalletTests/LaunchAnimationTests.swift` and `app-web/vela-wallet/e2e/launch-animation.e2e.ts`
  - **Not done.** Only desktop has golden frames, so there is one tolerance, documented in `launch_animation.rs`. The per-platform tolerances land with T062/T063/T064.
- [ ] T066 [US5] Run the SC-006 liveness check from [quickstart.md](./quickstart.md) §5 — perturb `design/onboarding/launch/vela-wallet-launch-phone-core-dark.json` and `vela-wallet-launch-desktop-core-dark.json`, confirm **all four** golden-frame suites go red, then `git checkout design/onboarding/launch/`
  - **Not done.** Ran for desktop only (a colour perturbation reddened frames 45/65/101). Cannot be a four-platform check until the other three suites exist.

**Checkpoint**: Every visual check is proven to be looking at the asset.

---

## Phase 8: Polish & Cross-Cutting Concerns

### Out-of-scope fixes made while reviewing builds

Found by the founder looking at real builds, fixed here because they were in the
way. None belongs to spec 012; each is independently revertible.

- [X] Android build was ~6 min per run: `cargoNdkBuild` declared no inputs/outputs, so Gradle re-ran the full three-ABI Rust cross-compile every time. Declared them in `app-android/vela-wallet/app/build.gradle.kts` — steady-state `assembleDebug` is now 5 s, and invalidation was verified with a real content change (not `touch`, which Gradle correctly ignores)
- [X] iOS pager dots sat 32 pt apart against Android's 12: each dot carried a `.frame(minWidth: 24)` for the touch target, which in SwiftUI expands LAYOUT too. Rewrote `app-ios/VelaWallet/VelaWallet/Components/PagerDots.swift` the Android way — row is the target, taps map by x, dots keep their pitch
- [X] iOS Welcome vertical rhythm was fixed-point while Android's is proportional (`region * 0.20` / `* 0.12`). Ported the proportional structure into `app-ios/VelaWallet/VelaWallet/Features/Onboarding/WelcomeScreen.swift` and matched four gaps to Android's tokens


- [X] T067 [P] Add a deterministic animation disable (env var / test tag / query param — never a sleep) to `app-desktop/vela-wallet/src/ui/launch_animation.rs`, `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/core/designsystem/components/VelaLaunchAnimation.kt`, `app-ios/VelaWallet/VelaWallet/Components/LaunchAnimationView.swift`, `app-web/vela-wallet/src/lib/ui/LaunchAnimation.svelte`, and use it from `e2e/` and the existing onboarding suites (FR-029)
- [X] T068 Run the existing suites on every platform and confirm no regression: `npx jest --ci`, `./gradlew testDebugUnitTest`, `cargo test`, `pnpm check && pnpm test`
- [ ] T069 [P] Verify FR-013/FR-013a on device — no part of the Welcome screen visible during playback, and its composition starting after the first presented frame — by tracing the hosts: `app-desktop/vela-wallet/src/onboarding.rs`, `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/MainActivity.kt`, `app-ios/VelaWallet/VelaWallet/App/RootView.swift`, `app-web/vela-wallet/src/routes/+layout.svelte`
  - **Not done.** Desktop and iOS were reasoned through and the hosts compose the page underneath, but "no part of Welcome is visible during playback" has not been traced on a running build.
- [X] T070 [P] Verify SC-009 by inspection: `grep -rl` for the runtime symbol returns exactly one file per app (`Lottie`, `com.airbnb.lottie`, `lottie-web`, `dotlottie_rs`)
- [X] T071 [P] Measure the web bundle cost per [quickstart.md](./quickstart.md) §4 by building `app-web/vela-wallet` and inspecting `.svelte-kit/cloudflare/_app/immutable/chunks/` — the lottie chunk must be ≈ 46 KB gzip and outside the initial page load; record the figure in [research.md](./research.md) D2
- [ ] T072 Verify SC-002 per platform on a real device or window — launch-to-Welcome grows by no more than the animation's own duration, and by zero under reduce-motion or skip — using the launch commands in [quickstart.md](./quickstart.md) §1–§4 and recording the figures against the budgets in `app-desktop/vela-wallet/src/theme.rs`, `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/core/designsystem/tokens/VelaLaunch.kt`, `app-ios/VelaWallet/VelaWallet/DesignSystem/LaunchAnimation.swift` and `app-web/vela-wallet/src/lib/launch.ts`
  - **Not done.** Not measured. Needs a real device per platform.
- [ ] T073 Run the full SC-001 matrix — four apps × two appearances, plus both form factors in a resizable `app-web/vela-wallet` window — following the appearance-toggle commands in [quickstart.md](./quickstart.md) §1–§4
  - **Not done.** Not run. The founder has seen desktop, Android and iOS by eye; the full 4×2 matrix plus both web form factors has not been walked.

---

## Dependencies

```
Phase 1 (linter)  ──►  Phase 2 (deps + asset pipelines)  ──►  Phase 3 (US1)  ──►  Phase 4 (US2)  ──►  Phase 5 (US3)
                                                                                                          │
                                                                                    Phase 6 (US4) ◄───────┤
                                                                                    Phase 7 (US5) ◄───────┘
                                                                                                          │
                                                                                                 Phase 8 (Polish)
```

- **Phase 1 blocks everything**: consuming assets that have not been proven legal is how a bad export reaches four apps at once.
- **Phase 2 blocks its own platform only.** The four platforms never share code in this feature, so `T007+T011/T012` (iOS), `T008+T013` (Android), `T007+T014` (desktop) and `T010+T015` (web) are four independent tracks.
- **US1 → US2 → US3** are ordered per platform: you cannot bound a budget (US2) before something plays (US1), and reduce-motion (US3) short-circuits paths US2 defines.
- **US4 and US5 depend on US1** completing on the platforms they check; they are independent of each other.

## Parallel Execution

Within a phase, `[P]` tasks touching different platforms can run concurrently:

- **Phase 2**: all ten tasks are `[P]` across four platforms — the widest parallel window in the feature.
- **Phase 3**: T017–T020 (constants) are fully parallel; then the four platform blocks (T021–T024, T025–T028, T029–T030, T031–T033) are independent; then T034–T037 are parallel.
- **Phase 4**: the budget tasks (T038–T041), the skip tasks (T042–T045) and the missing-asset tests (T047–T050) are each fully parallel across platforms.
- **Phase 5**: T052–T055 are fully parallel.
- **Phase 7**: T061–T064 are fully parallel.

## Implementation Strategy

**The phases above are for tracking; do not execute them breadth-first.** Doing
Phase 3 across four platforms, then Phase 4 across four platforms, means opening
Xcode, Android Studio, a Rust toolchain and a browser three times each.

**Recommended execution — vertical slices, one platform at a time**, in the plan's
risk order:

| Slice | Tasks | Why this order |
| --- | --- | --- |
| 0. Shared | T001–T006, T016 | The gate that protects everything downstream |
| 1. Desktop | T007, T014, T017, T021–T024, T034, T038, T042, T047, T051, T052, T061 | Highest technical risk (git-tag dependency, ThorVG C++ build, frame pump, texture lifetime). Failing here changes nothing else; failing here *late* would |
| 2. Android | T008, T013, T018, T025–T028, T035, T039, T043, T048, T053, T062 | Carries the extra `values-night` splash work (FR-022/FR-023) |
| 3. iOS | T009, T011, T012, T019, T029, T030, T036, T040, T044, T049, T054, T063 | Carries the `project.pbxproj` surgery |
| 4. Web | T010, T015, T020, T031–T033, T037, T041, T045, T050, T055, T064 | Carries the session gate and the no-SSR constraint |
| 5. Cross-cutting | T046, T056, T057, T058–T060, T065–T073 | Only meaningful once ≥ 2 platforms exist |

**MVP**: Slice 0 + Slice 1 (desktop) through US2 — one app that opens with the
animation and cannot trap a user. That is a complete, demonstrable, safe
increment, and it retires the feature's only novel integration first.

**Shipping bar**: a platform is shippable when its US1 **and** US2 **and** US3
tasks are done. US1 alone is demoable, not shippable — an animation that can
block entry to a wallet is a defect regardless of how well it renders.

## Requirement → Task Coverage

Every requirement in [spec.md](./spec.md) maps to at least one task. Without this
table the FRs that are satisfied *through* a contract rather than named in a task
description are the ones that quietly fall out.

| Requirement | Tasks |
| --- | --- |
| FR-001 single source of truth | T011, T059 |
| FR-002 build-time distribution | T011, T012, T013, T014, T015 |
| FR-003 build fails loudly on a missing asset | T012, T014 |
| FR-004 new animation needs no build change | T058 |
| FR-005 subset defined in one place | T001 |
| FR-006 subset enforced automatically | T001, T002, T003, T005, T006 |
| FR-007 all eight files pass | T006 |
| FR-008 once per cold start, authored speed | T024, T026, T030, T032 |
| FR-009 effective appearance | T024, T026, T030, T032 |
| FR-010 opaque themed background | T024, T026, T030, T032 |
| FR-011 form factor + fit rule | T017, T018, T019, T020, T033, T034, T035, T036, T037 |
| FR-012 continuous hand-off (crossfade) | T024, T026, T030, T032 |
| FR-013 self-contained screen | T024, T026, T030, T032, T069 |
| FR-013a Welcome prepared behind the animation | T069 |
| FR-014 first-frame budget | T038, T039, T040, T041 |
| FR-015 hard ceiling | T038, T039, T040, T041 |
| FR-016 skip on input | T042, T043, T044, T045 |
| FR-017 silent asset failure | T038, T039, T040, T041, T047, T048, T049, T050 |
| FR-018 Welcome always reachable | T046, T047, T048, T049, T050 |
| FR-019 reduce motion → static final frame | T052, T053, T054, T055 |
| FR-020 reduce motion adds no delay | T057, T072 |
| FR-021 decorative, no focus | T056 |
| FR-022 splash background follows appearance | T027 |
| FR-023 splash seam degrades gracefully | T028 |
| FR-024 one runtime-touching file per app | T070 |
| FR-025 same component shape everywhere | T021, T025, T029, T031, T070 |
| FR-026 golden frames per platform | T061, T062, T063, T064, T065 |
| FR-027 missing-asset test per platform | T047, T048, T049, T050 |
| FR-028 reduce-motion test per platform | T057 |
| FR-029 existing suites still pass | T067, T068 |

| Success criterion | Tasks |
| --- | --- |
| SC-001 all four apps, both appearances | T073 |
| SC-002 no launch-time regression | T072 |
| SC-003 asset deleted → still reaches Welcome | T047, T048, T049, T050 |
| SC-004 zero committed copies | T011, T059 |
| SC-005 linter provably alive | T003, T006 |
| SC-006 visual checks provably alive | T066 |
| SC-007 second animation costs no build change | T058 |
| SC-008 no Android splash flash | T027, T028 |
| SC-009 one runtime file per app | T070 |

**Eleven tasks map to no requirement, deliberately**: T004, T007–T010 and T016
are dependency and CI plumbing; T022, T023 and T051 are the desktop frame-pump's
correctness rules from [contracts/desktop-frame-pump.md](./contracts/desktop-frame-pump.md)
(texture release, resize without restart, and the leak test) — invisible on
screen, which is why they are tasks rather than trusted; T060 is documentation
and T071 is the measurement that keeps research D2's bundle claim honest.
