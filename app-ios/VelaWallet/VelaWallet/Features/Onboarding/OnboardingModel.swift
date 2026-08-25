//
//  OnboardingModel.swift
//  VelaWallet
//
//  Both onboarding machines, and the state the screens read.
//
//  The two machines are separate cores with separate drivers and ONE executor
//  between them: six of the eighteen operations are used by both flows, and the
//  contract is a single vocabulary. Two executors would be two places for those
//  six to drift.
//

import Foundation
import Observation
import VelaCore

@MainActor
@Observable
final class OnboardingModel {

    /// The create machine's view; nil until the flow has started.
    private(set) var createView: CreateView?

    private(set) var loginView: LoginView = .idle

    /// The prompt currently on screen, and the answer it is waiting for.
    private(set) var pending: PendingPrompt?

    /// Set once onboarding is over — the host navigates and clears it.
    private(set) var finished = false

    /// The endpoint surface, opened by `endpointUnreachable` or by hand.
    var endpointSheetOpen = false
    private(set) var endpointURL = RegistryClient.defaultURL

    /// A shell fault. Never a user error — it means this app has a bug.
    private(set) var fault: String?

    /// The name field's text, mirrored so typing is not a round trip.
    ///
    /// The CORE is still the authority — every keystroke dispatches
    /// `name_changed` and the view comes back — but a `TextField` bound
    /// straight to the view model loses the caret on every re-render, so the
    /// text lives here and the core corrects it.
    var name: String = "" {
        didSet {
            guard name != oldValue else { return }
            create?.dispatch(Self.event("name_changed", ["name": name]))
        }
    }

    struct PendingPrompt: Identifiable {
        let kind: PromptKind
        let confirmable: Bool
        let answer: CheckedContinuation<Bool, Never>

        var id: String { kind.id }
    }

    private let session: SessionController
    private let store: AccountStore
    private let registry: RegistryClient
    private let passkey = PasskeyExecutor()

    private var create: CoreDriver?
    private var login: CoreDriver?

    init(session: SessionController, store: AccountStore, registry: RegistryClient = RegistryClient()) {
        self.session = session
        self.store = store
        self.registry = registry
        Task {
            // The stored override, applied before any machine can ask a
            // question: a flow that started against the default and then
            // switched mid-way would query two different registries for one
            // wallet.
            let url = await session.registryURL()
            endpointURL = url
            await registry.setBaseURL(url)
        }
    }

    // MARK: - Create

    func startCreate() {
        guard create == nil else { return }
        let driver = CoreDriver(
            bridge: CreateWalletCore(),
            perform: { [weak self] operation in
                guard let self else { return CoreJSON.string(["type": "onboarding_completed"]) }
                return await self.executor().perform(operation)
            },
            onView: { [weak self] json in
                guard let self else { return }
                guard let decoded = try? CoreJSON.decode(CreateView.self, from: json) else { return }
                self.createView = decoded
                // The core is the authority on the name — a `StartOver` clears
                // it, and the field has to follow.
                if decoded.name != self.name { self.name = decoded.name }
            },
            onFault: { [weak self] error in self?.fault = error.localizedDescription }
        )
        create = driver
        driver.dispatch(Self.event("start"))
    }

    func toggleAck(_ index: Int) { create?.dispatch(Self.event("ack_toggled", ["index": index])) }
    func submit() { create?.dispatch(Self.event("submit")) }
    func addKey(_ method: KeyMethod) {
        create?.dispatch(Self.event("add_key", ["name": "", "method": method.rawValue]))
    }
    func confirmKey(_ index: Int) { create?.dispatch(Self.event("confirm_key", ["index": index])) }
    func removeKey(_ index: Int) { create?.dispatch(Self.event("remove_key", ["index": index])) }
    func finishKeys() { create?.dispatch(Self.event("finish_keys")) }
    func startOver() { create?.dispatch(Self.event("start_over")) }
    func retryUpload() { create?.dispatch(Self.event("retry_upload")) }
    func enterWallet() { create?.dispatch(Self.event("enter_wallet")) }
    func goBack() { create?.dispatch(Self.event("go_back")) }

    /// Leave the create flow.
    ///
    /// The driver is disposed and dropped rather than kept for a later
    /// re-entry: a create machine holds drafted passkeys, and reusing one across
    /// an exit would show the person a half-built wallet they thought they had
    /// abandoned. Re-entering starts a fresh core — which finds any real draft
    /// in storage.
    func disposeCreate() {
        create?.dispose()
        create = nil
        createView = nil
        name = ""
    }

    // MARK: - Sign in

    func signIn() {
        if login == nil {
            let driver = CoreDriver(
                bridge: LoginCore(),
                perform: { [weak self] operation in
                    guard let self else { return CoreJSON.string(["type": "onboarding_completed"]) }
                    return await self.executor().perform(operation)
                },
                onView: { [weak self] json in
                    guard let self else { return }
                    guard let decoded = try? CoreJSON.decode(LoginView.self, from: json) else { return }
                    // The endpoint surface opens the moment the health probe
                    // says the index is unreachable — and sign-in stays
                    // permitted while it is open. It is a warning with a fix
                    // attached, not a gate.
                    if decoded.endpointUnreachable && !self.loginView.endpointUnreachable {
                        self.endpointSheetOpen = true
                    }
                    self.loginView = decoded
                },
                onFault: { [weak self] error in self?.fault = error.localizedDescription }
            )
            login = driver
            driver.dispatch(Self.event("start"))
        }
        login?.dispatch(Self.event("sign_in"))
    }

    // MARK: - Prompts

    func answerPrompt(_ accepted: Bool) {
        guard let prompt = pending else { return }
        pending = nil
        prompt.answer.resume(returning: accepted)
    }

    // MARK: - Endpoint

    func saveEndpoint(_ url: String) {
        endpointSheetOpen = false
        let normalized = RegistryClient.normalize(url)
        endpointURL = normalized
        Task {
            await registry.setBaseURL(normalized)
            await session.setRegistryURL(normalized)
        }
    }

    func consumeFinished() { finished = false }

    // MARK: - Wiring

    private func executor() -> OnboardingExecutor {
        OnboardingExecutor(passkey: passkey, registry: registry, store: store, deps: self)
    }

    private static func event(_ type: String, _ fields: [String: Any] = [:]) -> String {
        var object: [String: Any] = ["type": type]
        object.merge(fields) { _, new in new }
        return CoreJSON.string(object)
    }
}

extension OnboardingModel: OnboardingExecutorDeps {
    func prompt(kind: PromptKind, confirmable: Bool) async -> Bool {
        await withCheckedContinuation { continuation in
            pending = PendingPrompt(kind: kind, confirmable: confirmable, answer: continuation)
        }
    }

    func complete(mode: [String: Any]) async {
        // Straight through to the session machine, untouched. The onboarding
        // core is finished; whether there is a wallet to route to is the session
        // machine's ruling, not this model's.
        session.accountEstablished(mode: mode)
        finished = true
    }
}
