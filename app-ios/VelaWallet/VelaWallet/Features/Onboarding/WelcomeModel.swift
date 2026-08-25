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

/// Which rung of the hero type ladder this locale's headline needs.
///
/// It rides in the corpus (`onboarding.welcome.heroTitleFit`) beside the string
/// it describes, because it is a property OF the translation: measured at the
/// shipped font, the widest authored line runs from 6.9em (zh) to 10.9em (ru),
/// and no one size serves both. All four clients read the same value; each maps
/// it to its own type scale.
enum HeroFit: String, Equatable {
    case regular
    case long

    /// An unknown value means the corpus got ahead of this build — keep the
    /// design's size rather than shrinking on a string nobody recognises.
    init(corpusValue: String) {
        self = HeroFit(rawValue: corpusValue) ?? .regular
    }

    var role: TypeRole {
        switch self {
        case .regular: Typography.hero
        case .long: Typography.heroLong
        }
    }
}

/// All user-visible strings of the welcome screen, resolved once per locale.
///
/// The v2 screen is a headline and two buttons (spec 019); the six feature
/// cards it used to carry are gone from the screen, and with them the carousel
/// position this model used to clamp.
struct WelcomeContent: Equatable {
    let heroTitle: String
    let heroTitleFit: HeroFit
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
