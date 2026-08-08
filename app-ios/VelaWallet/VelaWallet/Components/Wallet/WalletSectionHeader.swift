//
//  WalletSectionHeader.swift
//  VelaWallet
//
//  SectionHeader (spec 015 vocabulary #7): title (活动 / 资产) + trailing
//  text action with chevron (全部 ›).
//

import SwiftUI

struct WalletSectionHeader: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let title: String
    let action: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(verbatim: title)
                .typeRole(Typography.title.scaled(textScale))
                .foregroundStyle(theme.fgBase)
            Spacer(minLength: Tokens.Space.s12)
            HStack(spacing: Tokens.Space.s4) {
                Text(verbatim: action)
                    .typeRole(Typography.label.scaled(textScale))
                    .foregroundStyle(theme.fgMuted)
                Image(systemName: "chevron.right")
                    .font(WalletIconFont.smallChevron)
                    .foregroundStyle(theme.fgMuted)
            }
        }
    }
}

#Preview("Section header") {
    VStack(spacing: Tokens.Space.s24) {
        WalletSectionHeader(title: "活动", action: "全部")
        WalletSectionHeader(title: "资产", action: "全部")
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}
