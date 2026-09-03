//
//  ExploreEmptyView.swift
//  VelaWallet
//
//  The start page with nothing on it yet (mock E1): the sail, one line of
//  encouragement, and the one way out of an empty browser.
//

import SwiftUI

struct ExploreEmptyView: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let title: String
    let caption: String
    let cta: String
    var onBrowse: () -> Void = {}

    var body: some View {
        VStack(spacing: Tokens.Space.s12) {
            VelaMark(size: ExploreGeometry.emptyMark)
            Text(verbatim: title)
                .typeRole(Typography.title.scaled(textScale))
                .foregroundStyle(theme.fgBase)
            Text(verbatim: caption)
                .typeRole(Typography.rowSub.scaled(textScale))
                .foregroundStyle(theme.fgMuted)
                .multilineTextAlignment(.center)
            Button(action: onBrowse) {
                Text(verbatim: cta)
                    .typeRole(Typography.button.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                    .padding(.horizontal, Tokens.Space.s32)
                    .frame(height: Tokens.Control.lg)
                    .overlay(
                        Capsule().stroke(theme.borderStrong, lineWidth: Tokens.BorderWidth.hairline)
                    )
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, Tokens.Space.s12)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Tokens.Space.s48)
    }
}
