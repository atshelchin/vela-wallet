# Implementation Plan: Lottie Launch Animation Across Four Apps

**Branch**: `012-launch-animation-lottie` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-launch-animation-lottie/spec.md`

## Summary

Play the existing 1.7-second Vela wordmark build at cold start in all four
standalone apps, from one committed pair of animation files, without ever
delaying or blocking entry to the wallet.

Technical approach: **per-platform runtime, one behaviour**. iOS, Android and web
use the Airbnb runtimes (mature, on their platforms' normal package channels,
and — on iOS — GPU-composited via the Core Animation engine, which matters
because this runs on the launch path). Desktop uses `dotlottie-rs`, the only
Lottie runtime that exists for Rust, rendering into a CPU buffer whose pixel
format (premultiplied BGRA) is exactly what `gpui::RenderImage` consumes, so the
per-frame cost is a `memcpy` and not a conversion. Every runtime sits behind one
thin per-app component, so the drift risk that the split creates is contained to
one file per platform and detected by golden-frame checks.

Assets are distributed at build time from `design/onboarding/launch/` using each
platform's existing mechanism (the spec 010 `.xcfilelist` build phase on iOS, the
spec 008 `Sync` task on Android, Vite on web, `include_bytes!` on desktop). No
app gets a committed copy — the duplication spec 010 exists to prevent.

## Technical Context

**Language/Version**: Swift 5.9+ (iOS 17+ target), Kotlin 2.2.10 / JVM 11 (minSdk 31), Rust 1.97.1 (edition 2024), TypeScript 6 + Svelte 5.56 (runes)

**Primary Dependencies**:

| App | Added dependency | Channel |
| --- | --- | --- |
| `app-ios/VelaWallet` | `airbnb/lottie-ios` **4.6.1** | SPM remote package (joins the existing local `VelaCoreKit` reference) |
| `app-android/vela-wallet` | `com.airbnb.android:lottie-compose` **6.7.1** | Maven Central |
| `app-web/vela-wallet` | `lottie-web` **5.13.0** (`lottie_light` entry point) | npm, self-hosted, dynamic `import()` |
| `app-desktop/vela-wallet` | `dotlottie-rs` **tag v0.1.58**, `default-features = false`, features `["dotlottie","tvg","tvg-cpu","tvg-threads"]` | git tag (crates.io only has a 2024 alpha — research D2) |

**Storage**: Web only — one `sessionStorage` key marking "already played this
session". Native apps derive "cold start" from process lifetime; nothing is
persisted.

**Testing**: XCTest (iOS), JUnit4 + Compose UI test (Android), `cargo test`
(desktop), Vitest + Playwright (web), plus one Node linter at the repo root
running in the existing `app` CI job.

**Target Platform**: iOS 17+, Android 12+ (API 31), macOS/Linux/Windows desktop via GPUI, evergreen browsers via Cloudflare Workers

**Project Type**: Four sibling client applications sharing one design-asset directory

**Performance Goals**: 60 fps playback; **≤ 400 ms** to first presented frame;
**≤ 3000 ms** hard ceiling on total animation time (nominal 2500 = 1700 play +
400 hold + 400 dissolve); **0 ms** added when the user skips (research D4)

**Constraints**: Must not delay app readiness (FR-013); must survive a missing or
malformed asset silently (FR-017); web must add no server-rendered markup and
must not become the LCP element; desktop must not leak a GPU texture per frame
(research D2 landmine)

**Scale/Scope**: 8 animation files (4 shipped, 4 reference), 4 apps, 1 new
component per app, 1 shared linter, 4 golden-frame suites

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is **still the unmodified Spec Kit template** —
every principle is a `[PRINCIPLE_N_NAME]` placeholder. There are therefore no
ratified project principles to gate against, and no violations can be asserted
either way.

Rather than record a vacuous pass, this plan was checked against the norms the
repository *actually* enforces, read off its CI configuration and its previous
eleven specs:

| Enforced norm (evidence) | This plan |
| --- | --- |
| One source of truth, distributed by generator, drift-checked in CI (`ci.yml`: i18n artefacts, identicon table, wire types, token generators) | **Pass** — FR-001/FR-002; `gen-animation-filelists.mjs --check` and a `git ls-files` guard against re-introduced copies |
| Generated/committed artefacts are re-derived in CI and required to diff clean | **Pass** — the iOS file lists follow the spec 010 `--check` pattern exactly |
| Native app directories are not committed wholesale; build wiring lives in tracked config | **Pass** — no generated asset is committed under any `app-*` |
| A check that cannot fail is not a check (`ci.yml` comments on the corpus and identicon gates) | **Pass** — SC-005 requires an invalid fixture, SC-006 requires all four visual checks to fail on an asset edit |
| Accessibility and failure paths are specified, not assumed (specs 007–011) | **Pass** — FR-017…FR-021 |

**Post-Phase-1 re-check**: unchanged. The Phase 1 artefacts introduce no new
dependency, no new build system, and no new source-of-truth directory. One
deliberate interpretation of FR-012 is recorded in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/012-launch-animation-lottie/
├── plan.md              # This file
├── research.md          # Phase 0 — measurements behind every decision
├── data-model.md        # Phase 1 — entities and the playback state machine
├── quickstart.md        # Phase 1 — how to run and verify each platform
├── contracts/
│   ├── portable-subset.md      # Which Lottie features an asset may use
│   ├── launch-animation-api.md # The one component shape, on all four platforms
│   └── desktop-frame-pump.md   # dotlottie-rs ⇄ gpui buffer/texture contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
design/onboarding/launch/                             # THE source of truth (already present)
├── vela-wallet-launch-phone-core-dark.json           #  350×120   SHIPPED (phone)
├── vela-wallet-launch-phone-core-light.json          #  350×120   SHIPPED
├── vela-wallet-launch-desktop-core-dark.json         #  680×220   SHIPPED (large screen)
├── vela-wallet-launch-desktop-core-light.json        #  680×220   SHIPPED
├── vela-wallet-launch-phone-full-dark.json           #  390×844   reference — pins BOX_W_RATIO
├── vela-wallet-launch-phone-full-light.json          #  390×844   reference
├── vela-wallet-launch-desktop-full-dark.json         # 1920×1080  reference
└── vela-wallet-launch-desktop-full-light.json        # 1920×1080  reference

scripts/
├── lint-lottie-assets.mjs                            # NEW — portable-subset gate (FR-005/006)
└── __fixtures__/lottie{,-crossfile}/                 # NEW — the linter's own failing inputs

app-ios/
├── scripts/
│   ├── gen-animation-filelists.mjs             # NEW — mirrors gen-catalog-filelists.mjs
│   ├── bundle-animations.sh                    # NEW — mirrors bundle-catalogs.sh
│   ├── animations-input.xcfilelist             # NEW — generated, committed
│   └── animations-output.xcfilelist            # NEW — generated, committed
└── VelaWallet/VelaWallet/
    ├── Components/LaunchAnimationView.swift    # NEW — the only file that imports Lottie
    ├── DesignSystem/LaunchAnimation.swift      # NEW — budgets, fit rule, asset names
    └── App/RootView.swift                      # EDIT — host the overlay

app-android/vela-wallet/app/
├── build.gradle.kts                            # EDIT — lottie-compose dep + syncVelaAnimationAssets
└── src/main/
    ├── java/app/getvela/wallet/
    │   ├── core/designsystem/components/VelaLaunchAnimation.kt   # NEW — only Lottie importer
    │   ├── core/designsystem/tokens/VelaLaunch.kt                # NEW — budgets + fit rule
    │   └── MainActivity.kt                                       # EDIT — host the overlay
    └── res/values-night/colors.xml                               # EDIT — vela_splash_bg (FR-022)

app-desktop/vela-wallet/
├── Cargo.toml                                  # EDIT — dotlottie-rs git dep
└── src/
    ├── ui/launch_animation.rs                  # NEW — only file touching dotlottie-rs
    ├── ui/mod.rs                               # EDIT — re-export
    ├── theme.rs                                # EDIT — launch budgets + fit constants
    └── onboarding.rs                           # EDIT — host the overlay

app-web/vela-wallet/
├── package.json                                # EDIT — lottie-web dep
└── src/
    ├── lib/ui/LaunchAnimation.svelte           # NEW — only file importing lottie-web
    ├── lib/launch.ts                           # NEW — budgets, fit rule, session gate
    └── routes/+layout.svelte                   # EDIT — host the overlay

.github/workflows/ci.yml                        # EDIT — run lint-lottie-assets.mjs
```

