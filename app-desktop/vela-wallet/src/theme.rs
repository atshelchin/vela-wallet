//! Design tokens for the desktop app — the only module allowed to name a color
//! or a layout magic number (spec 007 FR-002).
//!
//! Palette values are sampled from the D1/D1L mocks by region-dominant-color
//! clustering (specs/007-desktop-onboarding-gpui/research.md D3); geometry from
//! the same mocks at their 1280×800 logical size (D5).

use gpui::{Hsla, Pixels, Window, px, rgb};

/// Which palette is active. Follows the OS appearance unless `VELA_THEME`
/// pins it (the hook SC-002's screenshot matrix drives).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ThemeMode {
    Light,
    Dark,
}

impl ThemeMode {
    /// `VELA_THEME` override, else the window's current system appearance.
    pub fn detect(window: &Window) -> Self {
        match std::env::var("VELA_THEME").as_deref() {
            Ok("light") => Self::Light,
            Ok("dark") => Self::Dark,
            _ => match window.appearance() {
                gpui::WindowAppearance::Dark | gpui::WindowAppearance::VibrantDark => Self::Dark,
                gpui::WindowAppearance::Light | gpui::WindowAppearance::VibrantLight => Self::Light,
            },
        }
    }

    /// Whether `VELA_THEME` pins the mode (appearance changes are then ignored).
    pub fn is_pinned() -> bool {
        matches!(
            std::env::var("VELA_THEME").as_deref(),
            Ok("light") | Ok("dark")
        )
    }
}

/// Semantic color tokens. Components read these; nobody reads hex.
pub struct Theme {
    // backgrounds
    pub bg_base: Hsla,
    pub bg_raised: Hsla,
    pub bg_sunken: Hsla,
    // foreground ladder
    pub fg_base: Hsla,
    pub fg_muted: Hsla,
    pub fg_subtle: Hsla,
    pub fg_inverse: Hsla,
    // brand accent + interaction states
    pub accent: Hsla,
    pub accent_hover: Hsla,
    pub accent_active: Hsla,
    // structure
    pub border_card: Hsla,
    pub outline_strong: Hsla,
    pub divider: Hsla,
    /// The 1 px edge between content column and action panel.
    /// Dark mock draws none — the bg step is the separation — so dark uses
    /// `bg_raised` (painted but invisible), keeping one code path.
    pub panel_edge: Hsla,
    // logo (sails identical in both modes; hull themes — research D2)
    pub logo_sail_a: Hsla,
    pub logo_sail_b: Hsla,
    pub logo_hull: Hsla,
    // status colors (spec 015 wallet home; values from docs/design-tokens.json,
    // the same export the mobile/web token layers mirror)
    pub success: Hsla,
    pub warning: Hsla,
    pub warning_soft: Hsla,
    pub warning_border: Hsla,
}

fn c(hex: u32) -> Hsla {
    rgb(hex).into()
}

impl Theme {
    pub fn of(mode: ThemeMode) -> Self {
        match mode {
            ThemeMode::Light => Self::light(),
            ThemeMode::Dark => Self::dark(),
        }
    }

    pub fn light() -> Self {
        Self {
            bg_base: c(0xfafaf8),
            bg_raised: c(0xffffff),
            bg_sunken: c(0xf5f3ef),
            fg_base: c(0x1a1a18),
            fg_muted: c(0x6e6b62),
            fg_subtle: c(0x8c887e),
            fg_inverse: c(0xffffff),
            accent: c(0xe8572a),
            accent_hover: c(0xd14a20),
            accent_active: c(0xbf421c),
            border_card: c(0xecebe4),
            outline_strong: c(0x554b46),
            divider: c(0xecebe4),
            panel_edge: c(0xecebe4),
            logo_sail_a: c(0xff6a45),
            logo_sail_b: c(0xffa98e),
            logo_hull: c(0x554b46),
            success: c(0x2d8e5f),
            warning: c(0x92600a),
            warning_soft: c(0xfff8f0),
            warning_border: c(0xf0dcc8),
        }
    }

