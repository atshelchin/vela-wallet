//
//  Typography.swift
//  VelaWallet
//
//  Type roles per design-system.md (complete recipes, never ad-hoc font
//  calls). Plus Jakarta Sans is bundled (DesignSystem/Fonts); CJK falls
//  through to the system face — DV-003, matching the shipped RN app.
//

import SwiftUI

/// Bundled Plus Jakarta Sans PostScript names (see DesignSystem/Fonts/).
private enum FontName {
    static let regular = "PlusJakartaSans-Regular"
    static let medium = "PlusJakartaSans-Medium"
    static let semiBold = "PlusJakartaSans-SemiBold"
    static let bold = "PlusJakartaSans-Bold"
}

/// A complete typography role: family/weight/size plus the Dynamic Type
/// style it scales relative to (native OS scaling kept deliberately —
/// founder direction; the app-level text-scale setting is out of scope).
struct TypeRole {
    let fontName: String
    let size: CGFloat
    let relativeTo: Font.TextStyle
    let leading: CGFloat // line-height multiplier from Tokens.Leading

    var font: Font { .custom(fontName, size: size, relativeTo: relativeTo) }
    /// Extra spacing SwiftUI needs to reach the token line height.
    var lineSpacing: CGFloat { size * (leading - 1) }
}

enum Typography {
    /// Wordmark / hero display — text.t32, bold, single-line.
    static let display = TypeRole(fontName: FontName.bold, size: Tokens.TextSize.t32, relativeTo: .largeTitle, leading: Tokens.Leading.none)
    /// Screen tagline — text.t17, regular.
    static let tagline = TypeRole(fontName: FontName.regular, size: Tokens.TextSize.t17, relativeTo: .body, leading: Tokens.Leading.normal)
    /// Card / section title — text.t20, semibold.
    static let title = TypeRole(fontName: FontName.semiBold, size: Tokens.TextSize.t20, relativeTo: .title3, leading: Tokens.Leading.tight)
    /// Body copy — text.t15, regular, reading leading.
    static let body = TypeRole(fontName: FontName.regular, size: Tokens.TextSize.t15, relativeTo: .subheadline, leading: Tokens.Leading.normal)
    /// Small label (card numeral) — text.t13, medium.
    static let label = TypeRole(fontName: FontName.medium, size: Tokens.TextSize.t13, relativeTo: .footnote, leading: Tokens.Leading.tight)
    /// Button label — text.t17, semibold, single-line.
    static let button = TypeRole(fontName: FontName.semiBold, size: Tokens.TextSize.t17, relativeTo: .body, leading: Tokens.Leading.none)

    // MARK: Wallet roles (spec 015 — design/wallet mocks)

    /// Hero balance integer part — text.t40, bold, amount leading.
    static let amountHero = TypeRole(fontName: FontName.bold, size: Tokens.TextSize.t40, relativeTo: .largeTitle, leading: Tokens.Leading.amountHero)
    /// Hero balance decimals — de-emphasised trailing part, text.t26.
    static let amountHeroDecimals = TypeRole(fontName: FontName.bold, size: Tokens.TextSize.t26, relativeTo: .title2, leading: Tokens.Leading.amountHero)
    /// Row title (activity/asset primary line) — text.t17, semibold.
    static let rowTitle = TypeRole(fontName: FontName.semiBold, size: Tokens.TextSize.t17, relativeTo: .body, leading: Tokens.Leading.tight)
    /// Row trailing value (amount/balance) — text.t17, semibold.
    static let rowValue = TypeRole(fontName: FontName.semiBold, size: Tokens.TextSize.t17, relativeTo: .body, leading: Tokens.Leading.tight)
    /// Row subtitle / status line / day label — text.t13, regular.
    static let rowSub = TypeRole(fontName: FontName.regular, size: Tokens.TextSize.t13, relativeTo: .footnote, leading: Tokens.Leading.tight)
    /// Action-card label (收款/转账/扫码) and empty-state title — text.t15, medium.
    static let actionLabel = TypeRole(fontName: FontName.medium, size: Tokens.TextSize.t15, relativeTo: .subheadline, leading: Tokens.Leading.tight)
    /// Empty-state title — text.t15, semibold.
    static let emptyTitle = TypeRole(fontName: FontName.semiBold, size: Tokens.TextSize.t15, relativeTo: .subheadline, leading: Tokens.Leading.tight)
    /// Caption (QR caption, gallery chrome) — text.t11, medium.
    static let caption = TypeRole(fontName: FontName.medium, size: Tokens.TextSize.t11, relativeTo: .caption, leading: Tokens.Leading.tight)
    /// Token-icon 3-letter glyph — text.t11, semibold.
    static let tokenGlyph = TypeRole(fontName: FontName.semiBold, size: Tokens.TextSize.t11, relativeTo: .caption, leading: Tokens.Leading.none)
    /// Tab-bar item label — text.t10, medium, single-line.
    static let tab = TypeRole(fontName: FontName.medium, size: Tokens.TextSize.t10, relativeTo: .caption2, leading: Tokens.Leading.none)

    /// Middle-truncated address — system monospaced, text.t11.
    static let monoAddress = MonoTypeRole(size: Tokens.TextSize.t11, weight: .regular, relativeTo: .caption)
}

/// A monospaced role (addresses, seeds). Uses the system mono face — the
/// bundled Jakarta family has no mono cut; addresses are ASCII-only.
struct MonoTypeRole {
    let size: CGFloat
    let weight: Font.Weight
    let relativeTo: Font.TextStyle
    var font: Font { .system(size: size, weight: weight, design: .monospaced) }
}

extension TypeRole {
    /// FR-011 wallet text scale: the same role at a multiplied point size
    /// (H7x = 1.35×). Line-height multiplier carries over unchanged.
    func scaled(_ factor: CGFloat) -> TypeRole {
        factor == 1 ? self : TypeRole(fontName: fontName, size: size * factor, relativeTo: relativeTo, leading: leading)
    }
}

extension MonoTypeRole {
    func scaled(_ factor: CGFloat) -> MonoTypeRole {
        factor == 1 ? self : MonoTypeRole(size: size * factor, weight: weight, relativeTo: relativeTo)
    }
}

/// The one SF Symbol still in use: the gallery's dev-only theme toggle.
/// Wallet iconography renders through `LucideIcon` (research D2 rev);
/// `LucideIconSize` carries the per-slot point sizes these recipes used to.
enum WalletIconFont {
    static let galleryControl = Font.system(size: 17, weight: .medium)
}

extension Text {
    /// Applies a complete type role (font + line spacing) — the only
    /// sanctioned way to style text outside DesignSystem/.
    func typeRole(_ role: TypeRole) -> some View {
        self.font(role.font).lineSpacing(role.lineSpacing)
    }

    /// Applies a monospaced role (addresses/seeds).
    func monoRole(_ role: MonoTypeRole) -> some View {
        self.font(role.font)
    }
}
