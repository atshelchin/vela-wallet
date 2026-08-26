//
//  BrandRow.swift
//  VelaWallet
//
//  Mark + wordmark on one row (founder direction 2026-08-01, spec 006/007).
//  "Vela Wallet" is a proper name — rendered verbatim, never translated.
//
//  The v2 treatment (spec 019): the wordmark is a small, heavy, widely tracked
//  LABEL beside a 60pt mark, not the 32pt display title it was when it headed
//  a screen of its own. Uppercase, because the design sets it that way in
//  every locale.
//

import SwiftUI

struct BrandRow: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WelcomeGeometry.markWordmarkGap) {
            VelaMark()
            Text(verbatim: "VELA WALLET")
                .typeRole(Typography.wordmark)
                .tracking(WelcomeGeometry.wordmarkSize * WelcomeGeometry.wordmarkTracking)
                .foregroundStyle(theme.fgBase)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "Vela Wallet"))
    }
}

#Preview("BrandRow", traits: .sizeThatFitsLayout) {
    VStack(spacing: Tokens.Space.s24) {
        BrandRow().themed(.light)
        BrandRow().padding().background(Color.black).themed(.dark)
    }
    .padding()
}
