# Research: Desktop Onboarding in GPUI

All decisions below were settled by direct measurement/inspection before planning.

## D1 — GPUI revision and build reproducibility

**Decision**: pin gpui to zed rev `c97b7c0` by committing a lockfile seeded from
`gpui-demo`'s (the project whose idioms this implementation follows).

**Rationale**: `Cargo.toml` references gpui by git URL without rev; an unpinned
build would float to zed's HEAD, where gpui's API moves weekly. The demo's
patterns (`Stateful<Div>` returns to escape RPIT lifetime capture, `canvas` +
`PathBuilder` drawing, `min_h(px(0.))` before `overflow_y_scroll`) are proven
against `c97b7c0`. Verified: a fresh `cargo build` with the seeded lockfile
completes in 44 s on this machine (warm cache) with zero errors.

## D2 — How to render the Vela mark

**Decision**: draw the three logo paths with `PathBuilder` fills
(`move_to`/`line_to`/`cubic_bezier_to`), scaled from the SVG's 258×260 viewBox.

**Rationale**: `gpui_platform::application()` installs `()` as the AssetSource, so
`svg()`/`img()` silently render nothing (documented in gpui-demo `icons.rs:6-9`).
Wiring a real AssetSource is possible but buys nothing here: gpui's `svg()`
renders monochrome masks, and the mark needs three colors. The mark's geometry is
three simple paths (two sails, one hull; verified by reading
`design/onboarding/logo-*.svg`), and gpui's `PathBuilder` exposes
`cubic_bezier_to` (checked at `crates/gpui/src/path_builder.rs:144`), so the
curves render exactly, not approximated.

**Colors** (sampled from both SVG variants + both mocks): sail A `#FF6A45`,
sail B `#FFA98E` in both themes; hull `#554B46` light / `#DED5CE` dark.
(`logo-light.svg` has sail A `#FF5A36`, but both PNG mocks composite it as
`#FF6A45`; the mocks win.)

## D3 — Theme palette

**Decision**: two token sets, sampled from the mocks (region-dominant-color
clustering over single-pixel reads, which anti-aliasing corrupts):

| Token | Light | Dark | Sampled from |
|---|---|---|---|
| `bg_base` | `#FAFAF8` | `#141412` | page background |
| `bg_raised` | `#FFFFFF` | `#1E1E1B` | cards + action panel |
| `fg_base` | `#1A1A18` | `#E8E6E1` | brand title cluster |
| `fg_muted` | `#6E6B62` | `#9A9790` | tagline / card body |
| `fg_subtle` | `#8C887E` | `#85827A` | card numerals |
| `accent` | `#E8572A` | `#E8572A` | primary button (identical in both mocks) |
| `border_card` | `#ECEBE4` | `#1E1E1B` (none visible) | card edge scan |
| `outline_strong` | `#554B46` | `#554B46` | secondary button border (both mocks) |
| `divider` | `#ECEBE4` | `#2C2C28` | column divider / panel divider |

Light values agree with `DESIGN_SYSTEM.md` §3 where they overlap (`#FAFAF8` base,
`#E8572A` accent); the mock's muted/subtle grays run darker than the RN tokens
(`#6E6B62` vs `#7A776E`) — the mock wins, since this spec's fidelity target is the
mock, and the darker values also carry better contrast.

Hover/active derivations (no mock exists for these states) are **per-theme**:
light darkens the accent (hover `#D14A20`, active `#BF421C` — white-label
contrast climbs), dark lightens it (hover `#F26A40`, active `#D44D22` — a
darker orange would sink toward the dark panel). Secondary hover fills with
`bg_sunken` (`#F5F3EF` light / `#262622` dark). All pairs re-checked against
SC-005's contrast floors (accent pairs under DV-004's 3:1).

## D4 — Dark secondary-button label fails contrast in the mock

**Finding**: dominant-cluster sampling of the dark mock's secondary button
interior shows label strokes only in the `#3C3733`–`#554B46` band — ≈ 2:1 against
`#1E1E1B`. The light mock's label is `#1A1A18` on white (≈ 16:1). The input
explicitly requires consistent contrast across modes.

**Decision**: DV-001 — dark label renders in `fg_base` (`#E8E6E1`, ≈ 12:1),
border keeps the mock's `#554B46`. Recorded as a deviation, not silently fixed.

