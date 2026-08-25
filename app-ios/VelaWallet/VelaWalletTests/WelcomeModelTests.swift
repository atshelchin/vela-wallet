//
//  WelcomeModelTests.swift
//  VelaWalletTests
//
//  Single intent sink (FR-010). The carousel-clamp tests went with the
//  carousel: the v2 welcome is a headline and two buttons (spec 019), and
//  there is no page position left to bound.
//

import Testing
@testable import VelaWallet

@MainActor
struct WelcomeModelTests {
    private func makeModel(onIntent: @escaping (OnboardingIntent) -> Void = { _ in }) -> WelcomeModel {
        WelcomeModel(
            content: WelcomeContent(
                heroTitle: "hero",
                heroTitleFit: .regular,
                heroSubtitle: "sub",
                createWallet: "create",
                alreadyHaveWallet: "import"
            ),
            onIntent: onIntent
        )
    }

    @Test func intentSinkForwardsBothIntents() {
        var received: [OnboardingIntent] = []
        let model = makeModel { received.append($0) }
        model.send(.createWallet)
        model.send(.importWallet)
        #expect(received == [.createWallet, .importWallet])
    }
}
