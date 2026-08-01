//
//  FeatureCard.swift
//  VelaWallet
//
//  One numbered value-proposition card (raised surface). Strings arrive
//  pre-resolved (FR-009); the numeral is generated, never translated.
//

import SwiftUI

struct FeatureCardContent: Equatable, Identifiable {
    let id: Int          // 0-based card index
    let title: String
    let body: String

    var numeral: String { String(format: "%02d", id + 1) }
}

struct FeatureCard: View {
    @Environment(\.theme) private var theme
    let content: FeatureCardContent

    var body: some View {
        VStack(alignment: .leading, spacing: WelcomeGeometry.cardInnerGap) {
            Text(content.numeral)
                .typeRole(Typography.label)
                .foregroundStyle(theme.fgSubtle)
            Text(content.title)
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)
            Text(content.body)
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(WelcomeGeometry.cardPadding)
        .background(theme.bgRaised, in: RoundedRectangle(cornerRadius: Tokens.Radius.r16))
        .accessibilityElement(children: .combine)
    }
}

#Preview("FeatureCard") {
    VStack(spacing: 16) {
        FeatureCard(content: .init(
            id: 0,
            title: "No seed phrase",
            body: "Create and sign in with the passkey on your device — no 12 words to copy down and guard."
        ))
        .themed(.light)
    }
    .padding(24)
}
