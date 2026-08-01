//! Design tokens for the desktop app — the only module allowed to name a color
//! or a layout magic number (spec 007 FR-002).
//!
//! Palette values are sampled from the D1/D1L mocks by region-dominant-color
//! clustering (specs/007-desktop-onboarding-gpui/research.md D3); geometry from
//! the same mocks at their 1280×800 logical size (D5).

use gpui::{px, rgb, Hsla, Pixels, Window};

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
                gpui::WindowAppearance::Light | gpui::WindowAppearance::VibrantLight => {
                    Self::Light
                }
            },
        }
    }

    /// Whether `VELA_THEME` pins the mode (appearance changes are then ignored).
    pub fn is_pinned() -> bool {
        matches!(std::env::var("VELA_THEME").as_deref(), Ok("light") | Ok("dark"))
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
                ("fg_inverse/accent_active", t.fg_inverse, t.accent_active, 3.0),
            ];
            for (pair, fg, bg, floor) in body {
                let ratio = contrast(fg, bg);
                assert!(
                    ratio >= floor,
                    "{name} {pair}: {ratio:.2} < {floor}"
                );
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
}