    pub fn dark() -> Self {
        Self {
            bg_base: c(0x141412),
            bg_raised: c(0x1e1e1b),
            bg_sunken: c(0x262622),
            fg_base: c(0xe8e6e1),
            fg_muted: c(0x9a9790),
            fg_subtle: c(0x85827a),
            fg_inverse: c(0xffffff),
            accent: c(0xe8572a),
            accent_hover: c(0xf26a40),
            accent_active: c(0xd44d22),
            border_card: c(0x1e1e1b), // no visible card border in the dark mock
            outline_strong: c(0x554b46),
            divider: c(0x2c2c28),
            panel_edge: c(0x1e1e1b),
            logo_sail_a: c(0xff6a45),
            logo_sail_b: c(0xffa98e),
            logo_hull: c(0xded5ce),
            success: c(0x3da872),
            warning: c(0xd4a54a),
            warning_soft: c(0x2a2010),
            warning_border: c(0x3d3020),
        }
    }
}

// ---------------------------------------------------------------------------
// Layout + type scale (mock-measured, research.md D5). 4 px grid except where
// the mock explicitly says otherwise (card column gap = 14).
// ---------------------------------------------------------------------------

/// Design window size; also the minimum — the card grid does not reflow below it.
pub const WINDOW_W: f32 = 1280.;
pub const WINDOW_H: f32 = 800.;

/// Left content column inset from the window edge.
pub const CONTENT_INSET: f32 = 96.;
/// Right inset of the left column (content → panel edge). Sized so the card
/// grid lands exactly on the mock at the 1280 design width: 96 + 3×204 + 2×14
/// + 32 = 768 = window − panel.
pub const CONTENT_INSET_RIGHT: f32 = 32.;
/// Fixed width of the right action panel.
pub const PANEL_W: f32 = 512.;
/// Horizontal inset of the action panel's content.
pub const PANEL_INSET: f32 = 84.;

/// Top of the brand row, then the two vertical gaps of the left column rhythm.
pub const BRAND_TOP: f32 = 104.;
pub const GAP_BRAND_TAGLINE: f32 = 56.;
pub const GAP_TAGLINE_GRID: f32 = 40.;

/// The mocks indent the brand row 14 px beyond the column inset
/// (logo ink at x = 110, tagline/cards at 96 — review measurement).
pub const BRAND_INDENT: f32 = 14.;
pub const LOGO_SIZE: f32 = 60.;
pub const GAP_LOGO_WORDMARK: f32 = 34.;

// ---------------------------------------------------------------------------
// Wallet home (spec 015). Geometry measured on the D1–D3 mocks at their
// 1280×800 logical size.
// ---------------------------------------------------------------------------

/// Fixed sidebar width (column 1).
pub const SIDEBAR_W: f32 = 240.;
/// Fixed third-column width (column 3 — the desktop bottom-sheet stand-in).
pub const THIRD_PANEL_W: f32 = 400.;
/// Inner padding of the sidebar.
pub const SIDEBAR_PAD: f32 = 16.;
/// Top padding of the sidebar header — clears the macOS traffic lights.
pub const SIDEBAR_TOP: f32 = 36.;
/// Content column padding.
pub const WALLET_PAD_X: f32 = 24.;
pub const WALLET_PAD_TOP: f32 = 28.;
/// Row heights / avatar sizes.
pub const WALLET_AVATAR: f32 = 40.;
pub const WALLET_ROW_ICON: f32 = 40.;
pub const WALLET_BADGE: f32 = 12.;
pub const WALLET_NAV_ROW_H: f32 = 40.;
pub const WALLET_CONTROL_H: f32 = 44.;

/// Wallet type scale (mock-measured).
pub fn text_balance_hero() -> Pixels {
    px(40.)
}
pub fn text_balance_decimals() -> Pixels {
    px(24.)
}
pub fn text_row_title() -> Pixels {
    px(15.)
}
pub fn text_row_sub() -> Pixels {
    px(13.)
}
pub fn text_section() -> Pixels {
    px(17.)
}
pub fn text_label() -> Pixels {
    px(11.)
}
pub fn text_amount() -> Pixels {
    px(15.)
}
pub fn text_unit() -> Pixels {
    px(11.)
}
pub fn text_panel_title() -> Pixels {
    px(20.)
}
pub fn text_mono_address() -> Pixels {
    px(13.)
}

