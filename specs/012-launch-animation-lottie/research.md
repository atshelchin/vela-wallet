# Phase 0 Research: Lottie Launch Animation Across Four Apps

**Feature**: `012-launch-animation-lottie` | **Date**: 2026-08-05

Every measurement below was taken on 2026-08-05 against live registries and
source checkouts, not recalled. Commands are recorded so any of them can be
re-run when a number is doubted.

---

## D0. What the assets actually contain

The founder delivered the set in three passes on 2026-08-05 (13:03 phone
full-bleed, 13:43 desktop full-bleed, 13:50 both "core" crops). **Eight files**,
which are two form factors × two appearances × two framings:

| File | Canvas | Framing | Runtime use |
| --- | --- | --- | --- |
| `vela-wallet-launch-phone-full-{dark,light}.json` | 390 × 844 | full-bleed | **reference only** (pins the phone box constant, D1) |
| `vela-wallet-launch-desktop-full-{dark,light}.json` | 1920 × 1080 | full-bleed | **reference only** (pins the desktop box constant) |
| `vela-wallet-launch-phone-core-{dark,light}.json` | 350 × 120 | cropped to the motion | **shipped** |
| `vela-wallet-launch-desktop-core-{dark,light}.json` | 680 × 220 | cropped to the motion | **shipped** |

*(The delivered names left tokens implicit — `…-launch-core-dark.json` meant the
phone crop, `…-launch-phone-dark.json` the full-bleed phone framing. All eight
were regularised on 2026-08-05, with the founder's agreement and before anything
consumed them, to `vela-wallet-launch-{phone|desktop}-{core|full}-{dark|light}.json`.
With implicit tokens the linter's pairing logic needs four special cases and a
third form factor would be ambiguous — see the naming rule in
`contracts/portable-subset.md`.)*

**Measured**, identical across all eight files:

| Property | Value |
| --- | --- |
| Schema version | Lottie `5.12.2` |
| Frame rate / range | 60 fps, frames 0 → 102 = **1.700 s** |
| File size | 12.2 – 13.0 KB |
| Layers | 11, all `ty: 4` (shape) |
| Shape node types present | `sh` (path) ×18, `fl` (fill) ×13, `gr` (group) ×3, `tr` (transform) ×3 |
| Animated properties | 10 × layer opacity (`ks.o`), 1 × layer position (`ks.p`) |
| Structural | `ddd: 0`, `bm: 0`, `ao: 0`, `assets: []`, no `fonts` |
| **Absent** | masks, matte (`tt`/`td`), gradients, trim paths (`tm`), merge paths (`mm`), effects (`ef`), text, images, expressions, 3-D |

`fr`, `ip` and `op` are byte-identical across all eight — they are one animation
in eight framings, and the linter asserts exactly that (D6).

Motion: the mark holds at canvas centre until frame 12, then eases left over
frames 12→36 (`o:{x:.4,y:0} i:{x:.2,y:1}`). The ten wordmark glyphs fade 0→100
over 10 frames each, staggered 4 frames apart, first starting at frame 26, last
finishing at frame 76.

Colours (extracted from the `fl` nodes; **verified identical between each
form-factor pair**, and matching `docs/design-tokens.json` and the existing
in-app marks):

| Element | Dark | Light |
| --- | --- | --- |
| Wordmark glyphs | `#FFF8F3` | `#1A1A18` |
| Sail (main) | `#FF6A45` | `#FF5A36` |
| Sail (secondary) | `#FFA98E` | `#FFA98E` |
| Hull | `#DED5CE` | `#554B46` |

**Decision**: treat this feature set as the *portable subset* (D6). Everything in
it is in the universally-supported core of the format; nothing in it is a
renderer-specific extension. This is why three different rendering engines can
be used without visible disagreement **for these files** — a property to be
enforced going forward, not assumed.

---

## D1. Geometry, the two form factors, and the fit rule

### The two form factors are the same artwork at 1.8×

**Measured** by resolving every layer's transform (including `ks.s`, which the
first pass of this research wrongly ignored) and taking the union of path
vertices across the **whole timeline**, not just the final frame:

| | phone | desktop | ratio |
| --- | --- | --- | --- |
| Mark (`ks.s`) | 64.50 × 65.00 (100 %) | 116.10 × 117.00 (**180 %**) | 1.8000 |
| Wordmark width | 237.38 | 427.28 | 1.8000 |
| Mark ↔ wordmark gap | 12.97 | 23.35 | 1.8003 |
| **Lockup** | **314.85 × 65.00** | **566.73 × 117.00** | **1.8000** |

