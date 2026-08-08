//
//  LoginPanel.swift
//  VelaWallet
//
//  Login-flow panel (spec 014): waiting = single partially-filled bar +
//  headline + Face ID hint (B1/B1c); outcomes render through the shared
//  OutcomeContent. Composition only — no inline pattern layout (FR-006).
//

import SwiftUI

struct LoginPanel: View {
    let loc: Loc
    let state: LoginPanelState
    let sink: (ActionId) -> Void

    private var strings: FlowStrings { FlowStrings(loc: loc) }

    var body: some View {
        switch state {
        case .waiting(let elapsedSecs):
            ProgressBlock(
                mode: .single(fill: FlowGeometry.loginBarFill),
                headline: strings.t("onboarding.login.statusAwaitingPasskey"),
                hint: strings.t("onboarding.login.statusAwaitingPasskeyHint"),
                elapsed: elapsedSecs.map { ($0, strings.waitedSeconds($0)) }
            )
        case .outcome(let spec):
            OutcomeContent(spec: spec, strings: strings, sink: sink)
        }
    }

    /// Scaffold title for the container hosting this state (contract §3).
    static func scaffoldTitleKey(for state: LoginPanelState) -> String {
        switch state {
        case .waiting: ScaffoldTitle.login.key
        case .outcome(let spec): spec.scaffoldTitle.key
        }
    }
}

#Preview("Login waiting") {
    LoginPanel(loc: Loc(), state: .waiting(elapsedSecs: nil), sink: { _ in })
        .padding(Tokens.Space.s24)
        .themed(.light)
}

#Preview("Login waiting dark") {
    LoginPanel(loc: Loc(), state: .waiting(elapsedSecs: 41), sink: { _ in })
        .padding(Tokens.Space.s24)
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
}

#Preview("Login outcome dark") {
    LoginPanel(loc: Loc(), state: .outcome(OutcomeKind.recoverOffer.spec), sink: { _ in })
        .padding(Tokens.Space.s24)
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
}
