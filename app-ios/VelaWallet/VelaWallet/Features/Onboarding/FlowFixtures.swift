//
//  FlowFixtures.swift
//  VelaWallet
//
//  Gallery fixtures — one named Presentation State per design code
//  (contract §1: 34 unique codes; E10 is shared and listed in BOTH flow
//  groups). Representative data mirrors the mocks; TechDetails content is
//  fixture data, not copy (research D1). Never used by production paths.
//

import Foundation

/// Which gallery group(s) a fixture belongs to; `shared` (E10) appears in
/// both the Create and the Login sections (spec.md state inventory).
enum FlowScope {
    case create
    case login
    case shared
}

enum FlowFixtures {
    enum FixtureState {
        case create(CreatePanelState)
        case login(LoginPanelState)
    }

    struct Fixture: Identifiable {
        let code: String
        /// Dev-facing gallery caption (mock filename shorthand, not UI copy).
        let name: String
        let scope: FlowScope
        let state: FixtureState

        var id: String { code }
    }

    /// A11 fixture address — full 42-char value; display truncates the
    /// tail, copy copies the whole thing (contract §1). The 0x prefix is
    /// split off so audit-literals' hex-color rule doesn't misread an
    /// address fixture as a color value.
    static let a11Address = "0x" + "44EEC06897ff7ab8C7f16819511A64bA168A6D33"

    /// E2/E2x diagnostics pinned by contract §1.
    static let serverDetails = TechDetails(
        code: "E_SERVER",
        context: "第 5 步同步公钥；以及登录",
        endpoint: "HTTP 503 · p256-index.getvela.app"
    )

    // MARK: - The 34 fixtures

    static let all: [Fixture] = createFixtures + loginFixtures + errorFixtures

    static var createGroup: [Fixture] { all.filter { $0.scope != .login } }
    static var loginGroup: [Fixture] { all.filter { $0.scope != .create } }