The desktop composition is the phone composition scaled by exactly 1.8. Nothing
was re-laid-out.

The one thing that genuinely differs — and the only reason two files are needed —
is **how much of the screen the lockup is meant to occupy**:

| | lockup ÷ canvas width | canvas aspect |
| --- | --- | --- |
| phone (390 × 844) | **80.73 %** | 0.462 (≈ 9:19.5) |
| desktop (1920 × 1080) | **29.52 %** | 1.778 (16:9) |

### The core crops lose nothing, and are what ships

A whole-timeline sweep confirms **no core file clips any frame**: the mark's
*start* position (canvas centre) lies inside the final lockup's x-range, so
cropping to the lockup discards no part of the motion path.

| File | Canvas | Content bbox over time | Clipped? |
| --- | --- | --- | --- |
| `core` | 350 × 120 | x 16.75…331.60, y 29.50…94.50 | no |
| `desktop-core` | 680 × 220 | x 55.15…621.88, y 51.50…168.50 | no |

Two measured reasons the crops ship instead of the full-bleed files:

1. **Desktop CPU cost.** `dotlottie-rs` rasterises the whole canvas on the CPU
   every frame and uploads it as a texture. In a 1280 × 800 window at 2× scale:

   | Asset | Pixels/frame | Bytes/frame | At 60 fps |
   | --- | --- | --- | --- |
   | full-bleed 1920 × 1080 | 2560 × 1440 = 3.69 M | 14.75 MB | 885 MB/s |
   | **core 680 × 220** | 907 × 293 = 0.27 M | **1.06 MB** | **64 MB/s** |

   A **13.9×** reduction, on the launch path, on the one platform doing software
   rasterisation.
2. **Everywhere else**, the full-bleed phone canvas is 92.3 % empty by area
   (65 of 844 rows carry content); the core canvas is 7.8× smaller to composite.

Nothing is lost because the app draws the background itself (FR-010) — the
animation's own background is transparent in both framings.

### The fit rule, derived rather than invented

Because the crop is tight, the rule collapses to **one constant per form
factor**, and that constant is not a judgement call: it is the core canvas
expressed in the reference screen it was cropped from.

```
boxWidth  = viewportWidth × BOX_W_RATIO       phone: 350/390  = 0.89744
                                            desktop: 680/1920 = 0.35417
boxHeight = boxWidth × (canvasH / canvasW)     phone: 120/350
                                            desktop: 220/680
centre in the viewport; no clipping, no clamps
```

Check: on a 390 pt phone this renders the 350-wide canvas at 350 pt, giving a
lockup of 314.85 pt — **exactly as authored**. On a 1920 screen the 680-wide
canvas renders at 680, lockup 566.73 — exactly as authored. Between and beyond
those, the authored lockup-to-screen ratio is held constant.

| Viewport | Form factor | Box | Lockup |
| --- | --- | --- | --- |
| 390 × 844 | phone | 350 × 120 | 314.9 (80.7 %) |
| 430 × 932 | phone | 386 × 132 | 347.1 (80.7 %) |
| 768 × 1024 | desktop | 272 × 88 | 226.6 (29.5 %) |
| 1280 × 800 | desktop | 453 × 147 | 377.9 (29.5 %) |
| 1920 × 1080 | desktop | 680 × 220 | 566.7 (29.5 %) |

**This supersedes the first draft of this section**, which — having only the
390 × 844 file — invented `clamp(240 px, viewport/390, 420 px)` to stop the
lockup collapsing on a landscape window. Those two clamp constants were guesses
standing in for a second composition; the second composition now exists, so they
are deleted rather than kept alongside it.

**Alternatives rejected**: `contain` on a full-bleed canvas (collapses the lockup
on landscape, and pays the 13.9× rasterisation cost); fitting to the lockup
bounding box (the format does not expose one, so every runtime would need the
sweep above baked in as a magic number — the canvas-relative ratio needs no
introspection at all).

### Form-factor selection — one predicate, four platforms

```
useLargeScreen = (viewportWidth >= viewportHeight) || (viewportWidth >= 768)
```

Evaluated in logical / density-independent units. Consequences, all of them
falling out rather than being special-cased: Android is `screenOrientation`-locked
to portrait and phones are < 768 dp wide, so it always resolves to phone; the
desktop window's minimum is 1280 × 800, so it always resolves to large-screen;
iPad and Android tablets get the large-screen composition without any
platform-specific code; the web picks per viewport and re-picks on resize.

