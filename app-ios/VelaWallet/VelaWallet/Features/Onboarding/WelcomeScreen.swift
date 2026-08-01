//
//  WelcomeScreen.swift
//  VelaWallet
//
//  The onboarding welcome screen — composition only (FR-009), reproducing
//  design/onboarding/W1 (dark) and W1L (light) at the 390×844 design frame.
//

import SwiftUI

struct WelcomeScreen: View {
    @Environment(\.theme) private var theme
    @Bindable var model: WelcomeModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: Tokens.Space.s32)

            BrandRow()

            Text(model.content.tagline)
                .typeRole(Typography.tagline)
                .foregroundStyle(theme.fgMuted)
                .multilineTextAlignment(.center)
                .padding(.top, WelcomeGeometry.brandTaglineGap)

            Spacer(minLength: Tokens.Space.s32)

            carousel

            PagerDots(count: model.content.cards.count, current: $model.currentPage)
                .padding(.top, WelcomeGeometry.cardDotsGap)

            VStack(spacing: WelcomeGeometry.ctaGap) {
                VelaButton(title: model.content.createWallet, kind: .primary) {
                    model.send(.createWallet)
                }
                VelaButton(title: model.content.alreadyHaveWallet, kind: .secondary) {
                    model.send(.importWallet)
                }
            }
            .padding(.top, WelcomeGeometry.dotsCtaGap)
        }
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.bottom, Tokens.Space.s8)
        .background(theme.bgBase.ignoresSafeArea())
    }

    /// Single-card paging carousel; height follows the tallest card of the
    /// active locale (long-copy edge case) via a hidden measuring stack.
    private var carousel: some View {
        TabView(selection: $model.currentPage) {
            ForEach(model.content.cards) { card in
                FeatureCard(content: card)
                    .tag(card.id)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(height: max(measuredCardHeight, WelcomeGeometry.cardBandMinHeight))
        .animation(.easeOut(duration: Tokens.Motion.base), value: model.currentPage)
        .background {
            // Invisible measuring pass: tallest card defines the band height.
            ZStack {
                ForEach(model.content.cards) { card in
                    FeatureCard(content: card)
                        .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { height in
                            cardHeights[card.id] = height
                        }
                }
            }
            .hidden()
        }
    }

    @State private var cardHeights: [Int: CGFloat] = [:]
    private var measuredCardHeight: CGFloat {
        cardHeights.values.max() ?? 0
    }
}

#Preview("Welcome (en placeholder)") {
    WelcomeScreen(model: WelcomeModel(
        content: WelcomeContent(
            tagline: "Your keys, your assets",
            cards: (0..<6).map { FeatureCardContent(id: $0, title: "Card \($0 + 1)", body: "Body copy for card \($0 + 1).") },
            createWallet: "Create Wallet",
            alreadyHaveWallet: "I already have a wallet"
        ),
        onIntent: { _ in }
    ))
    .themed(.dark)
    .preferredColorScheme(.dark)
}
