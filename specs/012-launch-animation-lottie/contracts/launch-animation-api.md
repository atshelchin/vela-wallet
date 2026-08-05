# Contract: Launch Animation Component

**Feature**: `012-launch-animation-lottie` | **Requirement**: FR-024, FR-025

One component per app is the **only** place a Lottie runtime is referenced.
Screens, view models and routes talk to this component; nobody else imports
`Lottie`, `com.airbnb.lottie`, `lottie-web` or `dotlottie_rs`. That is what makes
"swap the runtime" a one-file change (SC-009) and what contains the drift risk of
having chosen three engines.

## The shape, stated once

```
LaunchAnimation(
    appearance:   Dark | Light          # from the app's EFFECTIVE appearance, never the OS setting
    formFactor:   Phone | LargeScreen   # from the viewport predicate below
    reduceMotion: Boolean               # sampled once, at construction
    onFinished:   () -> Unit            # called EXACTLY once, for every outcome
)
```

`(appearance, formFactor)` selects one of the four shipped `core` assets. The
component does **not** resolve either itself — both are passed in, so tests can
drive all four combinations without touching system settings.

**Form factor and box, identical in all four languages** (research D1):

```
useLargeScreen = (viewportWidth >= viewportHeight) || (viewportWidth >= 768)

BOX_W_RATIO  phone 350/390 = 0.89744    large screen 680/1920 = 0.35417
BOX_ASPECT   phone 120/350              large screen 220/680

boxWidth  = viewportWidth × BOX_W_RATIO
boxHeight = boxWidth × BOX_ASPECT       # centred; no clipping, no clamping
```

The shipped assets are cropped to the motion path, so the box *is* the artwork —
there is no empty canvas to fit, clip or clamp.

**`onFinished` is the whole contract.** It fires on completion, on user skip, on
budget expiry, on ceiling hit, on asset failure, and immediately in the
reduce-motion path. The host does not distinguish between them — it only ever
removes the overlay. That single guarantee is what makes FR-018 checkable: if
`onFinished` always fires, Welcome is always reachable.

**Exactly once.** Double-firing must be impossible; a completion callback racing
a timeout is the obvious way to get a double-dismiss, so each implementation
latches.

## Per-platform signatures

### iOS — `Components/LaunchAnimationView.swift`

```swift
struct LaunchAnimationView: View {
    let appearance: LaunchAnimation.Appearance   // .dark | .light
    let formFactor: LaunchAnimation.FormFactor   // .phone | .largeScreen
    let reduceMotion: Bool
    let onFinished: () -> Void
}
```

- Uses `LottieView` with `.configuration(LottieConfiguration(renderingEngine: .coreAnimation))`.
  The engine choice is the reason this runtime was selected (research D2); it is
  set explicitly rather than left to `.automatic`, so a future asset that would
  silently drop to main-thread rendering shows up as a deliberate decision.
- `reduceMotion` comes from `accessibilityReduceMotion`, read by the **host**
  (`RootView`) and passed in — the component does not read the environment, so
  tests can drive it.
- Asset is loaded from the app bundle by name (bundled by the build phase, see
  research D3).

### Android — `core/designsystem/components/VelaLaunchAnimation.kt`

```kotlin
@Composable
fun VelaLaunchAnimation(
    darkTheme: Boolean,
    largeScreen: Boolean,
    reduceMotion: Boolean,
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
)
```

- `rememberLottieComposition(LottieCompositionSpec.Asset(...))` +
  `LottieAnimation(iterations = 1)`.
- The composition result is nullable *and* can carry an error; both go to
  `onFinished` (FR-017). A `LaunchedEffect` carries the `FIRST_FRAME_BUDGET` and
  `HARD_CEILING` timers.
- `darkTheme` is the same value `MainActivity` already computes via
  `ThemePreference.isDarkEffective()` — passed down, never recomputed.