`768` is the conventional tablet threshold. It is deliberately **not** the web
app's existing `breakpoint-desktop: 1280px` token — that token governs the
Welcome page's column layout, and overloading it would couple two unrelated
decisions.

### One defect found and fixed, and the guard against it recurring

The first `core` export placed the phone lockup 2 units below its canvas centre
(29.5 / 25.5 instead of 27.5 / 27.5) while the other three framings were exact.
Three framings centred and one not, with identical content, read as a crop slip
rather than optical centring — which would nudge *up*, not down.

**Re-exported 2026-08-05, verified**:

| File | Top | Bottom | Vertical offset |
| --- | --- | --- | --- |
| `core` (phone) | 27.50 | 27.50 | **0.00** ✓ |
| `desktop-core` | 51.50 | 51.50 | 0.00 ✓ |
| `phone` full-bleed | 389.50 | 389.50 | 0.00 ✓ |
| `desktop` full-bleed | 481.50 | 481.50 | 0.00 ✓ |

The re-export changed nothing else: `BOX_W_RATIO` still derives to 350/390 and
680/1920, all eight files still share `(fr, ip, op, layers) = (60, 0, 102, 11)`,
no keyframe is clipped, and every form-factor pair still matches on fill colours
and layer names. The linter's ±0.5-unit centring assertion is what keeps this
from recurring silently.

*(The horizontal offset of −0.82 (phone) / −1.48 (desktop) is present in all
eight files, is exactly 1.8× between form factors, and is therefore a property of
the artwork itself, not a crop defect. It is not corrected.)*

---

## D2. Runtime selection — the founder's question, answered with numbers

The question was "Airbnb or LottieFiles". The measured answer is **both, split by
platform**, and the split is forced rather than aesthetic: *Airbnb ships no Rust
runtime at all*, so the desktop app cannot use it, and once two runtimes exist
the "one engine everywhere" benefit is already unavailable unless the other three
platforms each pay a real cost to buy it back.

### Maintenance signals (GitHub API, 2026-08-05)

| Project | Stars | Last push | Latest release | Open issues |
| --- | --- | --- | --- | --- |
| `airbnb/lottie-ios` | 26,808 | 2026-07-08 | 4.6.1 (2026-06-13) | 44 |
| `airbnb/lottie-android` | 35,684 | 2026-02-15 | 6.7.1 (2025-10-31) | 69 |
| `airbnb/lottie-web` | 32,040 | 2025-09-01 | 5.13.0 (2025-05-21) | **852** |
| `LottieFiles/dotlottie-rs` | 273 | 2026-08-04 | v0.1.58 (2026-06-22) | 18 |
| `LottieFiles/dotlottie-ios` | 152 | 2026-07-28 | v0.16.7 | — |
| `LottieFiles/dotlottie-android` | 145 | 2026-07-21 | 0.15.0 | — |

### iOS → **`airbnb/lottie-ios` 4.6.1**

- Source-only SPM package; the app already consumes one local SPM package
  (`VelaCoreKit`), so the mechanism exists.
- Its **Core Animation rendering engine** hands playback to the render server:
  no per-frame main-thread work. For an animation that runs during app launch
  this is the decisive property. The engine supports the entire feature set in
  D0 (its documented fallbacks are for mattes, certain gradients and dash
  patterns — none present).
- `dotlottie-ios` measured cost: the SPM repository is **579,701 KB (~580 MB)**
  because two `.xcframework` binaries are committed into it with history, and
  `Package.swift` links **`WgpuNative` as a dynamic framework** on iOS/macOS —
  an extra dyld image to load and sign, on the launch path, to render a 12 KB
  vector animation on the CPU.
  ```
  curl -s https://api.github.com/repos/LottieFiles/dotlottie-ios | jq .size   # 579701
  curl -s https://raw.githubusercontent.com/LottieFiles/dotlottie-ios/main/Package.swift
  ```

### Android → **`com.airbnb.android:lottie-compose:6.7.1`**

- On **Maven Central**, confirmed:
  ```
  curl -s https://repo1.maven.org/maven2/com/airbnb/android/lottie-compose/maven-metadata.xml
  # <release>6.7.1</release>, lastUpdated 20251031160137
  ```
- Pure Kotlin/Java. **No native library**, so no new ABI payload — relevant
  because `app/build.gradle.kts` already prunes `abiFilters` to three ABIs for
  the uniffi `.so`.
