//
//  AddressBarView.swift
//  VelaWallet
//
//  The browsing top bar (mock E4): close, the domain in a pill with its
//  padlock, and the site menu. The pill shows the DOMAIN, never the full
//  URL — the part of an address that decides who you are talking to must
//  not be pushed off the end by a long path.
//

import SwiftUI

struct AddressBarView: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let host: String
    let secure: Bool
    let secureLabel: String
    let closeLabel: String
    let menuLabel: String
    var onClose: () -> Void = {}
    var onMenu: () -> Void = {}

    var body: some View {
        HStack(spacing: Tokens.Space.s8) {
            Button(action: onClose) {
                LucideIcon(.close, size: LucideIconSize.browserBarGlyph)
                    .foregroundStyle(theme.fgBase)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(closeLabel)

            HStack(spacing: Tokens.Space.s8) {
                if secure {
                    LucideIcon(.lock, size: LucideIconSize.addressLock)
                        .foregroundStyle(theme.fgMuted)
                        .accessibilityLabel(secureLabel)
                }
                Text(verbatim: host)
                    .typeRole(Typography.body.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: ExploreGeometry.addressPill)
            .background(theme.bgRaised, in: Capsule())

            Button(action: onMenu) {
                LucideIcon(.ellipsis, size: LucideIconSize.browserBarGlyph)
                    .foregroundStyle(theme.fgBase)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(menuLabel)
        }
        .padding(.horizontal, Tokens.Space.s12)
        .padding(.vertical, Tokens.Space.s8)
    }
}
