//
//  Theme.swift
//  VelaWallet
//
//  Semantic palette resolution + welcome-screen geometry. The only
//  hand-written file allowed to compose token values (Tokens.swift is
//  generated; nothing outside DesignSystem/ may name a visual value).
//

import SwiftUI

/// The active design-system theme: exactly one semantic color set
/// (`color-light` or `color-dark`) plus the mode-invariant core scales.
struct Theme {
    let palette: TokenPalette
    let scheme: ColorScheme

    init(scheme: ColorScheme) {
        self.scheme = scheme
        self.palette = scheme == .dark ? Tokens.dark : Tokens.light
    }

    // MARK: Semantic colors (SwiftUI)

    var bgBase: Color { palette.bgBase.color }
    var bgRaised: Color { palette.bgRaised.color }
    var bgSunken: Color { palette.bgSunken.color }
    var fgBase: Color { palette.fgBase.color }
    var fgMuted: Color { palette.fgMuted.color }
    var fgSubtle: Color { palette.fgSubtle.color }
    var accentBase: Color { palette.accentBase.color }
    var accentSoft: Color { palette.accentSoft.color }
    var borderBase: Color { palette.borderBase.color }
    var borderStrong: Color { palette.borderStrong.color }
    var onAccent: Color { palette.onAccent.color }

    /// Brand mark hull — themed per design-system.md brand rules
    /// (Warm Graphite in light UI, Dusk Ivory in dark UI); sails constant.
    var markHull: Color { scheme == .dark ? Brand.hullDark.color : Brand.hullLight.color }

    // MARK: Status colors (spec 014 outcome badges / diagnostics)

    var successBase: Color { palette.successBase.color }
    var successSoft: Color { palette.successSoft.color }
    var warningBase: Color { palette.warningBase.color }
    var warningSoft: Color { palette.warningSoft.color }
    var errorBase: Color { palette.errorBase.color }
    var errorSoft: Color { palette.errorSoft.color }
    var infoBase: Color { palette.infoBase.color }
    var infoSoft: Color { palette.infoSoft.color }
}

/// Brand constants from design-system.md's brand section (mode-dependent by
/// rule, not part of the Penpot color sets — see spec 007 logo tokens).
enum Brand {
    static let sailMain = TokenColor(argb: 0xFF_FF6A45)
    static let sailSecondary = TokenColor(argb: 0xFF_FFA98E)
    static let hullLight = TokenColor(argb: 0xFF_554B46)
    static let hullDark = TokenColor(argb: 0xFF_DED5CE)
}

/// Welcome-screen geometry the token set does not name, measured from
/// `design/onboarding/W1 Welcome _ default.png` at the 390×844 design frame
/// (@2x pixels ÷ 2). Licensed by design-system.md ("if a needed token doesn't
/// exist… propose a semantic name") — kept here, never inline in views.
enum WelcomeGeometry {
    /// Brand mark glyph size in the brand row (mock: 74 px @2x).
    static let markSize: CGFloat = 37
    /// Gap between mark and wordmark (mock ≈ 22 px @2x → space grid 12).
    static let markWordmarkGap: CGFloat = Tokens.Space.s12
    /// Brand row → tagline gap. Was s48; matched to Android's `xl4` (32) —
    /// the founder's reference for how this screen should feel.
    static let brandTaglineGap: CGFloat = Tokens.Space.s32
    /// Feature-card inner padding (mock ≈ 19 pt → space.s20).
    static let cardPadding: CGFloat = Tokens.Space.s20
    /// Card numeral → title gap / title → body gap (space.s8).
    static let cardInnerGap: CGFloat = Tokens.Space.s8
    /// Card → pager dots gap. Was s12; Android uses `md` (8).
    static let cardDotsGap: CGFloat = Tokens.Space.s8
    /// Dots → primary CTA gap. Was s24; Android uses `lg` (12).
    static let dotsCtaGap: CGFloat = Tokens.Space.s12
    /// Primary → secondary CTA gap. Was s12; Android uses `xl` (16).
    static let ctaGap: CGFloat = Tokens.Space.s16
    /// Pager dot diameter (mock 12 px @2x).
    static let dotSize: CGFloat = 6
    /// Active dot pill width (mock ≈ 28 px @2x).
    static let dotActiveWidth: CGFloat = 14
    /// Edge-to-edge dot gap. Was 8 pt "for touch comfort" — but touch comfort is
    /// the ROW's job (see `dotRowHeight` and PagerDots), not the gap's, and
    /// inflating it made the dots read as six scattered specks rather than one
    /// indicator. Matched to Android's 4 dp, which the founder called out as the
    /// one that looks right.
    static let dotGap: CGFloat = Tokens.Space.s4
    /// The pager row is the tap target: one 44 pt band, taps mapped to the
    /// nearest dot by x. Keeps the dots at their true pitch.
    static let dotRowHeight: CGFloat = 44
    /// The two big vertical gaps are FRACTIONS OF THE HERO REGION, not fixed
    /// points — this is the thing that makes Android's version breathe on every
    /// screen size while a fixed `Spacer(minLength: 32)` left iOS cramped on a
    /// tall phone and loose on a short one. Ported verbatim from
    /// `WelcomeScreen.kt` (`region * 0.20f`, `region * 0.12f`), where `region`
    /// is the height left over after the pinned CTA block.
    static let heroTopFraction: CGFloat = 0.20
    static let taglineCarouselFraction: CGFloat = 0.12

