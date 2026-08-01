//
//  ContrastTests.swift
//  VelaWalletTests
//
//  SC-005: WCAG contrast computed from the generated token values, both
//  themes. Floors: 4.5:1 for body pairs; 3.0:1 for the DV-004 accent pair
//  and the fg.subtle numeral (decorative-adjacent, 007 precedent).
//

import Foundation
import Testing
@testable import VelaWallet

@MainActor
struct ContrastTests {
    private func luminance(_ c: TokenColor) -> Double {
        func channel(_ v: Double) -> Double {
            v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(c.red) + 0.7152 * channel(c.green) + 0.0722 * channel(c.blue)
    }

    private func ratio(_ a: TokenColor, _ b: TokenColor) -> Double {
        let la = luminance(a), lb = luminance(b)
        let (hi, lo) = (max(la, lb), min(la, lb))
        return (hi + 0.05) / (lo + 0.05)
    }

    private struct Pair {
        let name: String
        let fg: TokenColor
        let bg: TokenColor
        let floor: Double
    }

    private func pairs(_ p: TokenPalette, mode: String) -> [Pair] {
        [
            Pair(name: "\(mode) fgBase/bgBase", fg: p.fgBase, bg: p.bgBase, floor: 4.5),
            Pair(name: "\(mode) fgMuted/bgBase (tagline)", fg: p.fgMuted, bg: p.bgBase, floor: 4.5),
            Pair(name: "\(mode) fgMuted/bgRaised (card body)", fg: p.fgMuted, bg: p.bgRaised, floor: 4.5),
            Pair(name: "\(mode) fgBase/bgRaised (card title, DV-001 secondary label)", fg: p.fgBase, bg: p.bgRaised, floor: 4.5),
            Pair(name: "\(mode) fgSubtle/bgRaised (numeral)", fg: p.fgSubtle, bg: p.bgRaised, floor: 3.0),
            Pair(name: "\(mode) onAccent/accentBase (DV-004 primary CTA)", fg: p.onAccent, bg: p.accentBase, floor: 3.0),
        ]
    }

    @Test func lightPaletteMeetsFloors() {
        for pair in pairs(Tokens.light, mode: "light") {
            #expect(ratio(pair.fg, pair.bg) >= pair.floor,
                    "\(pair.name) = \(ratio(pair.fg, pair.bg))")
        }
    }

    @Test func darkPaletteMeetsFloors() {
        for pair in pairs(Tokens.dark, mode: "dark") {
            #expect(ratio(pair.fg, pair.bg) >= pair.floor,
                    "\(pair.name) = \(ratio(pair.fg, pair.bg))")
        }
    }
}