## D5 — Layout geometry (mock is 2560×1600 @2x → 1280×800 logical)

Measured by color-transition scans on D1L, converted to logical px:

- Left column: content inset 96 from window left; right action panel occupies the
  final 512 px behind a 1 px divider at x ≈ 765.
- Brand row: indented 14 px beyond the column inset (logo ink x = 110 vs
  tagline/cards at 96); mark ≈ 59 px tall at y ≈ 107; wordmark cap height
  ≈ 30.5 px, which is a ~42 px em size for the system font.
- Tagline: ≈ 26 px, muted, at y ≈ 226.
- Card grid: origin y = 300; card 204 × 140; column gap 14, row gap 16
  (3 × 204 + 2 × 14 = 640 ends flush at x = 736).
- Card interior: padding ≈ 15–16; numeral ≈ 12 px; title ≈ 16 px semibold;
  body ≈ 13 px on a relaxed line height.
- Action panel: content inset ≈ 84; capsule buttons 345 wide — primary 52
  tall, secondary 48 (both mocks); 24 px gap between them (both mocks;
  an earlier 42 px reading mistook the secondary's inner text scan for its
  top edge — the review's full-bounding-box scan settled it). The dark mock's
  divider + link block was cut at user direction (→ DV-002).

The implementation uses these as the 4 px-grid-aligned constants 96/512/204/140/
16/14/52 etc., with the left column flexing on resize and the panel fixed-width.

## D6 — i18n integration shape

**Decision**: desktop depends on `vela-core` with feature `i18n-all`; a thin
`Loc` wrapper owns one `I18n`, resolves the launch language from
`VELA_LANG` → `LC_ALL` → `LC_MESSAGES` → `LANG`, loads the matching embedded
catalog (`Catalog::embedded`), and exposes `t(key)` returning `SharedString`.

**Rationale**: spec 004 sized compiled-in catalogs at ~1.3 MB total — irrelevant
on desktop, and the only shape with zero I/O and zero failure paths at startup.
Per-call `Options` stay default (no counts/vars on this screen). Key misses echo
the key by i18next contract, which SC-004 turns into a visible failure.

**New corpus keys** (13, under `onboarding.welcome.`): `desktopTagline` and
`feature{NoMnemonic,OneAddress,OpenSource,KeyCustody,SafeContract,StablecoinGas}{Title,Body}`.
The existing mobile `tagline` keeps its two-line copy; the
desktop mock shows a one-line variant, hence a separate key rather than a
platform-conditional render of a string that means something else.

**Terminology note**: en/zh name the credential store "Apple Passwords" /
"Apple 密码" (the mock's wording); de/fr/it/pt-BR/ru/ja/ko keep their locale
file's established "iCloud Keychain" name (`create.ack0` precedent). Both name
the same store; per-locale consistency wins over source-string literalism.

**Corpus mechanics** (verified by reading `scripts/gen-i18n.mjs`): source of
truth is `rust/crates/vela-core/i18n/locales/<lng>/onboarding.json` × 15; the
generator asserts identical key sets across locales, regenerates the shared path
table (`paths.rs`, count grows 1205 → 1218), all 15 value blobs, `resources.ts`
and `public/i18n/*.json`. Generated files are never hand-edited (SC-003 pins
this with a regenerate-then-diff check).

## D7 — Theme switching mechanics

**Decision**: read `window.appearance()` at view construction, re-read inside
`Window::observe_window_appearance` (verified present at
`crates/gpui/src/window.rs:1946`); `VELA_THEME=light|dark` overrides both.

**Rationale**: polling or app-level observers are unnecessary; the window-level
observer is the exact hook, and the env override is what lets SC-002's four
screenshot matrix run from a script without flipping the OS theme.

## D8 — Why not reuse `gpui-demo`'s wallet_desktop theme constants

The demo's palette (`PAPER #FBFAF8`, `T1 #14140F`, `ORANGE #E8532A`…) is close
to but not identical with the mocks (accent differs `#E8532A` vs `#E8572A`), it
is light-only, and it lives as loose module constants — the opposite of FR-002's
single themed token struct. The demo contributes idioms, not values.