    /// Minimum height of the card band (mock card ≈ 134 pt, zh 2-line copy);
    /// the band grows to the tallest card of the active locale.
    static let cardBandMinHeight: CGFloat = 134
}

/// Onboarding-flow (create/login sheet) geometry the token set does not
/// name, measured from `design/onboarding/create|login/*.png` at the
/// 390×844 design frame (spec 014). Same design-system.md license as
/// `WelcomeGeometry` — values live here, never inline in views.
enum FlowGeometry {
    /// Outcome status-badge circle (mock ≈ 112 px @2x).
    static let badgeSize: CGFloat = 56
    /// SF Symbol point size inside the badge circle.
    static let badgeGlyphSize: CGFloat = 24
    /// Elapsed-seconds ring outer size (mock ≈ 80 px @2x).
    static let ringSize: CGFloat = 40
    /// Ring stroke width.
    static let ringLineWidth: CGFloat = 3
    /// Frozen sweep fraction of the ring arc (mock shows an open arc;
    /// no elapsed-time measurement is wired in this feature — FR-011).
    static let ringSweep: CGFloat = 0.72
    /// Arc start angle: 12 o'clock.
    static let ringStartDegrees: CGFloat = -90
    /// Progress bar height (stepped segments and the login single track).
    static let barHeight: CGFloat = 4
    /// Gap between step segments (space.s8).
    static let barGap: CGFloat = Tokens.Space.s8
    /// Login waiting bar fill fraction (mock ≈ 40%).
    static let loginBarFill: CGFloat = 0.4
    /// Acknowledgment checkbox square (mock ≈ 40 px @2x).
    static let checkboxSize: CGFloat = 20
    /// Check glyph point size inside the checkbox.
    static let checkboxGlyphSize: CGFloat = 12
    /// Small control glyphs: close ×, disclosure chevron, copy icon.
    static let controlGlyphSize: CGFloat = 16
    /// Account-name field height (sizing control.lg).
    static let fieldHeight: CGFloat = Tokens.Control.lg
    /// Secondary action-row height (matches the primary CTA control.lg).
    static let actionRowHeight: CGFloat = Tokens.Control.lg
    /// Vertical gap between stacked actions (mock ≈ 24 px @2x).
    static let actionGap: CGFloat = Tokens.Space.s12
}

/// SF Symbols are sized through a font; this is the sanctioned wrapper for
/// the flow glyphs so no view outside DesignSystem/ calls `Font.system`
/// (audit-literals). Text NEVER uses these — text goes through Typography.
enum GlyphFont {
    /// Badge glyph (✓ / ! / × / clock) inside the 56 pt circle.
    static let badge: Font = .system(size: FlowGeometry.badgeGlyphSize, weight: .semibold)
    /// Close ×, disclosure chevron, address-copy icon.
    static let control: Font = .system(size: FlowGeometry.controlGlyphSize, weight: .medium)
    /// Ack checkbox check mark.
    static let checkbox: Font = .system(size: FlowGeometry.checkboxGlyphSize, weight: .bold)
}

// MARK: - Environment plumbing

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme(scheme: .light)
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

extension View {
    /// Injects the theme resolved from the current color scheme.
    func themed(_ scheme: ColorScheme) -> some View {
        environment(\.theme, Theme(scheme: scheme))
    }
}
