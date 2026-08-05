# Contract: Desktop Frame Pump (`dotlottie-rs` ⇄ `gpui`)

**Feature**: `012-launch-animation-lottie` | **Applies to**: `app-desktop/vela-wallet/src/ui/launch_animation.rs`

The desktop app is the only one where the Lottie runtime does not already know
how to draw into the UI toolkit. `dotlottie-rs` rasterises into a CPU buffer;
GPUI displays GPU textures. This file specifies the seam, because two of its
properties are invisible in a manual test and would ship broken.

Everything below was verified against the pinned revisions on 2026-08-05:
`dotlottie-rs` v0.1.58 and `gpui` 0.2.2 at
`git+https://github.com/zed-industries/zed#c97b7c0`.

## Dependency

```toml
[dependencies]
dotlottie-rs = {
  git = "https://github.com/LottieFiles/dotlottie-rs",
  tag = "v0.1.58",
  default-features = false,
  features = ["dotlottie", "tvg", "tvg-cpu", "tvg-threads"],
}
```

Three things about this line are load-bearing:

1. **`tag`, not a version.** crates.io publishes only `dotlottie-rs 0.1.0-alpha.1`
   from 2024-09-18; the real code is 58 releases ahead and git-only (research D2).
2. **`default-features = false`.** The default set pulls `state-machines` and
   `theming`, neither of which this feature uses.
3. **No `tvg-wg` / `tvg-gl`.** `build.rs`'s `wgpu_native` module **downloads
   prebuilt archives over HTTP during the build**, and it is reached only under
   `tvg-wg`. Omitting it keeps the build offline and deterministic. Adding a GPU
   backend later is a conscious re-introduction of a network dependency, not a
   free upgrade.

`build.rs` compiles the vendored ThorVG C++ through `cc`; a C++ toolchain is
therefore a build prerequisite for the desktop app (it already is, via GPUI).

## Pixel format — a free match, and why

| Side | Format |
| --- | --- |
| `Player::set_sw_target(&mut [u32], w, h, ColorSpace::ARGB8888)` | premultiplied `0xAARRGGBB` words → little-endian bytes **B, G, R, A** |
| `gpui::RenderImage` | *"Swap from RGBA with premultiplied alpha to BGRA"* — `gpui/src/color.rs:25` — i.e. **premultiplied BGRA bytes** |

They are the same layout. The buffer is reinterpreted, not converted.

**Do not substitute another colour space.** `ABGR8888` yields RGBA byte order
and would render with red and blue swapped. The `…S` variants (`ARGB8888S`,
`ABGR8888S`) are *straight* alpha, not premultiplied, and would render with
haloed edges against the background — the failure mode is subtle enough to pass
a glance and fail a golden-frame check, which is the point of having one.

## Six undocumented rules, all found by building against v0.1.58

None is in the crate's docs. Rules 1–4 and 6 share one failure mode — **the animation
silently never appears**, with no error anywhere — which is why each is pinned by
a test in `launch_animation.rs` rather than a comment. Rule 5 crashes the test binary
outright.

Rules 2, 3 and 4 all funnel through `advance()`, which is the whole reason that
function exists.

### 1. A render target must be set BEFORE the animation is loaded

```rust
player.set_sw_target(&mut buffer, w, h, ColorSpace::ARGB8888)?;  // first
player.load_animation_data(&data)?;                              // then this
```

Reversed, `load_animation_data` returns `Err(Unknown)` and `total_frames()`
stays `0`. Measured:

| Order | Result |
| --- | --- |
| load with no target | `Err(Unknown)` |
| `set_sw_target` then load | `Ok`, `total_frames() == 102` |

The consequence for the component: the buffer must be allocated and the target
set in the constructor, not lazily on the first pump. Moving the owning `Vec`
into the struct afterwards is safe — a `Vec` move does not move its heap
allocation, which is what the player retains a pointer to — but every resize
must re-call `set_sw_target`.

Asserted by `a_render_target_must_be_set_before_loading`, which deliberately
also asserts the *failing* half: if upstream ever fixes this, the test fails and
the workaround can be removed rather than lingering forever.

### 2. `set_frame` REJECTS an unchanged frame

`set_frame(x)` twice in a row returns `Err`. Combined with rule 1 this bites on
the very first tick: `load_animation_data` leaves the player at frame 0, so a
pump that starts at frame 0 gets an error immediately and — if it treats that as
failure — dismisses the overlay before a single frame is shown.

`advance()` guards by asking `player.current_frame()` rather than tracking a
shadow copy, so the post-load frame nobody set is handled correctly too.

### 3. `render()` reports "nothing changed" as an error

`LottieRenderer::render` returns `Err(RendererError)` when `updated == false`
(`lottie_renderer/mod.rs`). That is not a failure: the buffer already holds the
requested frame. Since `load_animation_data` renders internally, the first user
render always lands here.

### 4. The valid frame range is `[0, total_frames − 1]`