/// Monospace family for addresses. Menlo ships on macOS; the DejaVu face is
/// the broadly-present fallback on the Linux CI/dev images this app targets.
pub fn font_mono() -> &'static str {
    if cfg!(target_os = "macos") {
        "Menlo"
    } else {
        "DejaVu Sans Mono"
    }
}

// ---------------------------------------------------------------------------
// Launch animation (spec 012). Every value here is shared verbatim with the
// iOS, Android and web apps — see specs/012-launch-animation-lottie/data-model.md
// §4. A transcription error in any one of the four languages is caught by the
// fit-rule test at the bottom of this file, which asserts research D1's table.
// ---------------------------------------------------------------------------

/// Authored length of the animation: 102 frames ÷ 60 fps.
///
/// Desktop reads the real duration off the player rather than trusting this, so
/// production never consumes it — but it is the value the other three apps
/// budget against, and `embedded_assets_load_and_carry_the_authored_timeline`
/// asserts the player agrees with it. Deleting it would remove the only place
/// the four platforms' shared assumption is checked against the actual asset.
#[allow(dead_code, reason = "cross-platform contract, asserted by tests")]
pub const LAUNCH_DURATION_MS: u64 = 1700;
/// How long the finished lockup is held before the hand-off, so the brand
/// registers instead of flashing past (founder direction, 2026-08-05 desktop
/// review; first tried at 2000 ms and cut to 400 on seeing it — long enough to
/// read as a beat, short enough not to feel like waiting).
///
/// This is the one place the feature deliberately spends the user's time. A tap,
/// click or key press skips it, and reduce-motion bypasses it entirely.
pub const LAUNCH_HOLD_MS: u64 = 400;

/// Cross-dissolve between the launch screen and Welcome. `motion.durationSlow` /
/// `motion.entranceFadeUp` — 180 ms (`sheetOut`) was tried first and reads as a
/// cut rather than a dissolve at this scale.
pub const LAUNCH_EXIT_CROSSFADE_MS: u64 = 400;
/// FR-014: nothing presented by now → abandon the animation, show Welcome.
pub const LAUNCH_FIRST_FRAME_BUDGET_MS: u64 = 400;
/// FR-015: measured from the first presented frame, not from construction.
/// Nominal is 1700 play + 400 hold + 400 dissolve = 2500; the rest is slack for
/// a slow machine.
pub const LAUNCH_HARD_CEILING_MS: u64 = 3000;

/// The large-screen composition's core canvas, 680 × 220 (research D1).
pub const LAUNCH_CANVAS_W: f32 = 680.;
pub const LAUNCH_CANVAS_H: f32 = 220.;

/// Box width as a fraction of viewport width — the core canvas divided by the
/// full-bleed canvas it was cropped from (680/1920). NOT a judgement call: at
/// 1920 px this renders the lockup at exactly the authored 29.5 % of screen
/// width, and `scripts/lint-lottie-assets.mjs` fails if a re-crop moves it.
pub const LAUNCH_BOX_W_RATIO: f32 = 680. / 1920.;

/// The desktop window minimum is 1280 × 800, so the form-factor predicate
/// (`width >= height || width >= 768`) is unconditionally large-screen here —
/// which is why production never evaluates it. Kept, and exercised by
/// `desktop_window_is_always_the_large_screen_form_factor`, because it is the
/// same threshold the other three apps branch on: if it ever changes, this is
/// where desktop finds out that its "always large-screen" shortcut still holds.
#[allow(dead_code, reason = "shared threshold, asserted by tests")]
pub const LAUNCH_LARGE_SCREEN_MIN_W: f32 = 768.;

/// Deterministic disable for tests and screenshots (FR-029).
///
/// Existing tests must not sit through the animation, and a sleep long enough
/// to outlast it is exactly the flaky waiting this replaces. Same shape as the
/// `VELA_THEME` override this app already has.
pub fn launch_disabled() -> bool {
    std::env::var("VELA_SKIP_LAUNCH_ANIMATION").as_deref() == Ok("1")
}