- `dotlottie-android` measured cost: **it is not on Maven Central at all**,
  despite its README's "Maven Central (recommended)" section:
  ```
  curl -s -o /dev/null -w '%{http_code}' https://repo1.maven.org/maven2/com/lottiefiles/   # 404
  curl -s ".../maven-metadata.xml"                                                          # 404
  ```
  Only JitPack resolves (`com.github.LottieFiles:dotlottie-android:0.15.0` → 200),
  i.e. an on-demand build service in the dependency path of a wallet. Its README
  also advertises `0.5.0` while tags are at `0.15.0` — the published guidance is
  stale.

### Web → **`lottie-web` 5.13.0, `lottie_light` build, self-hosted, lazily imported**

Measured over the wire from jsDelivr (`Accept-Encoding` toggled):

| Artifact | Raw | gzip | brotli |
| --- | --- | --- | --- |
| `lottie_light.min.js` | 168,394 B | **46,499 B** | — |
| `lottie_light_canvas.min.js` | 203,001 B | 54,340 B | — |
| `lottie.min.js` (full) | 305,704 B | 76,203 B | — |
| `@lottiefiles/dotlottie-web` `index.js` | 152,859 B | 29,144 B | — |
| `@lottiefiles/dotlottie-web` `dotlottie-player.wasm` | **1,813,460 B** | 675,458 B | **513,002 B** |

So the dotLottie web runtime costs **~542 KB brotli** against **~46.5 KB gzip**
for `lottie_light` — an order of magnitude, to play a 12 KB animation on a
prerendered, conversion-critical page.

Worse, `@lottiefiles/dotlottie-web@0.78.2` **fetches its wasm from a third-party
CDN by default**. Grepped straight out of the shipped bundle:

```
https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.78.2/dist/dotlottie-player.wasm
https://unpkg.com/@lottiefiles/dotlottie-web@0.78.2/dist/dotlottie-player.wasm
```

A wallet's onboarding page issuing a runtime request to unpkg is a supply-chain
and privacy decision, not a default to accept silently. It is overridable, but
the fact that it must be overridden is itself a mark against the option.

**Accepted downside, stated plainly**: `lottie-web` is in maintenance mode — 852
open issues, no push since 2025-09-01. For a shape-only 12 KB animation this
buys nothing that a maintained runtime would; and FR-024/FR-025 put it behind
one component so replacing it later is a one-file change. (For the record,
`@lottiefiles/dotlottie-svelte@0.10.11`, published 2026-07-22, *does* declare
`svelte: ^5.0.0` and would be compatible with this app's Svelte 5 + runes setup —
the wrapper is not the problem, the 1.8 MB wasm behind it is.)

### Desktop → **`dotlottie-rs`, git tag `v0.1.58`**

Airbnb has no Rust implementation, so this is the only Lottie runtime available
to a GPUI app. Two findings make it workable:

1. **The published crate is a trap.** crates.io carries only
   `dotlottie-rs 0.1.0-alpha.1`, published **2024-09-18**, while the repository
   ships v0.1.58 (2026-06-22). The dependency **must** pin the git tag:
   ```
   curl -s https://crates.io/api/v1/crates/dotlottie-rs   # only 0.1.0-alpha.1
   ```
2. **The feature set decides whether the build touches the network.** Reading
   `dotlottie-rs/build.rs`: `main()` runs `thorvg::build()` only under the `tvg`
   feature, and the `wgpu_native` module — which **downloads prebuilt
   wgpu-native archives over HTTP at build time** via `minreq` — is reached only
   under `tvg-wg`. Selecting `default-features = false` with
   `["dotlottie", "tvg", "tvg-cpu", "tvg-threads"]` therefore compiles the
   vendored ThorVG C++ through `cc` and performs **no build-time download**, and
   drops the state-machine, theming, audio, PNG/JPEG/WebP and font decoders that
   this animation does not use.

**Fetch cost — measured, and larger than this section first implied:**

| | Size | Time |
| --- | --- | --- |
| What the build actually needs (shallow tag + shallow submodule) | **32 MB** | **16 s** |
| What `cargo fetch` insists on (full history) | **~590 MB** | tens of minutes |

`deps/thorvg` is a **git submodule** of `thorvg/thorvg` (402 MB) and `build.rs`
compiles from it, so cargo must fetch both repos' complete history before
anything compiles. That is the same order of magnitude as the 580 MB
`dotlottie-ios` checkout criticised above, and it is only fair to say so.

