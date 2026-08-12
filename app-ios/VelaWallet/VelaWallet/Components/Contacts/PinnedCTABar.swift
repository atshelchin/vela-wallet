//
//  PinnedCTABar.swift
//  VelaWallet
//
//  PinnedCTABar (spec 018 vocabulary #17, mock C4): bottom-pinned accent CTA
//  (群发转账) over a centered caption line. Reuses the single authoritative
//  CTA control (VelaButton) — the accent surface is "moving money", per the
//  house rule. An empty group disables the CTA (spec edge case).
//

import SwiftUI

struct PinnedCTABar: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let title: String
    let caption: String
    var enabled: Bool = true
    var onTap: () -> Void = {}

    var body: some View {
        VStack(spacing: Tokens.Space.s8) {
            VelaButton(title: title, kind: .primary, enabled: enabled, action: onTap)
            Text(verbatim: caption)
                .typeRole(Typography.rowSub.scaled(textScale))
                .foregroundStyle(theme.fgMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.top, Tokens.Space.s12)
        .frame(maxWidth: .infinity)
        .background(theme.bgBase)
    }
}

#Preview("Pinned CTA dark") {
    PinnedCTABar(title: "群发转账", caption: "向本组 3 人转账，金额可分别设置。")
        .background(Tokens.dark.bgBase.color)
        .themed(.dark)
}

#Preview("Pinned CTA disabled light") {
    PinnedCTABar(title: "Send to group", caption: "Send to all 0 members — amounts can be set individually.", enabled: false)
        .themed(.light)
}
