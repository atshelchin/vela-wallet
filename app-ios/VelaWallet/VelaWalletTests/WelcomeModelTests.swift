//
//  WelcomeModelTests.swift
//  VelaWalletTests
//
//  Carousel state: clamped, no wrap (US2); single intent sink (FR-010).
//

import Testing
@testable import VelaWallet

@MainActor
struct WelcomeModelTests {
    private func makeModel(onIntent: @escaping (OnboardingIntent) -> Void = { _ in }) -> WelcomeModel {
        WelcomeModel(
            content: WelcomeContent(
                tagline: "t",
                cards: (0..<6).map { FeatureCardContent(id: $0, title: "T\($0)", body: "B\($0)") },
                createWallet: "create",
                alreadyHaveWallet: "import"
            ),
            onIntent: onIntent
        )
    }

    @Test func pageClampsLow() {
        let model = makeModel()
        model.currentPage = -1
        #expect(model.currentPage == 0)
    }

    @Test func pageClampsHigh() {
        let model = makeModel()
        model.currentPage = 99
        #expect(model.currentPage == 5)
    }

    @Test func pageAcceptsValidRangeNoWrap() {
        let model = makeModel()
        for page in 0...5 {
            model.currentPage = page
            #expect(model.currentPage == page)
        }
        model.currentPage = 6 // one past the end must clamp, not wrap to 0
        #expect(model.currentPage == 5)
    }

    @Test func intentSinkForwardsBothIntents() {
        var received: [OnboardingIntent] = []
        let model = makeModel { received.append($0) }
        model.send(.createWallet)
        model.send(.importWallet)
        #expect(received == [.createWallet, .importWallet])
    }

    @Test func numeralsAreGeneratedTwoDigit() {
        let model = makeModel()
        #expect(model.content.cards.map(\.numeral) == ["01", "02", "03", "04", "05", "06"])
    }
}
