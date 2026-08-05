# Phase 1 Data Model: Lottie Launch Animation

**Feature**: `012-launch-animation-lottie` | **Date**: 2026-08-05

No persistent data is introduced on the native platforms; the only stored value
anywhere is one web session marker. The "model" here is therefore the playback
state machine and the constants that drive it — the things four independent
implementations must agree on to behave identically.

---

## 1. Launch Animation Asset

The design-owned input. Read-only to every app. Eight files: two **form factors**
× two **appearances** × two **framings**, of which only the four cropped
(`core`) files are shipped.

| Field | Values |
| --- | --- |
| `formFactor` | `phone` \| `desktop` (the large-screen composition) |
| `appearance` | `dark` \| `light` |
| `framing` | `core` (cropped to the motion — **shipped**) \| full-bleed (**reference only**) |
| `path` | `design/onboarding/launch/vela-wallet-launch-{phone\|desktop}-{core\|full}-{dark\|light}.json` |

| Framing | Canvas | Lockup | Lockup ÷ canvas W |
| --- | --- | --- | --- |
| `core` (phone) | 350 × 120 | 314.85 × 65.00 | 0.8996 |
| `desktop-core` | 680 × 220 | 566.73 × 117.00 | 0.8334 |
| `phone` full-bleed | 390 × 844 | 314.85 × 65.00 | 0.8073 |
| `desktop` full-bleed | 1920 × 1080 | 566.73 × 117.00 | 0.2952 |

Invariant across all eight: `fr = 60`, `ip = 0`, `op = 102`, `durationMs = 1700`,
11 shape layers, `assets: []`, no `fonts`. The desktop composition is the phone
composition at exactly **1.8×** (research D1).

The **full-bleed files are never loaded at runtime.** Their only job is to pin
`BOX_W_RATIO` (§4): the ratio each app uses *is* `core canvas ÷ full-bleed
canvas`. Keeping them turns a design constant into a checked derivation instead
of a transcribed number.

**Validation** (enforced by `scripts/lint-lottie-assets.mjs`, see
[contracts/portable-subset.md](./contracts/portable-subset.md)):

- Filename matches `vela-wallet-launch-{phone|desktop}-{core|full}-{dark|light}.json`.
- Parses as JSON and carries `v`, `w`, `h`, `fr`, `ip`, `op`, `layers`.
- Uses only features in the portable subset — with the three key-collision traps
  of research D6 respected (`x` handles, `ao: 0`, position-dependent `tm`/`sr`).
- `assets` is empty and no `fonts` key is present (nothing external to resolve).
- All eight agree on `fr`, `ip`, `op`.
- Each form-factor pair agrees on fill colours, layer count and layer names.
- `core` canvas ÷ full-bleed canvas equals the `BOX_W_RATIO` the apps use.
- Content is vertically centred within ±0.5 units, and no keyframe is clipped by
  the canvas.

**Relationships**: consumed by exactly one component per app
([contracts/launch-animation-api.md](./contracts/launch-animation-api.md)).
Never edited by app code; never copied into an app directory (FR-001).

**Verified 2026-08-05**: all eight files satisfy every assertion above. The
cropped phone framing was re-exported to fix a 2-unit vertical offset; it is now
27.50 / 27.50, matching the other three framings. The centring assertion is what
keeps it that way.

---

## 2. Portable Subset

Not runtime data — a specification-level entity, because it is the contract that
lets three rendering engines produce the same picture. Enumerated in
[contracts/portable-subset.md](./contracts/portable-subset.md); one file is both
the human-readable rule and the machine-checked one, so they cannot drift.

---

## 3. Launch Presentation

One occurrence of the animation, for one cold start. Lives only in memory, for
at most `HARD_CEILING` milliseconds.

| Field | Type | Notes |
| --- | --- | --- |
| `appearance` | `dark` \| `light` | resolved from the app's **effective** appearance (FR-009), not the OS setting |
| `formFactor` | `phone` \| `desktop` | from the viewport predicate in §4; re-evaluated on resize (web/desktop), fixed at construction on the portrait-locked native apps |
| `reduceMotion` | boolean | sampled once, at construction |
| `phase` | see state machine below | |
| `startedAt` | monotonic timestamp | set when the overlay is constructed, *not* when the first frame lands |
| `presentedAt` | monotonic timestamp \| null | set when the first frame is actually on screen; `null` past `FIRST_FRAME_BUDGET` means abandon |
| `outcome` | `completed` \| `skipped` \| `budgetExpired` \| `ceilingHit` \| `failed` \| `reducedMotion` | terminal; useful for debug logging, never surfaced to the user (FR-017) |

