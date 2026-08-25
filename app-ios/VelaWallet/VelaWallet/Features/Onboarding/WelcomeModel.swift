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
///
/// The v2 screen is a headline and two buttons (spec 019); the six feature
/// cards it used to carry are gone from the screen, and with them the carousel
/// position this model used to clamp.
struct WelcomeContent: Equatable {
    let heroTitle: String
    let heroSubtitle: String
    let createWallet: String
    let alreadyHaveWallet: String
}

@Observable
final class WelcomeModel {
    let content: WelcomeContent
    private let onIntent: (OnboardingIntent) -> Void

    init(content: WelcomeContent, onIntent: @escaping (OnboardingIntent) -> Void) {
        self.content = content
        self.onIntent = onIntent
    }

    func send(_ intent: OnboardingIntent) {
        onIntent(intent)
    }
}
