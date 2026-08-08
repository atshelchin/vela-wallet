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
        // Android's structure, ported: a flexible hero region whose two big gaps
        // are FRACTIONS OF ITS OWN HEIGHT, plus a CTA block pinned at the bottom.
        // The previous version used two fixed `Spacer(minLength: 32)`, which is
        // why the screen read as cramped next to Android on the same content.
        VStack(spacing: 0) {
            GeometryReader { proxy in
                let region = proxy.size.height
                VStack(spacing: 0) {
                    Spacer().frame(height: region * WelcomeGeometry.heroTopFraction)

                    BrandRow()

                    Text(model.content.tagline)
                        .typeRole(Typography.tagline)
                        .foregroundStyle(theme.fgMuted)
                        .multilineTextAlignment(.center)
                        .padding(.top, WelcomeGeometry.brandTaglineGap)

                    Spacer().frame(height: region * WelcomeGeometry.taglineCarouselFraction)

                    carousel

                    PagerDots(count: model.content.cards.count, current: $model.currentPage)
                        .padding(.top, WelcomeGeometry.cardDotsGap)

                    // Absorbs whatever the fractions did not spend, so the hero
                    // never fights the pinned CTAs for space.
                    Spacer(minLength: 0)
                }
                .frame(width: proxy.size.width)
            }

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

// MARK: - Flow presentation (spec 014, US2)

/// Which flow a Welcome intent presents; `nil` on the router = closed.
enum WelcomeFlow: String, Identifiable {
    case create
    case login

    var id: String { rawValue }
}

/// Production host for the flow sheet (contract §2/§3): FlowSheet + the
/// flow's initial state (create → empty Form, login → Waiting nil). The
/// action sink is a no-op log, except the closing ids which dismiss —
/// real progression arrives with the wiring feature (FR-011, D3).
struct WelcomeFlowHost: View {
    let flow: WelcomeFlow
    let loc: Loc
    @Environment(\.dismiss) private var dismiss

    private var createInitial: CreatePanelState { .form(FormState()) }
    private var loginInitial: LoginPanelState { .waiting(elapsedSecs: nil) }

    var body: some View {
        FlowSheet(
            title: loc.t(titleKey),
            closeLabel: loc.t("onboarding.common.close"),
            onClose: { dismiss() }
        ) {
            switch flow {
            case .create:
                CreatePanel(loc: loc, state: createInitial, sink: sink)
            case .login:
                LoginPanel(loc: loc, state: loginInitial, sink: sink)
            }
        }
    }

    private var titleKey: String {
        switch flow {
        case .create: CreatePanel.scaffoldTitleKey(for: createInitial)
        case .login: LoginPanel.scaffoldTitleKey(for: loginInitial)
        }
    }

    private func sink(_ action: ActionId) {
        switch action {
        case .back, .cancel, .notNow, .close:
            dismiss()
        default:
            // No-op log per contract §2 — the desktop on_intent pattern.
            print("[welcome] \(flow.rawValue) → \(action.rawValue)")
        }
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