It does not change the runtime choice — Airbnb ships no Rust runtime, so there is no
alternative Lottie player for a GPUI app — but it is a real cold-cache cost.
**Decision (founder, 2026-08-05): keep the git tag dependency.** It is fully
reproducible and needs no extra mechanism; CI should cache `~/.cargo/git` so the
cost is paid once rather than per run. If that ever becomes the bottleneck, the
fallback is a shallow submodule plus a `path` dependency — a one-line Cargo.toml
change with no code impact.

**Pixel format — verified on both sides, and it is a free match:**

- `dotlottie_rs::Player::set_sw_target(&mut [u32], width, height, ColorSpace)`
  with `ColorSpace::ARGB8888` produces premultiplied `0xAARRGGBB` words; on a
  little-endian target those are the bytes `B, G, R, A`.
- `gpui/src/color.rs:25` documents its expectation verbatim: *"Swap from RGBA
  with premultiplied alpha to BGRA"* — `RenderImage` holds **premultiplied
  BGRA**.

So the player's buffer can be reinterpreted as `RenderImage` bytes with no
per-pixel conversion. (`ColorSpace::ABGR8888` would give RGBA byte order and
require a swap; the `…S` variants are straight, not premultiplied — both wrong
here.)

**GPUI APIs confirmed present at the pinned revision**
(`git+https://github.com/zed-industries/zed#c97b7c0`, gpui 0.2.2):

| Need | API | Location |
| --- | --- | --- |
| Show a CPU-rendered frame | `ImageSource::Render(Arc<RenderImage>)` | `elements/img.rs:46` |
| Drive the next frame | `Window::request_animation_frame()` | `window.rs:2346` |
| Honour reduce-motion | `App::reduce_motion()` | `app.rs:1010` |
| **Release the previous frame's texture** | `Window::drop_image(Arc<RenderImage>)` | `window.rs:4485` |

**Landmine**: `RenderImage::new` mints a fresh `ImageId` from a global counter
(`assets.rs:62`), and the renderer caches one GPU texture per
`(ImageId, frame_index)`. Producing a `RenderImage` per animation frame without
calling `drop_image` on its predecessor leaks ~102 textures per launch into the
sprite atlas. The player component must drop frame *n−1* when it publishes frame
*n*. This is written into `contracts/desktop-frame-pump.md` because it is
invisible in a 1.7 s manual test and only shows up under repeated launches.

---

## D3. Where the assets come from at build time

The repository has already settled this question twice, and both precedents
point the same way: **one committed copy, distributed at build time**.

| Precedent | Mechanism |
| --- | --- |
| Locale catalogues → Android (spec 008) | `Sync` task `syncVelaI18nAssets` copies `public/i18n/*.json` into `build/generated/velaI18n`, wired into `preBuild` and every `merge*Assets` task |
| Locale catalogues → iOS (spec 010) | A `PBXShellScriptBuildPhase` (`bundle-catalogs.sh`) driven by two generated `.xcfilelist` declarations, with `gen-catalog-filelists.mjs --check` failing CI on drift |
| Design tokens → web (spec 006) | `gen-tokens.mjs` reads `docs/design-tokens.json`, writes committed outputs, `--check` fails on drift |

**Decision** — mirror each platform's existing mechanism exactly rather than
invent a fifth:

| App | Mechanism | Notes |
| --- | --- | --- |
| iOS | New build phase `Bundle launch animations` + `animations-{input,output}.xcfilelist` generated by `app-ios/scripts/gen-animation-filelists.mjs` | Byte-for-byte the spec 010 pattern, including `--check`. The `.xcfilelist` declaration is what grants the sandboxed script (`ENABLE_USER_SCRIPT_SANDBOXING=YES`) read access outside `SRCROOT`. |
| Android | New `Sync` task `syncVelaAnimationAssets` → `build/generated/velaAnimations/animations/`, `assets.srcDir` added, wired into `preBuild` and `merge*Assets` | Identical shape to `syncVelaI18nAssets`, including the AGP-9 "static File, not Provider" constraint already documented in the build file. |
| Web | Vite `?url` / static import from a path that resolves into `design/onboarding/launch/` | Files are content-hashed by Vite and served from the app's own origin. |
| Desktop | `include_bytes!("…/design/onboarding/launch/vela-wallet-launch-desktop-core-{dark,light}.json")` | Compile-time; a missing or renamed file is a compile error, satisfying FR-003 for free. Only the desktop-core pair is embedded — the window minimum is 1280 × 800, so the phone form factor is unreachable there. |

