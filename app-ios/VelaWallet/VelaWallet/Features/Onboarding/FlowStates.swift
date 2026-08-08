//
//  FlowStates.swift
//  VelaWallet
//
//  Presentation state model for the create/login flows (spec 014).
//  Renderable-only shapes — field vocabulary aligned with the spec-011
//  crux ViewModels so the later wiring is a mechanical mapping
//  (data-model.md §6). NO business behaviour lives here (FR-011).
//

import Foundation

// MARK: - Scaffold

/// Which header title the flow container shows (data-model §3).
enum ScaffoldTitle {
    case create
    case login
    case sync
    case shared

    var key: String {
        switch self {
        case .create: "onboarding.create.headerDefault"
        case .login: "onboarding.login.header"
        case .sync: "onboarding.create.headerSyncFailed"
        case .shared: "onboarding.common.headerShared"
        }
    }
}

// MARK: - Actions

/// Host-sink action identifiers (contract §2). Components never decide
/// what happens next — they emit one of these to a host-provided sink.
enum ActionId: String {
    case submitCreate = "submit_create"
    case enterWallet = "enter_wallet"
    case finishVerify = "finish_verify"
    case startOverNewPasskey = "start_over_new_passkey"
    case retry
    case retryUpload = "retry_upload"
    case retryVerify = "retry_verify"
    case retryLogin = "retry_login"
    case recreateWallet = "recreate_wallet"
    case createNewWallet = "create_new_wallet"
    case recoverNow = "recover_now"
    case notNow = "not_now"
    case editIndexEndpoint = "edit_index_endpoint"
    case reportError = "report_error"
    case openBiometricSettings = "open_biometric_settings"
    case openCredentialManagerSettings = "open_credential_manager_settings"
    case back
    case cancel
    case close
    case copyAddress = "copy_address"
    case toggleDetails = "toggle_details"
    case openPrivacyPolicy = "open_privacy_policy"
    case openTerms = "open_terms"
}

enum ActionRole {
    case primary
    case secondary
}

/// One stacked action: role + copy key + sink id (data-model §3).
struct FlowAction: Equatable {
    let role: ActionRole
    let labelKey: String
    let id: ActionId
}

// MARK: - Outcome pattern

/// Status-badge variants (data-model §3, 6 refined from the mocks).
enum BadgeVariant {
    case success
    case warning
    case neutral
    case error
    case timeout
    case info
}

/// Runtime diagnostics shown by the 技术详情 disclosure (data, not copy).
struct TechDetails: Equatable {
    let code: String
    let context: String
    let endpoint: String?
}

/// One shape renders every result/error state (data-model §3).
struct OutcomeSpec {
    let kind: OutcomeKind
    let scaffoldTitle: ScaffoldTitle
    let badge: BadgeVariant
    let headlineKey: String
    let bodyKey: String
    /// `{{var}}` fills for the body copy (fixture data, e.g. count=12).
    var bodyVars: [String: String] = [:]
    /// Extra dim line under the body/address (A11 verify hint only).
    var footnoteKey: String? = nil
    /// Some → copyable address strip (A11 only).
    var address: String? = nil
    /// Some → 技术详情 disclosure present.
    var details: TechDetails? = nil
    /// Default collapsed on every entry; E2x fixture = true.
    var detailsExpanded: Bool = false
    /// Exactly 1 primary + 0…2 secondary, top-to-bottom.
    let actions: [FlowAction]
}

// MARK: - Outcome catalog

/// The 18 result/error kinds — extends spec-011 `FailureKind` with the
/// mock-driven taxonomy (data-model §4). `spec` is the one authoritative
/// kind → OutcomeSpec catalog; components render the spec, never branch
/// on the kind.
enum OutcomeKind: String, CaseIterable {
    case created
    case syncFailed = "sync_failed"
    case verifyStuck = "verify_stuck"
    case network
    case server
    case timeout
    case cancelledSetup = "cancelled_setup"
    case cancelledVerify = "cancelled_verify"
    case unsupported
    case incompatible
    case notDiscoverable = "not_discoverable"
    case accountNotFound = "account_not_found"
    case unknown
    case recoverOffer = "recover_offer"
    case recoverFailed = "recover_failed"
    case signInFailed = "sign_in_failed"
    case signedIn = "signed_in"
    case loginCancelled = "login_cancelled"