**Structure Decision**: No new top-level structure. Each app gains exactly two
new source files (the runtime-touching component, and its constants) plus edits
to its existing entry point, which is what makes FR-024/FR-025 verifiable by
inspection (SC-009). The only shared new artefact is the repo-root linter, placed
in `scripts/` next to `lint-i18n-corpus.mjs`, which it is modelled on.

## Implementation Notes

### Numbers fixed here (spec deliberately left these to the plan)

```
ANIMATION_DURATION   1700 ms     102 frames ÷ 60 fps, read from the asset
HOLD                  400 ms     FR-012a — beat on the finished lockup
EXIT_CROSSFADE        400 ms     = motion.durationSlow; 180 read as a cut
FIRST_FRAME_BUDGET    400 ms     FR-014 — abandon if nothing is presented by then
HARD_CEILING         3000 ms     FR-015 — nominal 2500, plus slack
LARGE_SCREEN_MIN_W    768 px     form-factor predicate (research D1)
```

Fit rule, identical on all four platforms — **two derived constants, no clamps**:

```
useLargeScreen = (viewportWidth >= viewportHeight) || (viewportWidth >= 768)

                       phone            large screen
BOX_W_RATIO            350/390          680/1920         = 0.89744 / 0.35417
BOX_ASPECT             120/350          220/680

boxWidth  = viewportWidth × BOX_W_RATIO
boxHeight = boxWidth × BOX_ASPECT
```