**Only the four `core` files are distributed.** The four full-bleed files stay in
the design directory as the reference that pins the two box constants (D1) and
are checked by the linter, but no app bundles them. Each app therefore ships
**four** JSON files totalling ≈ 50 KB (2 form factors × 2 appearances), which is
smaller than shipping the full-bleed pair alone.

**Alternative rejected**: committing a copy under each app. That is exactly the
duplication spec 010 was written to delete, and the reason its generator greps
`git ls-files` to prove the copy has not come back. The same guard applies here
(FR-001 / SC-004).

---

## D4. Time budgets — concrete values for FR-014 and FR-015

Derived from the asset and from motion tokens the repo already defines
(`VelaMotion.kt`, `docs/design-tokens.json`):

| Constant | Value | Derivation |
| --- | --- | --- |
| `ANIMATION_DURATION` | **1700 ms** | 102 frames ÷ 60 fps, from the asset |
| `HOLD` | **400 ms** | A beat on the finished lockup. Not derivable — a feel judgement, tried at 2000 ms on the founder's request and cut to 400 on seeing it |
| `EXIT_CROSSFADE` | **400 ms** | `motion.durationSlow` / `motion.entranceFadeUp`. 180 ms (`motion.sheetOut`) was the first choice and reads as a cut at full-screen scale |
| Nominal total | **2500 ms** | 1700 + 400 + 400 |
| `FIRST_FRAME_BUDGET` (FR-014) | **400 ms** | If the runtime has not presented by then, the launch has already been hurt by more than the animation can repay. Roughly one quarter of the animation, and above any plausible parse time for a 12 KB shape-only file. |
| `HARD_CEILING` (FR-015) | **3000 ms** | Nominal + 500 ms of slack, measured from first presentation. Past this, playback is cut regardless of the frame reached. |

These are constants in one place per app so they can be tuned without touching
the spec (spec Assumptions says exactly this).

---

## D5. Theme resolution and the Android splash seam

The founder chose *follow the theme*. Each app already resolves an effective
appearance; the animation must read **that**, never the raw OS setting (FR-009):

| App | Source of truth |
| --- | --- |
| iOS | `Theme.swift` / SwiftUI `colorScheme` as `RootView` already resolves it |
| Android | `ThemePreference.isDarkEffective()` over the DataStore value (`Light`/`Dark`/`Auto`) |
| Desktop | `ThemeMode::detect(window)` — `VELA_THEME` env pin, else `window.appearance()` |
| Web | the `:root[data-theme]` / `prefers-color-scheme` cascade `tokens.css` already establishes |

**The Android seam, stated honestly.** `values/themes.xml` currently pins
`windowSplashScreenBackground` to `@color/vela_splash_bg` = `#1A1A18` in **both**
modes, and `values-night/colors.xml` overrides only `vela_window_bg`. Adding
`vela_splash_bg` to `values-night` makes the splash follow **the OS uiMode** —
which is the only signal available, because the system draws the splash window
before `MainActivity.onCreate` can read DataStore.

Therefore:

- **In-app theme agrees with the OS** (the overwhelmingly common case, since the
  default `ThemePreference` is `Auto`): splash background and animation
  background match exactly → no flash. This is SC-008.
- **User has overridden the theme in-app to the opposite of their OS**: the
  splash is painted in the OS appearance and the animation in the app's. The
  only honest mitigation is to make the change read as intentional — the
  animation's background crossfades from the splash colour to the app colour
  over `EXIT_CROSSFADE`-length at the *start* of the overlay rather than
  switching instantly. FR-023 requires exactly this degradation and nothing
  stronger, because nothing stronger is achievable on the platform.

**Alternative rejected**: keeping the splash fixed dark and always playing the
dark variant. It removes the seam but contradicts the founder's decision and
would show a dark splash to every light-mode user.

---

## D6. The portable subset, and how it is enforced

**Decision** — the permitted set is exactly what D0 measured, written once in
`contracts/portable-subset.md` and enforced by `scripts/lint-lottie-assets.mjs`
(the naming and reporting style of the existing `scripts/lint-i18n-corpus.mjs`).

Permitted: shape layers (`ty:4`), path (`sh`), solid fill (`fl`), group (`gr`),
group transform (`tr`), rectangle/ellipse/star primitives, layer transform
properties (`ks.o/p/s/r/a`), static and keyframed scalar/vector values with
bezier or hold interpolation.

Rejected with a named reason: gradients (`gf`/`gs`), strokes with dashes,
trim paths (`tm`), merge paths (`mm`), masks (`masksProperties`), track mattes
(`tt`/`td`), effects (`ef`), text layers (`ty:5`), image layers (`ty:2`) and
`assets[]`, precomps (`ty:0`), 3-D layers (`ddd:1`), expressions (`x`), time
remapping (`tm` on a layer), auto-orient (`ao:1`).

