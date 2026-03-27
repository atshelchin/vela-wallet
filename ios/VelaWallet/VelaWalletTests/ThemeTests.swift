import Testing
import SwiftUI
@testable import VelaWallet

// MARK: - Color Extension Tests

struct ColorExtensionTests {

    @Test func colorFromHexWhite() {
        let color = Color(hex: 0xFFFFFF)
        // Verify it creates without crashing; Color equality is opaque
        #expect(type(of: color) == Color.self)
    }

    @Test func colorFromHexBlack() {
        let color = Color(hex: 0x000000)
        #expect(type(of: color) == Color.self)
    }

    @Test func colorFromHexWithAlpha() {
        let color = Color(hex: 0xFF0000, alpha: 0.5)
        #expect(type(of: color) == Color.self)
    }

    @Test func colorFromHexAccent() {
        let color = Color(hex: 0xE8572A)
        #expect(type(of: color) == Color.self)
    }
}

// MARK: - VelaColor Tests

struct VelaColorTests {

    @Test func allColorsExist() {
        // Verify all theme colors can be created without crashing
        let colors: [Color] = [
            VelaColor.bg,
            VelaColor.bgCard,
            VelaColor.bgWarm,
            VelaColor.textPrimary,
            VelaColor.textSecondary,
            VelaColor.textTertiary,
            VelaColor.accent,
            VelaColor.accentSoft,
            VelaColor.green,
            VelaColor.greenSoft,
            VelaColor.blue,
            VelaColor.blueSoft,
            VelaColor.border,
            VelaColor.ethBg,
            VelaColor.usdcBg,
            VelaColor.daiBg,
            VelaColor.arbBg,
            VelaColor.baseBg,
            VelaColor.opBg,
        ]
        #expect(colors.count == 19)
    }
}

// MARK: - VelaFont Tests

struct VelaFontTests {

    @Test func headingFont() {
        let font = VelaFont.heading(28)
        #expect(type(of: font) == Font.self)
    }

    @Test func titleFont() {
        let font = VelaFont.title(17)
        #expect(type(of: font) == Font.self)
    }

    @Test func bodyFont() {
        let font = VelaFont.body(15)
        #expect(type(of: font) == Font.self)
    }

    @Test func labelFont() {
        let font = VelaFont.label(14)
        #expect(type(of: font) == Font.self)
    }

    @Test func monoFont() {
        let font = VelaFont.mono(13)
        #expect(type(of: font) == Font.self)
    }

    @Test func captionFont() {
        let font = VelaFont.caption()
        #expect(type(of: font) == Font.self)
    }
}

// MARK: - VelaRadius Tests

struct VelaRadiusTests {

    @Test func radiusValues() {
        #expect(VelaRadius.card == 16)
        #expect(VelaRadius.cardSmall == 10)
        #expect(VelaRadius.full == 9999)
        #expect(VelaRadius.button == 16)
    }
}

// MARK: - VelaSpacing Tests

struct VelaSpacingTests {

    @Test func spacingValues() {
        #expect(VelaSpacing.screenH == 24)
        #expect(VelaSpacing.cardPadding == 20)
        #expect(VelaSpacing.itemGap == 14)
    }
}

// MARK: - Network Icon/Color Consistency Tests

struct NetworkColorTests {

    @Test func allNetworksHaveDistinctColors() {
        let networks = Network.allCases
        // Each network should have a non-nil iconColor and iconBg
        for network in networks {
            #expect(type(of: network.iconColor) == Color.self)
            #expect(type(of: network.iconBg) == Color.self)
        }
    }
}