/// Box size for a viewport, per the shared fit rule. Centred by the caller;
/// nothing is clipped or clamped, because the shipped asset is cropped to the
/// motion — the box *is* the artwork.
pub fn launch_box(viewport_w: f32) -> (f32, f32) {
    let w = viewport_w * LAUNCH_BOX_W_RATIO;
    (w, w * LAUNCH_CANVAS_H / LAUNCH_CANVAS_W)
}

/// At the 1280 design size the flex math lands each card at the mock's 204 px;
/// cards share the left column equally, so a wider window widens all three.
pub const CARD_MIN_H: f32 = 140.;
pub const CARD_GAP_X: f32 = 14.;
pub const CARD_GAP_Y: f32 = 16.;
pub const CARD_PAD: f32 = 16.;
/// Card interior rhythm: numeral → title → body (mock-measured; the 6 is off
/// the 4 px grid the same way the 14 px column gap is).
pub const CARD_GAP_NUMERAL_TITLE: f32 = 8.;
pub const CARD_GAP_TITLE_BODY: f32 = 6.;
pub const RADIUS_CARD: f32 = 16.;

/// The mocks size the two capsules differently: primary 52, secondary 48
/// (both mocks, review-verified to the pixel).
pub const BTN_H_PRIMARY: f32 = 52.;
pub const BTN_H_SECONDARY: f32 = 48.;
/// Vertical gap between the two CTAs (24/25 in the mocks, review-measured).
pub const GAP_BUTTONS: f32 = 24.;

