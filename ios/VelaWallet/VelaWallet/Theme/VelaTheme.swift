import SwiftUI

// MARK: - Colors

enum VelaColor {
    static let bg = Color(hex: 0xFAFAF8)
    static let bgCard = Color.white
    static let bgWarm = Color(hex: 0xF5F3EF)

    static let textPrimary = Color(hex: 0x1A1A18)
    static let textSecondary = Color(hex: 0x7A776E)
    static let textTertiary = Color(hex: 0xB0ADA5)

    static let accent = Color(hex: 0xE8572A)
    static let accentSoft = Color(hex: 0xFFF0EB)

    static let green = Color(hex: 0x2D8E5F)
    static let greenSoft = Color(hex: 0xEDFAF2)

    static let blue = Color(hex: 0x4267F4)
    static let blueSoft = Color(hex: 0xEDF0FF)

    static let border = Color(hex: 0xECEAE4)

    // Token icon backgrounds
    static let ethBg = Color(hex: 0xEEF0F8)
    static let usdcBg = Color(hex: 0xEDF7F0)
    static let daiBg = Color(hex: 0xFFF8E7)

    // Network icon backgrounds
    static let arbBg = Color(hex: 0xE8F4FD)
    static let baseBg = Color(hex: 0xE8EEFF)
    static let opBg = Color(hex: 0xFFECEC)
}

// MARK: - Typography

enum VelaFont {
    static func heading(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .default)
    }

    static func title(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .default)
    }

    static func body(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .default)
    }

    static func label(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .default)
    }

    static func mono(_ size: CGFloat) -> Font {
        .system(size: size, weight: .medium, design: .monospaced)
    }

    static func caption() -> Font {
        .system(size: 12, weight: .medium, design: .default)
    }
}

// MARK: - Spacing & Radius

enum VelaRadius {
    static let card: CGFloat = 16
    static let cardSmall: CGFloat = 10
    static let full: CGFloat = 9999
    static let button: CGFloat = 16
}

enum VelaSpacing {
    static let screenH: CGFloat = 24
    static let cardPadding: CGFloat = 20
    static let itemGap: CGFloat = 14
}

// MARK: - Color Extension

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - View Modifiers

struct VelaCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(VelaColor.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.card)
                    .stroke(VelaColor.border, lineWidth: 1)
            )
    }
}

struct VelaPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VelaFont.label(16))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(VelaColor.textPrimary)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.button))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

struct VelaSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VelaFont.label(16))
            .foregroundStyle(VelaColor.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(.clear)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.button))
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.button)
                    .stroke(VelaColor.border, lineWidth: 1.5)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct VelaAccentButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VelaFont.label(16))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(VelaColor.accent)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.button))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

extension View {
    func velaCard() -> some View {
        modifier(VelaCardModifier())
    }
}
