//
//  NetworkFilterPill.swift
//  VelaWallet
//
//  NetworkFilterPill (spec 015 vocabulary #3): all-networks variant with
//  three overlapping chain dots + 全部网络, or single-chain variant with
//  one dot + chain name; both with a disclosure chevron.
//

import SwiftUI

struct NetworkFilterPill: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: NetworkPillModel

    var body: some View {
        HStack(spacing: Tokens.Space.s8) {
            dots
            Text(verbatim: label)
                .typeRole(Typography.label.scaled(textScale))
                .foregroundStyle(theme.fgBase)
                .lineLimit(1)
            Image(systemName: "chevron.down")
                .font(WalletIconFont.smallChevron)
                .foregroundStyle(theme.fgMuted)
        }
        .padding(.horizontal, Tokens.Space.s12)
        .frame(minHeight: WalletGeometry.pillHeight)
        .background(Capsule().fill(theme.bgRaised))
    }

    private var label: String {
        switch model {
        case .all(_, let label), .single(_, let label): label
        }
    }

    @ViewBuilder private var dots: some View {
        switch model {
        case .all(let colors, _):
            HStack(spacing: -WalletGeometry.pillDotOverlap) {
                ForEach(Array(colors.enumerated()), id: \.offset) { _, color in
                    Circle()
                        .fill(color)
                        .overlay(Circle().strokeBorder(theme.bgRaised, lineWidth: Tokens.BorderWidth.hairline))
                        .frame(width: WalletGeometry.pillDot, height: WalletGeometry.pillDot)
                }
            }
        case .single(let dot, _):
            Circle()
                .fill(dot)
                .frame(width: WalletGeometry.pillDot, height: WalletGeometry.pillDot)
        }
    }
}

#Preview("Pill variants") {
    VStack(spacing: Tokens.Space.s16) {
        NetworkFilterPill(model: .all(dots: ChainPalette.pillDots, label: "全部网络"))
        NetworkFilterPill(model: .single(dot: ChainPalette.bnb, label: "BNB Chain"))
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}

#Preview("Pill light") {
    NetworkFilterPill(model: .all(dots: ChainPalette.pillDots, label: "All networks"))
        .padding(Tokens.Space.s24)
        .themed(.light)
}
