//
//  TokenIconView.swift
//  VelaWallet
//
//  TokenIcon (spec 015 vocabulary #10): circular token glyph rendered as a
//  fixture-supplied ticker lettermark (first three characters) with a
//  bottom-trailing chain-dot badge.
//

import SwiftUI

struct TokenIconView: View {
    @Environment(\.theme) private var theme

    let ticker: String
    let badgeColor: Color

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Circle()
                .fill(theme.bgRaised)
                .frame(width: WalletGeometry.rowIcon, height: WalletGeometry.rowIcon)
                .overlay {
                    Text(verbatim: String(ticker.prefix(3)).uppercased())
                        .typeRole(Typography.tokenGlyph)
                        .foregroundStyle(theme.fgBase)
                }
            ChainBadgeDot(color: badgeColor)
        }
        .accessibilityHidden(true)
    }
}

#Preview("Token icons") {
    HStack(spacing: Tokens.Space.s16) {
        TokenIconView(ticker: "BNB", badgeColor: ChainPalette.bnb)
        TokenIconView(ticker: "ETH", badgeColor: ChainPalette.arbitrum)
        TokenIconView(ticker: "XDAI", badgeColor: ChainPalette.gnosis)
        TokenIconView(ticker: "USDC", badgeColor: ChainPalette.polygon)
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}
