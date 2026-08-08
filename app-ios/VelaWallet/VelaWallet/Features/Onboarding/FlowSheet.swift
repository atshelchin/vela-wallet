//
//  FlowSheet.swift
//  VelaWallet
//
//  The flow container (spec 014, contract §3): scaffold header (title +
//  close ×) over the pattern content, presented as a bottom sheet with a
//  content-height detent (drag indicator visible, bg theme.bgRaised).
//  Also home of the two shared pattern compositions both panels render —
//  ProgressBlock and OutcomeContent — and the FlowStrings resolver.
//

import SwiftUI

// MARK: - String resolution

/// Thin resolver panels use so components only ever see resolved strings
/// (Loc is the single i18n touchpoint; missing keys echo — FR-005).
struct FlowStrings {
    let loc: Loc

    func t(_ key: String) -> String { loc.t(key) }
    func t(_ key: String, vars: [String: String]) -> String { loc.t(key, vars: vars) }

    func actionEntries(for spec: OutcomeSpec) -> [ActionEntry] {
        spec.actions.map { ActionEntry(id: $0.id, role: $0.role, title: loc.t($0.labelKey)) }
    }

    func waitedSeconds(_ seconds: Int) -> String {
        loc.t("onboarding.common.waitedSeconds", vars: ["seconds": "\(seconds)"])
    }
}

// MARK: - Sheet container

/// Scaffold: [system drag indicator] → title + close × → hairline →
/// content. Hugs content height per state via a measured detent; the
/// sheet re-measures when the content grows (disclosure expansion).
struct FlowSheet<Content: View>: View {
    @Environment(\.theme) private var theme
    let title: String
    /// Resolved close label (onboarding.common.close).
    let closeLabel: String
    let onClose: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var contentHeight: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            header

            Rectangle()
                .fill(theme.borderBase)
                .frame(height: Tokens.BorderWidth.hairline)

            content()
                .padding(.horizontal, Tokens.Layout.screenPaddingX)
                .padding(.top, Tokens.Space.s24)
                .padding(.bottom, Tokens.Space.s24)
        }
        .frame(maxWidth: .infinity)
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
        } action: { height in
            contentHeight = height
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(max(contentHeight, 1))])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.bgRaised)
    }

    private var header: some View {
        HStack(spacing: Tokens.Space.s16) {
            Text(title)
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)
            Spacer(minLength: Tokens.Space.s8)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(GlyphFont.control)
                    .foregroundStyle(theme.fgMuted)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(closeLabel)
        }
        .padding(.leading, Tokens.Layout.screenPaddingX)
        .padding(.trailing, Tokens.Space.s12)
        .padding(.top, Tokens.Space.s16)
        .padding(.bottom, Tokens.Space.s8)
    }
}

// MARK: - Progress pattern (create Working + login Waiting)

/// Bar → optional step caption → headline (+ frozen elapsed ring) →
/// optional sub-caption. Both panels use this one composition.
struct ProgressBlock: View {
    @Environment(\.theme) private var theme
    let mode: StepProgress.Mode
    /// 第 N/5 步 — create only.
    var stepCaption: String? = nil
    let headline: String
    /// 请在系统弹窗中确认。/ Face ID hint.
    var hint: String? = nil
    /// Frozen seconds + resolved a11y label (c-variants).
    var elapsed: (seconds: Int, label: String)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StepProgress(mode: mode)

            if let stepCaption {
                Text(stepCaption)
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.fgSubtle)
                    .padding(.top, Tokens.Space.s12)
            }

            HStack(alignment: .center, spacing: Tokens.Space.s16) {
                VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                    Text(headline)
                        .typeRole(Typography.title)
                        .foregroundStyle(theme.fgBase)
                    if let hint {
                        Text(hint)
                            .typeRole(Typography.body)
                            .foregroundStyle(theme.fgMuted)
                    }
                }
                Spacer(minLength: Tokens.Space.s8)
                if let elapsed {
                    ElapsedRing(seconds: elapsed.seconds, a11yLabel: elapsed.label)
                }
            }
            .padding(.top, Tokens.Space.s16)
        }
    }
}

// MARK: - Outcome pattern

/// Badge → headline → body → (address strip) → (footnote) → (技术详情)
/// → action stack. Renders any OutcomeSpec; never branches on the kind
/// except for the success-tinted headline of the created state (A11).
struct OutcomeContent: View {
    @Environment(\.theme) private var theme
    let spec: OutcomeSpec
    let strings: FlowStrings
    let sink: (ActionId) -> Void

    var body: some View {
        VStack(spacing: 0) {
            StatusBadge(variant: spec.badge)
                .padding(.top, Tokens.Space.s16)

            Text(strings.t(spec.headlineKey))
                .typeRole(Typography.title)
                .foregroundStyle(headlineColor)
                .multilineTextAlignment(.center)
                .padding(.top, Tokens.Space.s20)

            Text(strings.t(spec.bodyKey, vars: spec.bodyVars))
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .multilineTextAlignment(.center)
                .padding(.top, Tokens.Space.s8)

            if let address = spec.address {
                AddressStrip(
                    address: address,
                    copyLabel: strings.t("onboarding.common.copyAddress"),
                    copiedLabel: strings.t("onboarding.common.copied"),
                    onCopy: { sink(.copyAddress) }
                )
                .padding(.top, Tokens.Space.s24)
            }

            if let footnoteKey = spec.footnoteKey {
                Text(strings.t(footnoteKey))
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.fgSubtle)
                    .multilineTextAlignment(.center)
                    .padding(.top, Tokens.Space.s16)
            }

            if let details = spec.details {
                Rectangle()
                    .fill(theme.borderBase)
                    .frame(height: Tokens.BorderWidth.hairline)
                    .padding(.horizontal, -Tokens.Layout.screenPaddingX)
                    .padding(.top, Tokens.Space.s24)

                TechDetailsDisclosure(
                    label: strings.t("onboarding.create.technicalDetails"),
                    details: details,
                    initiallyExpanded: spec.detailsExpanded,
                    onToggle: { _ in sink(.toggleDetails) }
                )
            }

            ActionStack(actions: strings.actionEntries(for: spec), onAction: sink)
                .padding(.top, spec.details == nil ? Tokens.Space.s32 : Tokens.Space.s12)
        }
    }

    private var headlineColor: Color {
        spec.kind == .created ? theme.successBase : theme.fgBase
    }
}

#Preview("Flow sheet · outcome") {
    FlowSheet(title: "创建钱包", closeLabel: "关闭", onClose: {}) {
        OutcomeContent(
            spec: {
                var spec = OutcomeKind.server.spec
                spec.details = FlowFixtures.serverDetails
                spec.detailsExpanded = true
                return spec
            }(),
            strings: FlowStrings(loc: Loc()),
            sink: { _ in }
        )
    }
    .background(Tokens.light.bgRaised.color)
    .themed(.light)
}

#Preview("Flow sheet · outcome dark") {
    FlowSheet(title: "创建钱包", closeLabel: "关闭", onClose: {}) {
        OutcomeContent(
            spec: {
                var spec = OutcomeKind.server.spec
                spec.details = FlowFixtures.serverDetails
                return spec
            }(),
            strings: FlowStrings(loc: Loc()),
            sink: { _ in }
        )
    }
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}