The check runs in the existing `app` CI job (Node, repo root) alongside
`lint-i18n-corpus`. It must fail on a deliberately invalid fixture, or it is not
a check (SC-005).

### Three key-collision traps, all measured on the real files

A linter written by pattern-matching key names rejects all eight legal files.
Each of these was found by scanning, not by reasoning:

1. **`x` is not always an expression.** Every file contains **22 `x` keys**.
   None is an expression. All 22 are bezier ease handles — `o:{x:0.4,y:0.0}` and
   `i:{x:0.2,y:1.0}` on the 11 animated keyframes (10 glyph fades + 1 mark
   slide, two handles each). The expression marker is `x` **as a sibling of
   `k`/`a` on a property object**; `x` inside an `i`/`o` handle is an easing
   coordinate. A naive recursive search for the `x` key fails every file on day
   one. This is the most dangerous of the three because `x`-as-expression *is*
   on the rejected list, so the failure looks correct.
2. **`ao` is present, as the harmless default.** Each file carries `"ao": 0`
   (auto-orient off). Compare the **value** (`ao === 1` is the violation), never
   the key's presence.
3. **`ty` and `sr` are overloaded by position.** `"tm"` is a *trim path* as a
   shape item but *time remapping* as a layer property; `sr` is a *star* as a
   shape item but *time stretch* as a layer property. The scan must walk shape
   item arrays and layer objects separately.

### Cross-file invariants the linter also asserts

Available only because there are now eight related files, and cheap to check:

| Invariant | Why |
| --- | --- |
| All eight agree on `fr`, `ip`, `op` | They are one animation; a diverging duration would desynchronise the form factors and break the shared time budgets (D4) |
| Each `{form}`/`{form}-core` pair agrees on fill colours, layer count and layer names | Catches a re-export of one framing only |
| `core` canvas ÷ full-bleed canvas equals the box ratio the apps use (`350/390`, `680/1920`) | The apps' only geometric constant is *derived* from the assets (D1); this is what stops a re-crop silently changing the design |
| Content is vertically centred within ±0.5 units | The `phone-core` defect in D1 cannot recur silently |
| No content is clipped at any keyframe | A future crop that cuts the motion path fails at commit time, not on a user's screen |

---

## D7. Per-platform placement of the overlay

| App | Where it lives | How it ends |
| --- | --- | --- |
| iOS | `RootView` renders `LaunchAnimationView` over the existing content in a `ZStack`, gated by an `@State` that starts `true` only on cold start | Completion closure → hold 400 ms → cross-dissolve (overlay opacity 1→0, page content 0→1) over 400 ms → remove |
| Android | `MainActivity.setContent` wraps `VelaNavHost` in a `Box`; the overlay composable draws above it. The existing `splash.setKeepOnScreenCondition` gate is **unchanged** — the overlay starts after it releases | `LottieAnimation` `iterations = 1` → hold 400 ms → cross-dissolve both layers over 400 ms |
| Desktop | `OnboardingPage::render` composes the page, then an absolutely-positioned overlay div while the animation is active | Pump reaches the last frame → `Holding` → `Exiting`, with the host applying `page_opacity()` to the Welcome content |
| Web | `+layout.svelte` mounts `<LaunchAnimation>` as a fixed-position overlay in `onMount` only when `sessionStorage` has no marker | `complete` event → hold 400 ms → CSS opacity transition on both layers → `{#if}` removes the node |

The web case carries the extra constraint from the spec's edge cases: the page is
prerendered per locale and must be complete without the overlay. The overlay is
therefore mounted **client-side only**, never server-rendered, so it can never be
the LCP element and a visitor without scripting sees the normal page.

### The hand-off, learned by looking at it

The first desktop build faded only the overlay's **background** and left the
lockup at full opacity until the element was removed. Reviewed as
"生硬消失" — the launch screen appeared to sit on top of Welcome and then vanish
abruptly. Two corrections came out of that:

1. **Fade the whole overlay, not its backdrop.** `gpui::Styled::opacity` on the
   overlay root; the equivalent on each other platform.
2. **Cross-dissolve, don't reveal.** The Welcome *content* ramps 0→1 while the
   lockup ramps 1→0. The background must NOT be part of either ramp — it lives on
   a shared root at `bg.base`, identical on both sides, so the dissolve never
   passes through a washed-out middle where both layers are half-transparent over
   the bare window. This is the whole reason the background sits on the root
   rather than on the page.