    var spec: OutcomeSpec {
        switch self {
        case .created:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .success,
                headlineKey: "onboarding.create.successTitle",
                bodyKey: "onboarding.create.successMessage",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.create.enterWalletBtn", id: .enterWallet),
                ]
            )
        case .syncFailed:
            OutcomeSpec(
                kind: self, scaffoldTitle: .sync, badge: .warning,
                headlineKey: "onboarding.create.syncFailedTitle",
                bodyKey: "onboarding.common.syncFailedBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.create.retryUploadBtn", id: .retryUpload),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.editIndexEndpoint", id: .editIndexEndpoint),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.reportError", id: .reportError),
                ]
            )
        case .verifyStuck:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .warning,
                headlineKey: "onboarding.common.verifyStuckTitle",
                bodyKey: "onboarding.common.verifyStuckBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.create.finishVerifyBtn", id: .finishVerify),
                    FlowAction(role: .secondary, labelKey: "onboarding.create.startOverBtn", id: .startOverNewPasskey),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .network:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .error,
                headlineKey: "onboarding.common.networkTitle",
                bodyKey: "onboarding.common.networkBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.retry", id: .retry),
                    FlowAction(role: .secondary, labelKey: "common.cancel", id: .cancel),
                ]
            )
        case .server:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .error,
                headlineKey: "onboarding.common.serverTitle",
                bodyKey: "onboarding.common.serverBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.retry", id: .retry),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.editIndexEndpoint", id: .editIndexEndpoint),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.reportError", id: .reportError),
                ]
            )
        case .timeout:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .timeout,
                headlineKey: "onboarding.common.timeoutTitle",
                bodyKey: "onboarding.common.timeoutBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.retry", id: .retry),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .cancelledSetup:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .neutral,
                headlineKey: "onboarding.common.cancelledSetupTitle",
                bodyKey: "onboarding.common.cancelledSetupBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.recreateWallet", id: .recreateWallet),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .cancelledVerify:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .neutral,
                headlineKey: "onboarding.common.cancelledVerifyTitle",
                bodyKey: "onboarding.common.cancelledVerifyBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.create.retryVerifyBtn", id: .retryVerify),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .unsupported:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .error,
                headlineKey: "onboarding.common.unsupportedTitle",
                bodyKey: "onboarding.common.unsupportedBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.openBiometricSettings", id: .openBiometricSettings),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .incompatible:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .error,
                headlineKey: "onboarding.common.incompatibleTitle",
                bodyKey: "onboarding.common.incompatibleBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.openCredentialManagerSettings", id: .openCredentialManagerSettings),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .notDiscoverable:
            OutcomeSpec(
                kind: self, scaffoldTitle: .create, badge: .warning,
                headlineKey: "onboarding.common.notDiscoverableTitle",
                bodyKey: "onboarding.common.notDiscoverableBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.recreateWallet", id: .recreateWallet),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.openCredentialManagerSettings", id: .openCredentialManagerSettings),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .accountNotFound:
            OutcomeSpec(
                kind: self, scaffoldTitle: .login, badge: .error,
                headlineKey: "onboarding.common.notFoundTitle",
                bodyKey: "onboarding.common.notFoundBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.login.createNewWalletBtn", id: .createNewWallet),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.editIndexEndpoint", id: .editIndexEndpoint),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .unknown:
            OutcomeSpec(
                kind: self, scaffoldTitle: .shared, badge: .error,
                headlineKey: "onboarding.common.unknownTitle",
                bodyKey: "onboarding.common.unknownBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.retry", id: .retry),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.reportError", id: .reportError),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .recoverOffer:
            OutcomeSpec(
                kind: self, scaffoldTitle: .login, badge: .info,
                headlineKey: "onboarding.login.recoverOfferTitle",
                bodyKey: "onboarding.login.recoverOfferBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.login.recoverConfirm", id: .recoverNow),
                    FlowAction(role: .secondary, labelKey: "onboarding.login.recoverCancel", id: .notNow),
                ]
            )
        case .recoverFailed:
            OutcomeSpec(
                kind: self, scaffoldTitle: .login, badge: .error,
                headlineKey: "onboarding.login.recoverFailedTitle",
                bodyKey: "onboarding.login.recoverFailedBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.retry", id: .retry),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .signInFailed:
            OutcomeSpec(
                kind: self, scaffoldTitle: .login, badge: .error,
                headlineKey: "onboarding.login.alertSignInFailedTitle",
                bodyKey: "onboarding.login.signInFailedBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.common.retry", id: .retry),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.reportError", id: .reportError),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        case .signedIn:
            OutcomeSpec(
                kind: self, scaffoldTitle: .login, badge: .success,
                headlineKey: "onboarding.login.successTitle",
                bodyKey: "onboarding.login.successMessage",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.create.enterWalletBtn", id: .enterWallet),
                ]
            )
        case .loginCancelled:
            OutcomeSpec(
                kind: self, scaffoldTitle: .login, badge: .neutral,
                headlineKey: "onboarding.login.statusCancelledTitle",
                bodyKey: "onboarding.login.statusCancelledBody",
                actions: [
                    FlowAction(role: .primary, labelKey: "onboarding.login.retryLoginBtn", id: .retryLogin),
                    FlowAction(role: .secondary, labelKey: "onboarding.common.back", id: .back),
                ]
            )
        }
    }
}