- `largeScreen` comes from the predicate applied to
  `LocalConfiguration.screenWidthDp`/`screenHeightDp`. On a portrait-locked
  phone it is always `false`; on a ≥ 768 dp tablet it is `true` with no
  special-casing.

### Desktop — `ui/launch_animation.rs`

```rust
pub struct LaunchAnimation { /* … */ }

impl LaunchAnimation {
    pub fn new(mode: ThemeMode, cx: &mut App) -> Self;   // reads cx.reduce_motion()
    pub fn is_active(&self) -> bool;
    pub fn skip(&mut self);
    pub fn render(&mut self, bounds: Size<Pixels>, window: &mut Window, cx: &mut App) -> Option<Div>;
}
```

- Returns `None` once finished, which *is* the completion signal — GPUI's
  immediate-mode rendering makes a stored callback the wrong shape here, so the
  contract is expressed as "the host stops getting an element".
- No `formFactor` parameter: the desktop window's minimum is 1280 × 800, so the
  predicate is unconditionally `LargeScreen` and only the `desktop-core` pair is
  embedded. Hard-coding it here is honest — a phone-form-factor desktop window
  cannot exist — rather than carrying a parameter with one reachable value.
- Frame pumping and texture lifetime are specified separately in
  [desktop-frame-pump.md](./desktop-frame-pump.md).

### Web — `lib/ui/LaunchAnimation.svelte`

```svelte
<LaunchAnimation
  appearance={'dark' | 'light'}
  formFactor={'phone' | 'largeScreen'}
  reduceMotion={boolean}
  onfinished={() => void}
/>
```

- `lottie-web` is imported **dynamically** inside `onMount`
  (`await import('lottie-web/build/player/lottie_light')`), so it is never in the
  server bundle and never in the initial client chunk.
- The component renders nothing during SSR. The page is prerendered per locale
  and must be complete without it (spec Edge Cases).
- Constructed with `loop: false`, `autoplay: true`, `renderer: 'svg'`.

## Behaviour every implementation must satisfy

| # | Behaviour | Requirement |
| --- | --- | --- |
| 1 | `onFinished` fires exactly once, on every path | FR-018 |
| 2 | `reduceMotion` renders the final frame statically and finishes with no added delay | FR-019, FR-020 |
| 3 | Nothing on screen is exposed to assistive technology; no focus is taken | FR-021 |
| 4 | Asset load failure is silent and immediate | FR-017 |
| 5 | No frame presented within `FIRST_FRAME_BUDGET` → finish | FR-014 |
| 6 | `HARD_CEILING` from first presented frame → finish | FR-015 |
| 7 | Any pointer/key input → finish | FR-016 |
| 8 | Background/foreground pauses and resumes; never restarts | Edge Cases |
| 9 | Opaque background in the appearance's base colour behind the animation | FR-010 |
| 10 | Fit rule applied exactly as in `data-model.md` §4; on web and desktop the form factor is re-evaluated on resize without restarting playback | FR-011 |
| 11 | A deterministic disable exists for tests (env var / test parameter / query param) — never a sleep | FR-029 |

## What the host is responsible for

The host (`RootView`, `MainActivity`, `OnboardingPage`, `+layout.svelte`) owns:

- deciding this is a **cold start** (definitions in `data-model.md` §3);
- resolving the effective appearance, the form factor and reduce-motion, and
  passing all three in;
- composing the Welcome content **underneath** the overlay, so the crossfade
  reveals a finished screen rather than an empty one. The overlay is opaque
  (FR-010/FR-013), so none of this is visible: to the user the animation is a
  screen of its own and Welcome follows it. Start this preparation only **after
  the animation's first frame is presented** (FR-013a) — earlier and it competes
  with the animation's own start; later and the hand-off has work left to do at
  exactly the wrong moment;
- running the `EXIT_CROSSFADE` and removing the overlay on `onFinished`.

The host must **not** contain any branch about the animation's internal state.