/// The mock wordmark's cap height is ~30.5 px, which for the system font is a
/// ~42 px em size (review-verified; a 30 px em renders ~30% small).
pub fn text_brand() -> Pixels {
    px(42.)
}
pub fn text_tagline() -> Pixels {
    px(26.)
}
pub fn text_card_title() -> Pixels {
    px(16.)
}
pub fn text_body() -> Pixels {
    px(13.)
}
pub fn text_numeral() -> Pixels {
    px(12.)
}
pub fn text_button() -> Pixels {
    px(16.)
}
/// Relaxed body line height (~1.55 at 13 px).
pub fn line_height_body() -> Pixels {
    px(20.)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// WCAG 2.x relative luminance of an `Hsla` token.
    fn luminance(color: Hsla) -> f32 {
        let rgba = color.to_rgb();
        let lin = |c: f32| {
            if c <= 0.04045 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * lin(rgba.r) + 0.7152 * lin(rgba.g) + 0.0722 * lin(rgba.b)
    }

    fn contrast(a: Hsla, b: Hsla) -> f32 {
        let (la, lb) = (luminance(a), luminance(b));
        let (hi, lo) = if la > lb { (la, lb) } else { (lb, la) };
        (hi + 0.05) / (lo + 0.05)
    }

    /// SC-005: every text/background pair on the welcome screen, both themes.
    #[test]
    fn contrast_floor_holds_in_both_themes() {
        for (name, t) in [("light", Theme::light()), ("dark", Theme::dark())] {
            let body = [
                ("fg_base/bg_base", t.fg_base, t.bg_base, 4.5),
                ("fg_muted/bg_base", t.fg_muted, t.bg_base, 4.5),
                ("fg_muted/bg_raised", t.fg_muted, t.bg_raised, 4.5),
                // secondary CTA label — DV-001 is what makes dark pass
                ("fg_base/bg_raised", t.fg_base, t.bg_raised, 4.5),
                // 12 px numeral: decorative-adjacent, 3:1 floor
                ("fg_subtle/bg_raised", t.fg_subtle, t.bg_raised, 3.0),
                // primary CTA label: 16 px semibold on accent, large-text floor
                ("fg_inverse/accent", t.fg_inverse, t.accent, 3.0),
                ("fg_inverse/accent_hover", t.fg_inverse, t.accent_hover, 3.0),
                (
                    "fg_inverse/accent_active",
                    t.fg_inverse,
                    t.accent_active,
                    3.0,
                ),
            ];
            for (pair, fg, bg, floor) in body {
                let ratio = contrast(fg, bg);
                assert!(ratio >= floor, "{name} {pair}: {ratio:.2} < {floor}");
            }
        }
    }

    /// The accent is the brand constant and identical across modes (research D3).
    #[test]
    fn accent_is_mode_invariant() {
        assert_eq!(Theme::light().accent, Theme::dark().accent);
        assert_eq!(Theme::light().logo_sail_a, Theme::dark().logo_sail_a);
        assert_eq!(Theme::light().logo_sail_b, Theme::dark().logo_sail_b);
    }

    /// Spec 012 FR-011, research D1's table. The same five viewports are
    /// asserted in Swift, Kotlin and TypeScript; the point of repeating them in
    /// four languages is that a transcription slip in any one shows up here
    /// rather than on a user's screen.
    ///
    /// `LAUNCH_LOCKUP_RATIO` is a property of the shipped asset — the lockup is
    /// 566.73 of the 680-wide core canvas — and is verified against the file
    /// itself by `scripts/lint-lottie-assets.mjs --report`.
    #[test]
    fn launch_box_matches_the_authored_proportions() {
        const LAUNCH_LOCKUP_RATIO: f32 = 566.73 / LAUNCH_CANVAS_W;

        // (viewport width, expected box width, expected lockup width)
        let cases = [
            (768.0_f32, 272.0, 226.692),
            (1280.0, 453.333, 377.82),
            (1440.0, 510.0, 425.047),
            (1920.0, 680.0, 566.73),
            (3440.0, 1218.333, 1015.391),
        ];

        for (viewport, want_box_w, want_lockup) in cases {
            let (box_w, box_h) = launch_box(viewport);
            assert!(
                (box_w - want_box_w).abs() < 0.01,
                "viewport {viewport}: box width {box_w} != {want_box_w}"
            );
            assert!(
                (box_h - box_w * LAUNCH_CANVAS_H / LAUNCH_CANVAS_W).abs() < 0.001,
                "viewport {viewport}: box aspect is not the canvas aspect"
            );
            let lockup = box_w * LAUNCH_LOCKUP_RATIO;
            assert!(
                (lockup - want_lockup).abs() < 0.01,
                "viewport {viewport}: lockup {lockup} != {want_lockup}"
            );
            // The whole point of the rule: the lockup holds the authored share
            // of the viewport at every size, with no clamping at either end.
            assert!(
                (lockup / viewport - 0.2952).abs() < 0.001,
                "viewport {viewport}: lockup is {:.4} of the width, authored is 0.2952",
                lockup / viewport
            );
        }
    }

    /// At the authored 1920 width the box IS the core canvas, 1:1 — which is
    /// what makes `LAUNCH_BOX_W_RATIO` a derivation rather than a taste call.
    #[test]
    fn launch_box_is_one_to_one_at_the_authored_width() {
        let (w, h) = launch_box(1920.);
        assert!(
            (w - LAUNCH_CANVAS_W).abs() < 0.001,
            "box width {w} != {LAUNCH_CANVAS_W}"
        );
        assert!(
            (h - LAUNCH_CANVAS_H).abs() < 0.001,
            "box height {h} != {LAUNCH_CANVAS_H}"
        );
    }

    /// The desktop window can never be narrower than 1280, so the shared
    /// form-factor predicate always resolves to the large-screen composition.
    #[test]
    fn desktop_window_is_always_the_large_screen_form_factor() {
        // The shared predicate, applied to the window's MINIMUM size. Written as
        // a function call rather than a const comparison so it exercises the
        // same expression the other three platforms implement.
        let large = |w: f32, h: f32| w >= h || w >= LAUNCH_LARGE_SCREEN_MIN_W;
        assert!(
            large(WINDOW_W, WINDOW_H),
            "the minimum window must resolve large-screen"
        );
        assert!(
            !large(390., 844.),
            "a phone viewport must NOT resolve large-screen"
        );
        assert!(
            large(768., 1024.),
            "a tablet at the threshold must resolve large-screen"
        );
    }
}