// MARK: - Create flow

/// The five working steps — mirrors spec-011 `StatusKey`'s working subset;
/// the step index derives from declaration order (data-model §2/§6).
enum CreateStatus: Int, CaseIterable {
    case settingUpIdentity = 1
    case verifyingIdentity
    case extractingKey
    case computingAddress
    case syncingKey

    var statusKey: String {
        switch self {
        case .settingUpIdentity: "onboarding.create.statusSettingUpIdentity"
        case .verifyingIdentity: "onboarding.create.statusVerifyingIdentity"
        case .extractingKey: "onboarding.create.statusExtractingKey"
        case .computingAddress: "onboarding.create.statusComputingAddress"
        case .syncingKey: "onboarding.create.statusSyncingKey"
        }
    }
}

/// Presentation validation rules the model itself carries (data-model §6).
/// Pure functions — no storage, no I/O.
enum FormRules {
    /// Passkey user-name budget the over-length hint keys on. Placeholder
    /// presentation rule until the crux wiring supplies the real one.
    static let nameByteLimit = 64

    static func isTooLong(_ name: String) -> Bool {
        name.utf8.count > nameByteLimit
    }

    /// `can_submit == (!name_too_long && name nonempty && all acks)`.
    static func canSubmit(name: String, nameTooLong: Bool, acks: [Bool]) -> Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !nameTooLong
            && acks.allSatisfy { $0 }
    }
}

/// spec011: `stage: form` (name / name_too_long / acks / can_submit / busy).
struct FormState {
    var name: String = ""
    var nameTooLong: Bool = false
    /// Three acknowledgment rows (design consolidates spec-011's 4 flags).
    var acks: [Bool] = [false, false, false]
    /// spec011 `busy` — reserved; not exercised in this feature.
    var busy: Bool = false

    var canSubmit: Bool {
        FormRules.canSubmit(name: name, nameTooLong: nameTooLong, acks: acks)
    }
}

/// spec011: `stage: working` + `status`; the 1-based step drives the
/// 5-segment bar and the 第 N/5 步 caption.
struct WorkingState {
    let status: CreateStatus
    /// A4 sub-caption 请在系统弹窗中确认 (step 1 only in the mocks).
    var showHint: Bool = false
    /// Some(n) renders the frozen countdown ring (c-variants, > 3 s rule).
    var elapsedSecs: Int? = nil

    var step: Int { status.rawValue }
    var totalSteps: Int { CreateStatus.allCases.count }
}

enum CreatePanelState {
    case form(FormState)
    case working(WorkingState)
    case outcome(OutcomeSpec)
}

// MARK: - Login flow

enum LoginPanelState {
    /// Single partially-filled bar; B1 → nil, B1c → 41.
    case waiting(elapsedSecs: Int?)
    case outcome(OutcomeSpec)
}
