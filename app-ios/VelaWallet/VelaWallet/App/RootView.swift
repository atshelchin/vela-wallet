//
//  RootView.swift
//  VelaWallet
//
//  App-level composition: navigation stack, theme injection, and the
//  welcome content resolved through the localization layer.
//

import SwiftUI

/// Navigation state — future features push their real flows here (FR-010).
@Observable
final class Router {
    var path: [AppRoute] = []
}

struct RootView: View {
    @Environment(\.colorScheme) private var systemScheme
    let loc: Loc
    @State private var router: Router
    @State private var model: WelcomeModel

    init(loc: Loc) {
        self.loc = loc
        let router = Router()
        _router = State(initialValue: router)
        _model = State(initialValue: WelcomeModel(content: WelcomeContentBuilder.build(loc: loc)) { intent in
            switch intent {
            case .createWallet: router.path.append(.createWalletPlaceholder)
            case .importWallet: router.path.append(.importWalletPlaceholder)
            }
        })
    }

    private var scheme: ColorScheme {
        ThemeOverride.launchScheme ?? systemScheme
    }

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.path) {
            WelcomeScreen(model: model)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .createWalletPlaceholder:
                        IntentPlaceholderScreen(title: loc.t("onboarding.welcome.createWallet"))
                    case .importWalletPlaceholder:
                        IntentPlaceholderScreen(title: loc.t("onboarding.welcome.alreadyHaveWallet"))
                    }
                }
        }
        .themed(scheme)
        .preferredColorScheme(ThemeOverride.launchScheme)
    }
}

/// Resolves every welcome-screen string from the corpus — the key list is
/// FR-006's contract (existing keys only, no new corpus entries).
enum WelcomeContentBuilder {
    static let featureKeys: [(title: String, body: String)] = [
        ("onboarding.welcome.featureNoMnemonicTitle", "onboarding.welcome.featureNoMnemonicBody"),
        ("onboarding.welcome.featureOneAddressTitle", "onboarding.welcome.featureOneAddressBody"),
        ("onboarding.welcome.featureOpenSourceTitle", "onboarding.welcome.featureOpenSourceBody"),
        ("onboarding.welcome.featureKeyCustodyTitle", "onboarding.welcome.featureKeyCustodyBody"),
        ("onboarding.welcome.featureSafeContractTitle", "onboarding.welcome.featureSafeContractBody"),
        ("onboarding.welcome.featureStablecoinGasTitle", "onboarding.welcome.featureStablecoinGasBody"),
    ]

    static func build(loc: Loc) -> WelcomeContent {
        WelcomeContent(
            tagline: loc.t("onboarding.welcome.desktopTagline"),
            cards: featureKeys.enumerated().map { index, keys in
                FeatureCardContent(id: index, title: loc.t(keys.title), body: loc.t(keys.body))
            },
            createWallet: loc.t("onboarding.welcome.createWallet"),
            alreadyHaveWallet: loc.t("onboarding.welcome.alreadyHaveWallet")
        )
    }
}

/// `VELA_THEME` launch override (FR-003 / D7) — read once; `nil` follows the
/// system appearance.
enum ThemeOverride {
    static let launchScheme: ColorScheme? = {
        switch ProcessInfo.processInfo.environment["VELA_THEME"] {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }()
}