Centred; **no clipping and no clamps** — the `core` assets are cropped to the
motion, so the box *is* the artwork. `BOX_W_RATIO` is not a judgement call: it is
the core canvas divided by the full-bleed canvas it was cropped from, so at 390 pt
and at 1920 px the lockup lands at exactly the authored 80.7 % / 29.5 % of screen
width. The linter asserts the ratio still matches the assets (research D6), so a
re-crop cannot silently change the design.

### Assets shipped

Only the four **`core`** files are bundled (research D0/D3):

```
vela-wallet-launch-phone-core-{dark,light}.json           350 × 120 → phone
vela-wallet-launch-desktop-core-{dark,light}.json   680 × 220 → large screen
```

The four full-bleed files stay in `design/onboarding/launch/` as the reference
that pins `BOX_W_RATIO`; no app bundles them. Desktop embeds only the
`desktop-core` pair (its window minimum is 1280 × 800, so the phone form factor
is unreachable).

**Asset set verified 2026-08-05** (after a re-export of `phone-core`, which had
been 2 units below vertical centre): all eight files pass the portable-subset
scan and every cross-file invariant, all four framings are exactly centred, and
`BOX_W_RATIO` is unchanged. Golden-frame references can be captured for both
form factors.

### Order of work

The four platforms are independent after the two shared pieces land. Desktop is
sequenced first among the apps because it carries the only genuinely novel
integration (the frame pump); the other three are conventional library usage.

1. **Shared** — portable-subset contract + `lint-lottie-assets.mjs` + CI wiring.
   Proves the two existing files are legal before anything consumes them.
2. **Desktop** — highest technical risk (git-tag dependency, ThorVG C++ build,
   frame pump, texture lifetime). Failing here changes nothing else; failing
   here *late* would.
3. **Android** — has the extra `values-night` splash change (FR-022/FR-023).
4. **iOS** — has the extra `.xcfilelist` + `project.pbxproj` surgery.
5. **Web** — has the extra session-gate and no-SSR constraints.

### Known risks and their mitigations

| Risk | Mitigation |
| --- | --- |
| `project.pbxproj` hand-editing to add a remote SPM package and a build phase is error-prone | Model the new nodes on the existing `XCLocalSwiftPackageReference` and `PBXShellScriptBuildPhase` already in the file; verify with `xcodebuild -resolvePackageDependencies` and a clean build before moving on |
| ThorVG C++ build fails or is slow on a fresh machine / CI | Feature set chosen to avoid the wgpu-native network download (research D2). If the build proves unworkable, the fallback is a hand-written GPUI animation for desktop only — the other three platforms are unaffected, because nothing is shared between them |
| GPU texture leak on desktop (one `RenderImage` per frame) | `contracts/desktop-frame-pump.md` makes `drop_image` of frame *n−1* part of the contract; a `cargo test` asserts the live-image count stays bounded across a full playback |
| Existing onboarding tests start waiting out a 1.7 s overlay | FR-029 — each platform gets a deterministic disable (env var / test tag / query param), not a sleep |
| `lottie-web` is unmaintained | Contained behind one component (FR-024); the measured alternative costs 10× the bytes (research D2) and its replacement is a one-file change |

## Complexity Tracking

> Constitution Check has no ratified principles to violate, and after the
> 2026-08-05 decisions the plan no longer interprets any requirement against its
> wording. Nothing outstanding.

The one item that was open here — how FR-012 hands off to Welcome — was decided
by the founder on 2026-08-05 in favour of a whole-overlay crossfade, and FR-012
was reworded to say so. The decision and its rationale are recorded in the spec's
Assumptions and in research D9; this table is kept empty rather than deleted so
the next open question has an obvious home.
