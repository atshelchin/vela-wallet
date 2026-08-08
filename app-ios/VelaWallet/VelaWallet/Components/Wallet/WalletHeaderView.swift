//
//  WalletHeaderView.swift
//  VelaWallet
//
//  WalletHeader (spec 015 vocabulary #2): identicon avatar + wallet name
//  (truncates, never wraps) + disclosure chevron + middle-truncated
//  address. On mobile the screen pairs it with a trailing NetworkFilterPill.
//

import SwiftUI

struct WalletHeaderView: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: WalletHeaderModel

    var body: some View {
        HStack(spacing: Tokens.Space.s12) {
            IdenticonAvatar(seed: model.identiconSeed, size: WalletGeometry.avatar)
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                HStack(spacing: Tokens.Space.s4) {
                    Text(verbatim: model.name)
                        .typeRole(Typography.rowTitle.scaled(textScale))
                        .foregroundStyle(theme.fgBase)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Image(systemName: "chevron.down")
                        .font(WalletIconFont.nameChevron)
                        .foregroundStyle(theme.fgMuted)
                }
                Text(verbatim: model.addressDisplay)
                    .monoRole(Typography.monoAddress.scaled(textScale))
                    .foregroundStyle(theme.fgMuted)
                    .lineLimit(1)
            }
        }
    }
}

#Preview("Header light + dark") {
    VStack(spacing: Tokens.Space.s24) {
        WalletHeaderView(model: WalletHeaderModel(
            name: "大表哥", addressDisplay: "0x14fB1f…D1eA5c",
            identiconSeed: "0x14fB1f3a9C8e2D5b7A0f4E6c1B8d3A9e2FD1eA5c"
        ))
        .padding(Tokens.Space.s16)
        .background(Tokens.light.bgBase.color)
        .themed(.light)

        WalletHeaderView(model: WalletHeaderModel(
            name: "这是一个非常长", addressDisplay: "0x14fB1f…D1eA5c",
            identiconSeed: "0x14fB1f3a9C8e2D5b7A0f4E6c1B8d3A9e2FD1eA5c"
        ))
        .padding(Tokens.Space.s16)
        .background(Tokens.dark.bgBase.color)
        .themed(.dark)
    }
    .environment(\.identiconProvider, .previewSafe)
}
