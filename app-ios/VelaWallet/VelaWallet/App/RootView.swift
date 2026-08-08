//
//  RootView.swift
//  VelaWallet
//
//  App-level composition: navigation stack, theme injection, and the
//  welcome content resolved through the localization layer.
//

import SwiftUI

/// Navigation state — future features push their real flows here (FR-010).
/// `presentedFlow` is the spec-014 flow sheet (nil = Welcome only).
@Observable
final class Router {
    var path: [AppRoute] = []
    var presentedFlow: WelcomeFlow?
}

struct RootView: View {
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let loc: Loc
    @State private var router: Router
    @State private var model: WelcomeModel

    // Spec 012. `true` only for the first construction in this process — a
    // cold start (FR-008); SwiftUI never rebuilds `RootView`'s State on a
    // navigation, so there is no path back once it flips.
    @State private var launching = !LaunchAnimation.isDisabled
    /// Welcome content fades IN as the launch lockup fades OUT (FR-012).
    @State private var pageOpacity: Double = LaunchAnimation.isDisabled ? 1 : 0

    init(loc: Loc) {
        self.loc = loc
        let router = Router()
        _router = State(initialValue: router)
        _model = State(initialValue: WelcomeModel(content: WelcomeContentBuilder.build(loc: loc)) { intent in
            // Spec 014 (US2/D3): the intents present the flow sheet with the
            // flow's initial state. The AppRoute placeholder cases remain for
            // the future wiring feature, but nothing pushes them anymore.
            switch intent {
            case .createWallet: router.presentedFlow = .create
            case .importWallet: router.presentedFlow = .login
            }
        })
    }

    private var scheme: ColorScheme {
        ThemeOverride.launchScheme ?? systemScheme
    }

    var body: some View {
        // Spec 014: dev-only state gallery replaces the app when launched
        // with VELA_GALLERY=1. Debug-only compile + env gate (FR-013).
        #if DEBUG
        if GalleryMode.isEnabled {
            OnboardingGalleryScreen(loc: loc)
        } else {
            appBody
        }
        #else
        appBody
        #endif
    }

    private var appBody: some View {
        @Bindable var router = router
        // One continuous surface. Both the launch screen and Welcome sit on this
        // exact colour, which is what lets them cross-dissolve without a
        // washed-out middle where both layers are half-transparent (FR-012).
        return ZStack {
            themedBackground

            content(router: $router.path, flow: $router.presentedFlow)
                // Composed from the first frame, hidden by the opaque overlay,
                // so the hand-off has nothing left to build (FR-013a).
                .opacity(pageOpacity)
                // Opacity alone does NOT remove it from the accessibility tree:
                // during the animation VoiceOver would happily read out a
                // Welcome screen the user cannot see, and XCUITest could find
                // its buttons. Both are the same defect (FR-013/FR-021).
                .accessibilityHidden(launching)

            if launching {
                LaunchAnimationView(
                    appearance: scheme == .dark ? .dark : .light,
                    formFactor: LaunchAnimation.formFactor(for: screenSize),
                    reduceMotion: reduceMotion,
                    onDissolveStart: {
                        // The other half of the cross-dissolve: same curve, same
                        // duration, started in the same instant as the overlay's
                        // fade-out (FR-012).
                        withAnimation(.easeInOut(duration: LaunchAnimation.exitCrossfade)) {
                            pageOpacity = 1
                        }
                    },
                    onFinished: {
                        pageOpacity = 1
                        launching = false
                    }
                )
            }
        }
        .themed(scheme)
        .preferredColorScheme(ThemeOverride.launchScheme)
    }

    private var themedBackground: some View {
        Theme(scheme: scheme).bgBase.ignoresSafeArea()
    }

    private var screenSize: CGSize {
        #if canImport(UIKit)
        UIScreen.main.bounds.size
        #else
        CGSize(width: 390, height: 844)
        #endif
    }

    @ViewBuilder
    private func content(router path: Binding<[AppRoute]>, flow: Binding<WelcomeFlow?>) -> some View {
        switch PageOverride.page {
        case .wallet:
            WalletScreen(model: WalletFixtures.buildMobileState(.h1, loc: loc))
        case .gallery:
            // Spec 015's wallet-home gallery; the spec 014 onboarding-state
            // gallery is OnboardingGalleryScreen behind VELA_GALLERY=1.
            GalleryScreen(loc: loc)
        case nil:
            NavigationStack(path: path) {
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
            // Spec 014 flow container (contract §3): FlowSheet supplies the
            // content-height detent, drag indicator, and bgRaised presentation.
            .sheet(item: flow) { presented in
                WelcomeFlowHost(flow: presented, loc: loc)
                    // Sheets are their own presentation root — re-apply the
                    // active theme, mirroring the gallery's container contract.
                    .themed(scheme)
            }
        }
    }
}

/// `VELA_PAGE` launch override (spec 015 research D4) — same idiom as
/// `VELA_THEME`/`VELA_LANG`: `wallet` mounts the fixture-driven home,
/// `gallery` the preview gallery; unset keeps the Welcome flow. Never part
/// of production navigation (FR-004).
enum PageOverride {
    enum Page { case wallet, gallery }

    static let page: Page? = {
        switch ProcessInfo.processInfo.environment["VELA_PAGE"] {
        case "wallet": .wallet
        case "gallery": .gallery
        default: nil
        }
    }()
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
