//
//  ActionButtonRow.swift
//  VelaWallet
//
//  ActionButtonRow (spec 015 vocabulary #6): 收款 / 转账 / 扫码 as three
//  equal raised cards, icon above label. Taps are inert in this feature
//  (no destination mocks on mobile — spec assumption).
//

import SwiftUI

struct ActionButtonRow: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: ActionsModel

    var body: some View {
        HStack(spacing: Tokens.Space.s12) {
            card(icon: "arrow.down.left", label: model.receive)
            card(icon: "arrow.up.right", label: model.send)
            card(icon: "qrcode.viewfinder", label: model.scan)
        }
    }

    private func card(icon: String, label: String) -> some View {
        VStack(spacing: Tokens.Space.s8) {
            Image(systemName: icon)
                .font(WalletIconFont.action)
                .foregroundStyle(theme.fgBase)
            Text(verbatim: label)
                .typeRole(Typography.actionLabel.scaled(textScale))
                .foregroundStyle(theme.fgBase)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Tokens.Space.s12)
        .frame(minHeight: WalletGeometry.actionCardHeight)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.r16).fill(theme.bgRaised))
    }
}

#Preview("Actions dark") {
    ActionButtonRow(model: ActionsModel(receive: "收款", send: "转账", scan: "扫码"))
        .padding(Tokens.Space.s24)
        .background(Tokens.dark.bgBase.color)
        .themed(.dark)
}

#Preview("Actions light") {
    ActionButtonRow(model: ActionsModel(receive: "Receive", send: "Send", scan: "Scan"))
        .padding(Tokens.Space.s24)
        .themed(.light)
}