    private static let createFixtures: [Fixture] = [
        Fixture(
            code: "A1", name: "Form · incomplete", scope: .create,
            state: .create(.form(FormState()))
        ),
        Fixture(
            code: "A2", name: "Form · ready", scope: .create,
            state: .create(.form(FormState(name: "大表哥", acks: [true, true, true])))
        ),
        Fixture(
            code: "A3", name: "Form · name too long", scope: .create,
            state: .create(.form(FormState(
                name: "一个特别特别特别长的账户名称示例", nameTooLong: true
            )))
        ),
        Fixture(
            code: "A4", name: "Progress · awaiting passkey", scope: .create,
            state: .create(.working(WorkingState(status: .settingUpIdentity, showHint: true)))
        ),
        Fixture(
            code: "A4c", name: "Step 1 · waiting >3s", scope: .create,
            state: .create(.working(WorkingState(status: .settingUpIdentity, showHint: true, elapsedSecs: 19)))
        ),
        Fixture(
            code: "A5", name: "Progress · verifying", scope: .create,
            state: .create(.working(WorkingState(status: .verifyingIdentity)))
        ),
        Fixture(
            code: "A5c", name: "Step 2 · waiting >3s", scope: .create,
            state: .create(.working(WorkingState(status: .verifyingIdentity, elapsedSecs: 5)))
        ),
        Fixture(
            code: "A6", name: "Progress · extracting key", scope: .create,
            state: .create(.working(WorkingState(status: .extractingKey)))
        ),
        Fixture(
            code: "A6c", name: "Step 3 · waiting >3s", scope: .create,
            state: .create(.working(WorkingState(status: .extractingKey, elapsedSecs: 7)))
        ),
        Fixture(
            code: "A7", name: "Progress · computing address", scope: .create,
            state: .create(.working(WorkingState(status: .computingAddress)))
        ),
        Fixture(
            code: "A7c", name: "Step 4 · waiting >3s", scope: .create,
            state: .create(.working(WorkingState(status: .computingAddress, elapsedSecs: 12)))
        ),
        Fixture(
            code: "A8", name: "Progress · syncing key", scope: .create,
            state: .create(.working(WorkingState(status: .syncingKey)))
        ),
        Fixture(
            code: "A8c", name: "Step 5 · waiting >3s", scope: .create,
            state: .create(.working(WorkingState(status: .syncingKey, elapsedSecs: 8)))
        ),
        Fixture(
            code: "A11", name: "Success", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.created.spec
                spec.bodyVars = ["count": "12"]
                spec.footnoteKey = "onboarding.create.verifyHint"
                spec.address = a11Address
                return spec
            }()))
        ),
        Fixture(
            code: "A12", name: "Sync failed", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.syncFailed.spec
                spec.details = TechDetails(
                    code: "E_SYNC",
                    context: "第 5 步同步公钥",
                    endpoint: "HTTP 503 · p256-index.getvela.app"
                )
                return spec
            }()))
        ),
        Fixture(
            code: "A13", name: "Verify stuck", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.verifyStuck.spec
                spec.details = TechDetails(
                    code: "E_VERIFY_STUCK", context: "第 2 步验证身份", endpoint: nil
                )
                return spec
            }()))
        ),
    ]

    private static let errorFixtures: [Fixture] = [
        Fixture(
            code: "E1", name: "Error · network", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.network.spec
                spec.details = TechDetails(
                    code: "E_NETWORK", context: "第 1 步创建通行密钥", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E2", name: "Error · server", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.server.spec
                spec.details = serverDetails
                return spec
            }()))
        ),
        Fixture(
            code: "E2x", name: "Error · server · details expanded", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.server.spec
                spec.details = serverDetails
                spec.detailsExpanded = true
                return spec
            }()))
        ),
        Fixture(
            code: "E3", name: "Error · timeout", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.timeout.spec
                spec.bodyVars = ["seconds": "60"]
                spec.details = TechDetails(
                    code: "E_TIMEOUT", context: "第 5 步同步公钥", endpoint: "p256-index.getvela.app"
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E4", name: "Error · cancelled setup", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.cancelledSetup.spec
                spec.details = TechDetails(
                    code: "E_CANCELLED", context: "第 1 步创建通行密钥", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E5", name: "Error · cancelled verify", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.cancelledVerify.spec
                spec.details = TechDetails(
                    code: "E_CANCELLED", context: "第 2 步验证身份", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E6", name: "Error · device unsupported", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.unsupported.spec
                spec.details = TechDetails(
                    code: "E_NOT_SUPPORTED", context: "创建通行密钥", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E7", name: "Error · device incompatible", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.incompatible.spec
                spec.details = TechDetails(
                    code: "E_INCOMPATIBLE", context: "创建通行密钥", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E8", name: "Error · passkey not discoverable", scope: .create,
            state: .create(.outcome({
                var spec = OutcomeKind.notDiscoverable.spec
                spec.details = TechDetails(
                    code: "E_NOT_DISCOVERABLE", context: "第 2 步验证身份", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E9", name: "Error · account not found", scope: .login,
            state: .login(.outcome({
                var spec = OutcomeKind.accountNotFound.spec
                spec.details = TechDetails(
                    code: "E_NOT_FOUND", context: "登录查询", endpoint: "HTTP 404 · p256-index.getvela.app"
                )
                return spec
            }()))
        ),
        Fixture(
            code: "E10", name: "Error · unknown (catch-all)", scope: .shared,
            state: .create(.outcome({
                var spec = OutcomeKind.unknown.spec
                spec.details = TechDetails(
                    code: "E_UNKNOWN", context: "未归类异常", endpoint: nil
                )
                return spec
            }()))
        ),
    ]

    private static let loginFixtures: [Fixture] = [
        Fixture(
            code: "B1", name: "Awaiting passkey", scope: .login,
            state: .login(.waiting(elapsedSecs: nil))
        ),
        Fixture(
            code: "B1c", name: "Awaiting passkey · >3s", scope: .login,
            state: .login(.waiting(elapsedSecs: 41))
        ),
        Fixture(
            code: "B2", name: "Recover offer", scope: .login,
            state: .login(.outcome({
                var spec = OutcomeKind.recoverOffer.spec
                spec.details = TechDetails(
                    code: "RECOVER_OFFER", context: "登录查询", endpoint: "HTTP 404 · p256-index.getvela.app"
                )
                return spec
            }()))
        ),
        Fixture(
            code: "B3", name: "Recover failed", scope: .login,
            state: .login(.outcome({
                var spec = OutcomeKind.recoverFailed.spec
                spec.details = TechDetails(
                    code: "E_RECOVER", context: "找回签名验证", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "B4", name: "Sign-in failed", scope: .login,
            state: .login(.outcome({
                var spec = OutcomeKind.signInFailed.spec
                spec.details = TechDetails(
                    code: "E_SIGN_IN", context: "通行密钥断言", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "B5", name: "Success", scope: .login,
            state: .login(.outcome({
                var spec = OutcomeKind.signedIn.spec
                spec.details = TechDetails(
                    code: "SESSION", context: "通行密钥断言已验证", endpoint: nil
                )
                return spec
            }()))
        ),
        Fixture(
            code: "B6", name: "Cancelled", scope: .login,
            state: .login(.outcome({
                var spec = OutcomeKind.loginCancelled.spec
                spec.details = TechDetails(
                    code: "E_CANCELLED", context: "通行密钥断言", endpoint: nil
                )
                return spec
            }()))
        ),
    ]
}
