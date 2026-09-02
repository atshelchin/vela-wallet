//
//  ExploreSearchField.swift
//  VelaWallet
//
//  The one input on the start page (spec 022): a search box and an address
//  bar at once, because "type a name" and "type a URL" are the same act to
//  everyone except a browser engineer.
//

import SwiftUI

struct ExploreSearchField: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let placeholder: String
    let scanLabel: String
    var onSubmit: (String) -> Void = { _ in }
    var onScan: () -> Void = {}

    @State private var text = ""

    var body: some View {
        HStack(spacing: Tokens.Space.s8) {
            HStack(spacing: Tokens.Space.s12) {
                LucideIcon(.search, size: LucideIconSize.sheetSearch)
                    .foregroundStyle(theme.fgSubtle)
                TextField(placeholder, text: $text)
                    .font(Typography.body.scaled(textScale).font)
                    .foregroundStyle(theme.fgBase)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .onSubmit { onSubmit(text) }
            }
            .padding(.horizontal, Tokens.Space.s16)
            .frame(height: ExploreGeometry.searchField)
            .background(theme.bgRaised, in: RoundedRectangle(cornerRadius: Tokens.Radius.r12))

            Button(action: onScan) {
                LucideIcon(.scanLine, size: LucideIconSize.action)
                    .foregroundStyle(theme.fgMuted)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(scanLabel)
        }
    }
}
