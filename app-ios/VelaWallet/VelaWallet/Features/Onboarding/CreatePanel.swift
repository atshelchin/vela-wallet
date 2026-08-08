//
//  CreatePanel.swift
//  VelaWallet
//
//  Create-flow panel (spec 014): renders any CreatePanelState by
//  composing the pattern components — no inline pattern layout (FR-006).
//  Interactivity is local visual state only (FR-011); presses emit
//  ActionIds to the host sink.
//

import SwiftUI

struct CreatePanel: View {
    let loc: Loc
    let state: CreatePanelState
    let sink: (ActionId) -> Void

    private var strings: FlowStrings { FlowStrings(loc: loc) }

    var body: some View {
        switch state {
        case .form(let form):
            CreateFormView(strings: strings, initial: form, sink: sink)
        case .working(let working):
            ProgressBlock(
                mode: .stepped(current: working.step, total: working.totalSteps),
                stepCaption: strings.t(
                    "onboarding.common.stepCounter",
                    vars: ["current": "\(working.step)", "total": "\(working.totalSteps)"]
                ),
                headline: strings.t(working.status.statusKey),
                hint: working.showHint ? strings.t("onboarding.common.confirmInPrompt") : nil,
                elapsed: working.elapsedSecs.map { ($0, strings.waitedSeconds($0)) }
            )
        case .outcome(let spec):
            OutcomeContent(spec: spec, strings: strings, sink: sink)
        }
    }

    /// Scaffold title for the container hosting this state (contract §3).
    static func scaffoldTitleKey(for state: CreatePanelState) -> String {
        switch state {
        case .form, .working: ScaffoldTitle.create.key
        case .outcome(let spec): spec.scaffoldTitle.key
        }
    }
}

/// Form pattern (A1–A3): name field → 3 ack rows → primary CTA. Local
/// state seeds from the fixture; typing re-derives the over-length hint
/// and checkbox toggles re-derive CTA enablement (FR-011 scope).
private struct CreateFormView: View {
    let strings: FlowStrings
    let sink: (ActionId) -> Void

    @State private var name: String
    @State private var nameTooLong: Bool
    @State private var acks: [Bool]

    init(strings: FlowStrings, initial: FormState, sink: @escaping (ActionId) -> Void) {
        self.strings = strings
        self.sink = sink
        _name = State(initialValue: initial.name)
        _nameTooLong = State(initialValue: initial.nameTooLong)
        _acks = State(initialValue: initial.acks)
    }

    private var canSubmit: Bool {
        FormRules.canSubmit(name: name, nameTooLong: nameTooLong, acks: acks)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NameField(
                label: strings.t("onboarding.create.accountNameLabel"),
                placeholder: strings.t("onboarding.create.accountNamePlaceholder"),
                helper: strings.t("onboarding.create.accountNameHint"),
                tooLongText: strings.t("onboarding.create.nameTooLong"),
                text: $name,
                tooLong: nameTooLong
            )
            .onChange(of: name) { _, newValue in
                nameTooLong = FormRules.isTooLong(newValue)
            }

            VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                AckRow(
                    segments: [AckSegment(text: strings.t("onboarding.create.ack0"))],
                    checked: ackBinding(0)
                )
                AckRow(
                    segments: [AckSegment(text: strings.t("onboarding.create.ack1"))],
                    checked: ackBinding(1)
                )
                AckRow(
                    segments: [
                        AckSegment(text: strings.t("onboarding.create.ack3") + " "),
                        AckSegment(text: strings.t("onboarding.create.ack3PrivacyPolicy"), action: .openPrivacyPolicy),
                        AckSegment(text: " " + strings.t("onboarding.create.ack3And") + " "),
                        AckSegment(text: strings.t("onboarding.create.ack3Terms"), action: .openTerms),
                        AckSegment(text: strings.t("onboarding.create.ack3Period")),
                    ],
                    checked: ackBinding(2),
                    onLink: sink
                )
            }
            .padding(.top, Tokens.Space.s24)

            VelaButton(
                title: strings.t("onboarding.create.createWalletBtn"),
                kind: .primary,
                enabled: canSubmit
            ) {
                sink(.submitCreate)
            }
            .padding(.top, Tokens.Space.s32)
        }
    }

    private func ackBinding(_ index: Int) -> Binding<Bool> {
        Binding(
            get: { acks.indices.contains(index) ? acks[index] : false },
            set: { newValue in
                if acks.indices.contains(index) { acks[index] = newValue }
            }
        )
    }
}

#Preview("Create form") {
    ScrollView {
        CreatePanel(loc: Loc(), state: .form(FormState()), sink: { _ in })
            .padding(Tokens.Space.s24)
    }
    .themed(.light)
}

#Preview("Create form dark") {
    ScrollView {
        CreatePanel(
            loc: Loc(),
            state: .form(FormState(name: "大表哥", acks: [true, true, true])),
            sink: { _ in }
        )
        .padding(Tokens.Space.s24)
    }
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}

#Preview("Create working dark") {
    CreatePanel(
        loc: Loc(),
        state: .working(WorkingState(status: .settingUpIdentity, showHint: true, elapsedSecs: 19)),
        sink: { _ in }
    )
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}
