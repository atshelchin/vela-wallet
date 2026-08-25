//
//  RootView.swift
//  VelaWallet
//
//  App-level composition: navigation stack, theme injection, and the
//  welcome content resolved through the localization layer.
//

import SwiftUI

/// Navigation state. Since spec 019 the create journey is a pushed route
/// rather than a presented sheet — `presentedFlow` is gone with the 014 sheet.
@Observable
final class Router {
    var path: [AppRoute] = []
}

struct RootView: View {
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let loc: Loc
    @State private var router: Router
    @State private var model: WelcomeModel
    @State private var session: SessionController
    @State private var onboarding: OnboardingModel

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
        let store = AccountStore()
        let session = SessionController(store: store)
        let onboarding = OnboardingModel(session: session, store: store)
        _session = State(initialValue: session)
        _onboarding = State(initialValue: onboarding)
        _model = State(initialValue: WelcomeModel(content: WelcomeContentBuilder.build(loc: loc)) { intent in
            switch intent {
            case .createWallet:
                router.path.append(.create)
            case .importWallet:
                // No screen of our own: the login machine's first act is the
                // system passkey sheet, and the wallet is what follows it.
                onboarding.signIn()
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

            content(router: $router.path)
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
    private func content(router path: Binding<[AppRoute]>) -> some View {
        switch PageOverride.page {
        case .wallet:
            WalletScreen(model: WalletFixtures.buildMobileState(.h1, loc: loc))
        case .gallery:
            GalleryScreen(loc: loc)
        case .contacts:
            ContactsStateHost(state: .c1, loc: loc)
        case .contactsGallery:
            ContactsGalleryScreen(loc: loc)
        case nil:
            NavigationStack(path: path) {
                signedInOrWelcome
                    .navigationDestination(for: AppRoute.self) { route in
                        switch route {
                        case .create:
                            CreateFlowScreen(
                                loc: loc,
                                model: onboarding,
                                onExit: { router.path.removeLast() },
                                onLink: openPolicy
                            )
                            .navigationBarBackButtonHidden()
                        }
                    }
            }
            // The route guard.
            //
            // `allowedRoute` is the core's ruling about WHAT is allowed; when to
            // move is this view's call. It moves only for the two settled
            // routes: `loading` is deliberately not navigated to, because the
            // launch animation already covers that frame and bouncing through a
            // spinner route would make a cold start flicker.
            .onChange(of: session.view.allowedRoute) { _, route in
                if route == .onboarding { router.path.removeAll() }
            }
            .onChange(of: onboarding.finished) { _, finished in
                if finished {
                    router.path.removeAll()
                    onboarding.consumeFinished()
                }
            }
            // Hosted at the ROOT, deliberately. A prompt can be raised by either
            // machine, and the login machine runs while Welcome is on screen —
            // so a sheet attached to one route's view would vanish the moment
            // the guard moved, taking the question with it and leaving the core
            // waiting for an answer nobody can give.
            .sheet(item: pendingPrompt) { prompt in
                FlowSheet(
                    loc: loc,
                    kind: prompt.kind,
                    confirmable: prompt.confirmable,
                    onAnswer: onboarding.answerPrompt
                )
                .themed(scheme)
            }
            // The way back out of a signed-in wallet.
            //
            // Rendered from `session.view.signOut`, which is non-null only after
            // the machine has ASKED STORAGE whether any public key is still
            // unconfirmed — so the warning inside is an answer rather than this
            // screen's guess, and the sheet cannot open before there is one.
            .sheet(item: signOutSheet) { sheet in
                SignOutSheet(
                    loc: loc,
                    pendingUploadWarning: sheet.pendingUploadWarning,
                    onConfirm: { session.signOutConfirmed() },
                    onDismiss: { session.signOutDismissed() }
                )
                .themed(scheme)
            }
            .sheet(isPresented: endpointSheet) {
                EndpointSheet(
                    loc: loc,
                    defaultURL: RegistryClient.defaultURL,
                    draft: onboarding.endpointURL,
                    onSave: onboarding.saveEndpoint
                )
                .themed(scheme)
            }
            .task { session.boot() }
        }
    }

    /// The wallet when the core says there is one, Welcome otherwise.
    ///
    /// The wallet body is still the spec-015 fixture layer apart from the two
    /// things that identify the wallet — its address and its name, both now
    /// the real ones. A home screen showing a fixture address after a real
    /// create would be the app telling the person their money is somewhere it
    /// is not; a fixture NAME over their own address and identicon told them
    /// they were signed in as somebody else (device-found 2026-08-26).
    @ViewBuilder
    private var signedInOrWelcome: some View {
        if session.view.allowedRoute == .wallet {
            WalletScreen(
                model: WalletFixtures
                    .buildMobileState(.h1, loc: loc)
                    .withAddress(session.view.address)
                    .withName(session.view.activeName),
                onSelectTab: { tab in
                    // Sign-out is the only thing behind Settings today. The
                    // other three tabs stay on this screen rather than
                    // navigating to fixtures a signed-in person would read as
                    // their real data.
                    if tab == .settings { session.signOut() }
                }
            )
        } else {
            WelcomeScreen(model: model, signingIn: onboarding.loginView.busy)
        }
    }

    private var pendingPrompt: Binding<OnboardingModel.PendingPrompt?> {
        Binding(get: { onboarding.pending }, set: { if $0 == nil { onboarding.answerPrompt(false) } })
    }

    private var signOutSheet: Binding<SessionSignOutView?> {
        Binding(
            get: { session.view.signOut },
            set: { if $0 == nil { session.signOutDismissed() } }
        )
    }

    private var endpointSheet: Binding<Bool> {
        Binding(get: { onboarding.endpointSheetOpen }, set: { onboarding.endpointSheetOpen = $0 })
    }

    private func openPolicy(_ action: ActionId) {
        let url = switch action {
        case .openPrivacyPolicy: URL(string: "https://getvela.app/privacy")
        case .openTerms: URL(string: "https://getvela.app/terms")
        }
        if let url { UIApplication.shared.open(url) }
    }
}

/// `VELA_PAGE` launch override (spec 015 research D4, extended by spec 018
/// research D1) — same idiom as `VELA_THEME`/`VELA_LANG`: `wallet` mounts
/// the fixture-driven home, `gallery` the wallet preview gallery,
/// `contacts` the contacts home, `contacts-gallery` the contacts preview
/// gallery; unset keeps the Welcome flow. Never part of production
/// navigation (FR-004).
enum PageOverride {
    enum Page { case wallet, gallery, contacts, contactsGallery }

    static let page: Page? = {
        switch ProcessInfo.processInfo.environment["VELA_PAGE"] {
        case "wallet": .wallet
        case "gallery": .gallery
        case "contacts": .contacts
        case "contacts-gallery": .contactsGallery
        default: nil
        }
    }()
}

/// Resolves every welcome-screen string from the corpus — existing keys only,
/// no new corpus entries.
///
/// `featureNoMnemonic*` … `featureStablecoinGas*` are no longer resolved: the
/// v2 screen has no cards to put them on (spec 019). They stay in the corpus
/// rather than being deleted, because they are written marketing copy and the
/// page they belong on may yet exist — the same call the web made.
enum WelcomeContentBuilder {
    static func build(loc: Loc) -> WelcomeContent {
        WelcomeContent(
            heroTitle: loc.t("onboarding.welcome.heroTitle"),
            heroSubtitle: loc.t("onboarding.welcome.heroSubtitle"),
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