With `total_frames() == 102`, `set_frame(101)` is fine and `set_frame(102)` is
`Err(InvalidParameter)`. Measured:

| Frame | Result |
| --- | --- |
| 0 (from a different frame) | `Ok` |
| 101 | `Ok` |
| 101.5 / 102 | `Err(InvalidParameter)` |

The pump therefore clamps to `total − 1`, and "playback finished" means reaching
that frame, not reaching `total`.

### 5. ThorVG's engine is not safe to initialise concurrently

Two tests each constructing a `Player` on cargo's default parallel test threads
**segfault the whole binary**. The same 17 tests pass with `--test-threads=1`.

The test module therefore serialises player construction behind a mutex, rather
than documenting a flag nobody will remember to pass — a plain `cargo test` is
what people run, and a SIGSEGV reads as "this code is broken", not "the harness
is racing".

### 6. `duration()` is in MILLISECONDS

It returns `1700` for the 1.7-second asset, not `1.7`. The frame pump divides
by it, so reading it as seconds advances the animation 1000× too fast — the
whole thing completes on its first frame, which again reads as "the animation
never played". Pinned by `embedded_assets_load_and_carry_the_authored_timeline`.

## The pump

The asset is `vela-wallet-launch-desktop-core-*.json`, a **680 × 220** canvas
cropped to the motion path. That choice is the single biggest performance lever
in this feature, because everything below runs on the CPU:

| Asset | Render at 1280 × 800 @2× | Pixels/frame | Bytes/frame | At 60 fps |
| --- | --- | --- | --- | --- |
| full-bleed 1920 × 1080 | 2560 × 1440 | 3.69 M | 14.75 MB | 885 MB/s |
| **core 680 × 220** | 907 × 293 | 0.27 M | **1.06 MB** | **64 MB/s** |

Per displayed frame:

1. Compute the target size in **device pixels**:
   `box_w = viewport_w · 680/1920`, `box_h = box_w · 220/680`, then
   `w = round(box_w · device_scale_factor)`, `h = round(box_h · …)`
   (fit rule, `data-model.md` §4). The desktop window's 1280 × 800 minimum means
   the form-factor predicate is unconditionally large-screen here.
2. If the size changed since the last frame (window resize), reallocate the
   `Vec<u32>` and call `set_sw_target` again. **Do not restart playback** — the
   spec's edge cases require reframing, not restarting.
3. `player.set_frame(frame_no)` where `frame_no` is derived from elapsed wall
   time, not from a frame counter — a dropped frame must skip, not slow the
   animation down.
4. `player.render()`.
5. Wrap the buffer bytes in an `image::Frame` and `Arc::new(RenderImage::new(…))`.
6. **Drop the previous frame's image** (see below).
7. `window.request_animation_frame()` while still playing.

## The texture-lifetime rule (the landmine)

`RenderImage::new` takes a fresh `ImageId` from a global counter
(`gpui/src/assets.rs:62`), and the renderer caches one GPU texture per
`(ImageId, frame_index)`. A new `RenderImage` every frame therefore creates a new
texture every frame: **~102 textures per launch**, none reclaimed, accumulating
in the sprite atlas for the life of the process.

**Required**: when publishing frame *n*, call

```rust
window.drop_image(previous_frame_image)?;   // gpui/src/window.rs:4485
```

for frame *n−1*, and drop the final image when playback ends.

**Required test**: a `cargo test` that pumps a full 102-frame playback and
asserts the number of live `RenderImage`s never exceeds a small constant. This
is not testable by looking at the screen, which is exactly why it is written
down.

## Reduce motion

`cx.reduce_motion()` (`gpui/src/app.rs:1010`) is read once at construction. When
set: `set_frame(total_frames())`, `render()`, publish **one** image, never call
`request_animation_frame`, and finish. GPUI's own `img` element already skips
animation frames under `reduce_motion` (`elements/img.rs:382`), so the pump must
not fight it by scheduling frames itself.

## Asset loading

```rust
const DARK: &[u8]  = include_bytes!("../../../../design/onboarding/launch/vela-wallet-launch-desktop-core-dark.json");
const LIGHT: &[u8] = include_bytes!("../../../../design/onboarding/launch/vela-wallet-launch-desktop-core-light.json");
```

Only the `desktop-core` pair is embedded (≈ 26 KB): the phone form factor is
unreachable in a window whose minimum is 1280 × 800, and the full-bleed files are
design references, not runtime assets.

Compile-time embedding satisfies FR-003 for free: a missing or renamed asset is a
compile error, not a silent empty launch. `Player::load_animation_data` takes a
`&CStr`, so the bytes are wrapped in a `CString` at construction; a
`CString::new` failure (an interior NUL) is treated like any other load failure —
finish silently (FR-017).

## What this contract does not cover

Positioning, background colour and the crossfade belong to the host
(`onboarding.rs`) per
[launch-animation-api.md](./launch-animation-api.md). This file is only about
getting correct pixels from ThorVG into GPUI without leaking them.
