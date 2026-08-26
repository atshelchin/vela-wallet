//
//  WelcomeScreen.swift
//  VelaWallet
//
//  The onboarding welcome screen — composition only (FR-009).
//
//  The v2 design (design/onboarding-new, founder direction 2026-08-25), which
//  the web and the desktop already draw: brand row, a two-line headline with
//  one supporting sentence, and the two ways in at the bottom. The six-card
//  carousel is gone — the design is one column that says what the wallet IS
//  before it says what to do about it, and a deck of feature cards nobody
//  swipes past the first of was the opposite of that.
//

import SwiftUI

struct WelcomeScreen: View {
    @Environment(\.theme) private var theme
    @Bindable var model: WelcomeModel
    /// The login machine's `busy`. Signing in has no screen of its own — the
    /// system passkey sheet is the next thing the person sees, and it does not
    /// arrive in the same frame as the press — so this button IS the progress
    /// indicator for that wait. It stays at full emphasis with a spinner in
    /// place of its label; a control that dimmed instead would read as the app
    /// having gone unavailable rather than gone to work.
    var signingIn: Bool = false

    private var heroRole: TypeRole { model.content.heroTitleFit.role }

    var body: some View {
        // Two blocks, not one centred stack: brand and copy ride the top edge,
        // the CTAs ride the bottom, and the space between them is whatever the
        // phone has left over.
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: WelcomeGeometry.brandHeroGap) {
                BrandRow()

                VStack(alignment: .leading, spacing: WelcomeGeometry.heroSubGap) {
                    // The copy carries its own line break: every locale breaks
                    // where its own sentence wants to, not where 390pt runs out.
                    // Its SIZE comes from the same place for the same reason —
                    // a line that is 10.9em wide in Russian and 6.9em in Chinese
                    // cannot be set at one size and still fit 342pt.
                    Text(model.content.heroTitle)
                        .typeRole(heroRole)
                        .tracking(heroRole.size * WelcomeGeometry.heroTracking)
                        .foregroundStyle(theme.fgBase)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(model.content.heroSubtitle)
                        .typeRole(Typography.body)
                        .foregroundStyle(theme.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: WelcomeGeometry.heroCtaMinGap)

            VStack(spacing: WelcomeGeometry.ctaGap) {
                VelaButton(title: model.content.createWallet, kind: .primary, enabled: !signingIn) {
                    model.send(.createWallet)
                }
                VelaButton(title: model.content.alreadyHaveWallet, kind: .secondary, loading: signingIn) {
                    model.send(.importWallet)
                }
            }
        }
        .padding(.top, Tokens.Space.s32)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.bottom, Tokens.Space.s8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(theme.bgBase.ignoresSafeArea())
    }
}

#Preview("Welcome") {
    WelcomeScreen(
        model: WelcomeModel(
            content: WelcomeContent(
                heroTitle: "The unstoppable\nEthereum wallet",
                heroTitleFit: .regular,
                heroSubtitle: "Sign with a passkey. Vela never sees your key.",
                createWallet: "Create Wallet",
                alreadyHaveWallet: "I already have a wallet"
            ),
            onIntent: { _ in }
        )
    )
    .themed(.light)
}
