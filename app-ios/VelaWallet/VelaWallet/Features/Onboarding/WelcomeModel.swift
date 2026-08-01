//
//  WelcomeModel.swift
//  VelaWallet
//
//  View state + single intent sink for the welcome screen (FR-010).
//  Strings arrive pre-resolved from the localization layer (FR-009);
//  nothing here persists (006/007 parity).
//

import Observation

enum OnboardingIntent: Equatable {
    case createWallet
    case importWallet
}

/// All user-visible strings of the welcome screen, resolved once per locale.
struct WelcomeContent: Equatable {
    let tagline: String
    let cards: [FeatureCardContent] // exactly 6, fixed order
    let createWallet: String
    let alreadyHaveWallet: String
}

@Observable
final class WelcomeModel {
    let content: WelcomeContent
    private let onIntent: (OnboardingIntent) -> Void

    /// Carousel position, clamped to the card range; no wrap-around (US2).
    var currentPage: Int = 0 {
        didSet {
            let bound = max(0, min(currentPage, content.cards.count - 1))
            if currentPage != bound { currentPage = bound }
        }
    }

    init(content: WelcomeContent, onIntent: @escaping (OnboardingIntent) -> Void) {
        self.content = content
        self.onIntent = onIntent
    }

    func send(_ intent: OnboardingIntent) {
        onIntent(intent)
    }
}