### State machine

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
  ┌──────────┐      │   asset load fails / runtime unavailable    │
  │ Idle     │──────┼────────────────────────────────────────┐    │
  └────┬─────┘      │                                        ▼    ▼
       │ cold start                                      ┌──────────────┐
       │ AND not yet played this session (web only)      │  Dismissed   │
       ▼                                                 │ (Welcome is  │
  ┌──────────┐   reduceMotion == true                    │  interactive)│
  │ Loading  │────────────────────────► StaticFinalFrame ─────►│       │
  └────┬─────┘                                                 └───▲───┘
       │ first frame presented                                     │
       │ (within FIRST_FRAME_BUDGET)                               │
       ▼                                                           │
  ┌──────────┐  reaches final frame ──► Holding (400 ms) ─────►    │
  │ Playing  │  user input (tap/click/key) ───────────────────►  Exiting
  │          │  now − presentedAt > HARD_CEILING ─────────────►  (dissolve
  └──────────┘  runtime error ───────────────────────────────►   400 ms)
       ▲
       │ (no transition back: backgrounding pauses, it does not restart)

  Loading, elapsed > FIRST_FRAME_BUDGET ─────────────────────► Dismissed
```

**Rules the machine encodes** (each maps to a spec requirement):

| Rule | Requirement |
| --- | --- |
| Every path terminates in `Dismissed`, and `Dismissed` means Welcome is visible and interactive | FR-018 |
| `Loading` is bounded by `FIRST_FRAME_BUDGET`; expiry is a normal outcome, not an error | FR-014 |
| `Playing` is bounded by `HARD_CEILING` measured from `presentedAt` | FR-015 |
| Any input during `Loading` or `Playing` goes straight to `Exiting` | FR-016 |
| Any failure, at any phase, goes to `Dismissed` silently | FR-017 |
| `reduceMotion` skips `Playing` entirely and adds no delay | FR-019, FR-020 |
| There is no transition from `Dismissed` back to `Playing` | FR-008 |
| Backgrounding pauses; resuming continues; neither restarts | spec Edge Cases |
| A completed animation passes through `Holding` before `Exiting`; input skips straight to `Exiting` | FR-012a |
| Overlay and page opacity are complementary at every instant of `Exiting` | FR-012 |

**Cold start**, per platform:

| App | Definition |
| --- | --- |
| iOS | first construction of `RootView` in this process |
| Android | `MainActivity.onCreate` with `savedInstanceState == null`, after the existing `setKeepOnScreenCondition` gate releases |
| Desktop | first construction of `OnboardingPage` for the process |
| Web | no `sessionStorage` marker for the current browsing session |

---

## 4. Launch Constants

One block per app, values identical across all four (research D4, D1).

| Name | Value | Requirement |
| --- | --- | --- |
| `ANIMATION_DURATION_MS` | 1700 | derived from the asset |
| `HOLD_MS` | 400 | FR-012a — beat on the finished lockup |
| `EXIT_CROSSFADE_MS` | 400 | `motion.durationSlow`; 180 (`sheetOut`) read as a cut |
| `FIRST_FRAME_BUDGET_MS` | 400 | FR-014 |
| `HARD_CEILING_MS` | 3000 | FR-015 — nominal 1700+400+400 = 2500, plus slack |
| `LARGE_SCREEN_MIN_W` | 768 | FR-011 form-factor predicate |
| `BOX_W_RATIO` (phone) | 350 / 390 = 0.89744 | FR-011 |
| `BOX_W_RATIO` (large screen) | 680 / 1920 = 0.35417 | FR-011 |
| `BOX_ASPECT` (phone) | 120 / 350 | FR-011 |
| `BOX_ASPECT` (large screen) | 220 / 680 | FR-011 |

**Derived fit rule** (one expression, four languages):

```
useLargeScreen = (viewportWidth >= viewportHeight) || (viewportWidth >= LARGE_SCREEN_MIN_W)
boxWidth       = viewportWidth × BOX_W_RATIO
boxHeight      = boxWidth × BOX_ASPECT
```

Centred in the viewport. **No clipping and no clamping** — the shipped assets are
cropped to the motion, so the box *is* the artwork. On a 390 pt phone the box is
350 pt and the lockup 314.85 pt; on a 1920 px screen the box is 680 px and the
lockup 566.73 px — exactly as authored in both cases.

**Validation**:

- A unit test per platform asserts the rule at the five viewports tabulated in
  research D1, so a transcription error in any one of four languages is caught
  rather than eyeballed.
- The linter asserts `BOX_W_RATIO == core canvas width ÷ full-bleed canvas
  width`, keeping the constants a checked derivation from the assets rather than
  a transcribed number.

---

## 5. Reference Frames

The evidence that the three engines still agree.

| Field | Value |
| --- | --- |
| `platform` | `ios` \| `android` \| `desktop` \| `web` |
| `formFactor` | `phone` \| `desktop` — whichever that platform can actually reach (iOS/Android: phone; desktop: large screen; web: both) |
| `appearance` | `dark` \| `light` |
| `progress` | `0.00`, `0.25`, `0.50`, `1.00` |
| `image` | committed PNG under the platform's own test-fixture directory |
| `tolerance` | per-platform; anti-aliasing differs between engines |

Both form factors are capturable — the `phone-core` centring defect recorded in
§1 was re-exported and verified on 2026-08-05.

**Rules**:

- Frames are captured by **seeking to a progress value**, never by sleeping —
  the same determinism FR-029 needs.
- Editing either asset must make **all four** platforms fail (SC-006). A suite
  that stays green after an asset edit is not testing the asset.
- Reference images live with their platform's tests, not in `specs/` — they are
  test fixtures, not documentation.