A hold on the finished lockup was added at the same time. It is the only place
this feature deliberately spends the user's time, so it is skippable by input and
bypassed under reduce-motion.

---

## D8. Golden-frame verification per platform

| App | Harness | Capture points |
| --- | --- | --- |
| iOS | XCTest + existing `VelaWalletTests`; render the animation at fixed progress into an image and compare | progress 0.0, 0.25, 0.5, 1.0 |
| Android | Compose UI test (`androidx.compose.ui.test.junit4`, already a dependency) driving the animation's progress deterministically via a fixed progress value | same four |
| Desktop | `cargo test` calling the player directly (no window needed — it renders into a CPU buffer, which is precisely what makes it testable) | same four |
| Web | Playwright, already configured in `app-web/vela-wallet/playwright.config.ts` with `e2e/__screenshots__` in use | same four, with playback pinned by seeking rather than waiting |

Tolerance is per-platform (anti-aliasing differs between engines); the checks
exist to catch *drift*, not to assert bit-identity. SC-006 requires that editing
the asset makes **all four** fail — the test that the tests are alive.

Deterministic seeking (setting progress explicitly rather than sleeping) is what
keeps these from being flaky, and is the same mechanism FR-029 needs so existing
onboarding tests can skip past the overlay instead of waiting it out.

---

## D9. The hand-off to Welcome, and why "fly the mark into place" is not the alternative it looks like

**Decision** (founder, 2026-08-05): the overlay crossfades out as a whole, over
an already-composed Welcome screen. The lockup dissolves in place.

### What is on both sides of the seam

All four Welcome screens already render the *same composition* the animation ends
on — the mark plus "Vela Wallet" on one horizontal row — so this is not "an
animation, then an unrelated screen":

| App | Welcome brand row | Alignment | Source |
| --- | --- | --- | --- |
| iOS | `BrandRow`: `VelaMark(37 pt)` + `Text`, gap 12 | centred | `Components/BrandRow.swift`, `WelcomeGeometry.markSize` |
| Android | `Row`: `VelaLogo(56 dp)` + `Text`, gap `space.xl` | **horizontally centred**, 20 % down the content region | `WelcomeScreen.kt`, `VelaSizing.emptyStateCircle` |
| Desktop | `brand_row`: `vela_mark(60 px)` + text, gap 34 | left, at x = `CONTENT_INSET + BRAND_INDENT` = 110, y = `BRAND_TOP` = 104 | `onboarding.rs`, `theme.rs` |
| Web | `header.brand`: `BrandMark(56)` + `h1`, gap `--space-xl` | centred on mobile, `flex-start` on desktop | `[locale]/+page.svelte` |

The launch lockup ends screen-centred at a mark size of ≈ 64.5 pt (phone, 390 pt
viewport) or ≈ 77 px (desktop, 1280 px window). So the two states differ in scale
everywhere, and in position on three of the four.

### The fact that decides it

The animation's wordmark is **traced vector outlines** — ten shape layers of
`sh` paths, no text layer, no `fonts` key (D0). Every Welcome screen's wordmark
is **live type** in Plus Jakarta Sans Bold. Two renderings of the same word by
two different mechanisms are not pixel-identical at any size: hinting, optical
sizing and outline-vs-font rasterisation all differ.

Consequently a travelling hand-off — animating the lockup's position and scale
onto the Welcome brand row — **still needs a crossfade at the destination** to
swap outlines for type. It is therefore `crossfade + a flight`, an *addition* to
the chosen hand-off rather than an alternative to it.

### Cost of the addition, for when it is reconsidered

Four separate implementations (SwiftUI `matchedGeometryEffect`, a Compose shared
transition, manual interpolation in GPUI, a FLIP transform on web), plus a
geometry channel from each Welcome layout back to the launch layer — which
couples the two and puts every future Welcome layout change at risk of breaking
the transition. It would also push the sequence past the 3000 ms hard ceiling
(D4), so the budget would have to be revisited.

Android and mobile web are the cheap cases if it is ever wanted: both centre the
brand row horizontally, so the flight there is a vertical translate plus a scale.
Desktop is the expensive one (both axes, and a left-aligned target).

**Alternative also rejected**: re-authoring the compositions so the lockup ends
at the Welcome brand row's position and size. Both delivered compositions centre
the lockup (D1), the four Welcome positions differ, and the animation would have
to play small and off-centre — which is most of what makes it a launch animation.
