//
//  BrandRow.swift
//  VelaWallet
//
//  Mark + wordmark on one row (founder direction 2026-08-01, spec 006/007).
//  "Vela Wallet" is a proper name — rendered verbatim, never translated.
//

import SwiftUI

struct BrandRow: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WelcomeGeometry.markWordmarkGap) {
            VelaMark()
            Text(verbatim: "Vela Wallet")
                .typeRole(Typography.display)
                .foregroundStyle(theme.fgBase)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "Vela Wallet"))
    }
}

#Preview("BrandRow", traits: .sizeThatFitsLayout) {
    VStack(spacing: 24) {
        BrandRow().themed(.light)
        BrandRow().padding().background(Color.black).themed(.dark)
    }
    .padding()
}
