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
}

extension Text {
    /// Applies a complete type role (font + line spacing) — the only
    /// sanctioned way to style text outside DesignSystem/.
    func typeRole(_ role: TypeRole) -> some View {
        self.font(role.font).lineSpacing(role.lineSpacing)
    }
}
