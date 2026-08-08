//
//  TechDetails.swift
//  VelaWallet
//
//  The single authoritative 技术详情 disclosure (spec 014 / FR-004):
//  collapsed by default, expands in place to a code block on the sunken
//  surface — error-colored code line, muted context line, subtle mono
//  endpoint line (E2x). Toggling emits `toggle_details` to the sink.
//

import SwiftUI

struct TechDetailsDisclosure: View {
    @Environment(\.theme) private var theme
    /// Resolved 技术详情 label (components take resolved strings).
    let label: String
    let details: TechDetails
    let onToggle: (Bool) -> Void
    @State private var expanded: Bool

    init(
        label: String,
        details: TechDetails,
        initiallyExpanded: Bool = false,
        onToggle: @escaping (Bool) -> Void = { _ in }
    ) {
        self.label = label
        self.details = details
        self.onToggle = onToggle
        _expanded = State(initialValue: initiallyExpanded)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s12) {
            Button {
                withAnimation(.easeOut(duration: Tokens.Motion.base)) {
                    expanded.toggle()
                }
                onToggle(expanded)
            } label: {
                HStack {
                    Text(label)
                        .typeRole(Typography.body)
                        .foregroundStyle(theme.fgMuted)
                    Spacer(minLength: Tokens.Space.s8)
                    Image(systemName: "chevron.down")
                        .font(GlyphFont.control)
                        .foregroundStyle(theme.fgSubtle)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .frame(minHeight: Tokens.Layout.hitTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityValue(Text(verbatim: expanded ? "▾" : "▸"))

            if expanded {
                VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                    Text(details.code)
                        .typeRole(Typography.monoSmall)
                        .foregroundStyle(theme.errorBase)
                    Text(details.context)
                        .typeRole(Typography.caption)
                        .foregroundStyle(theme.fgMuted)
                    if let endpoint = details.endpoint {
                        Text(endpoint)
                            .typeRole(Typography.monoSmall)
                            .foregroundStyle(theme.fgSubtle)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Tokens.Space.s16)
                .background {
                    RoundedRectangle(cornerRadius: Tokens.Radius.r12)
                        .fill(theme.bgSunken)
                }
            }
        }
    }
}

private let previewDetails = TechDetails(
    code: "E_SERVER",
    context: "第 5 步同步公钥；以及登录",
    endpoint: "HTTP 503 · p256-index.getvela.app"
)

#Preview("Tech details") {
    VStack(spacing: Tokens.Space.s24) {
        TechDetailsDisclosure(label: "技术详情", details: previewDetails)
        TechDetailsDisclosure(label: "技术详情", details: previewDetails, initiallyExpanded: true)
    }
    .padding(Tokens.Space.s24)
    .themed(.light)
}

#Preview("Tech details dark") {
    VStack(spacing: Tokens.Space.s24) {
        TechDetailsDisclosure(label: "技术详情", details: previewDetails)
        TechDetailsDisclosure(label: "技术详情", details: previewDetails, initiallyExpanded: true)
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}
