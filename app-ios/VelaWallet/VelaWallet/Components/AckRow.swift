//
//  AckRow.swift
//  VelaWallet
//
//  The single authoritative acknowledgment row (spec 014): hairline
//  checkbox + wrapping text with optional inline links. Links are
//  individually activatable and wrap with the text (the spec-011 e2e
//  click-target lesson) — they emit ActionIds without toggling the box.
//

import SwiftUI

/// One run of ack-row text; `action != nil` renders it as an inline link.
struct AckSegment {
    let text: String
    var action: ActionId? = nil
}

struct AckRow: View {
    @Environment(\.theme) private var theme
    let segments: [AckSegment]
    @Binding var checked: Bool
    var onLink: (ActionId) -> Void = { _ in }

    private var hasLinks: Bool { segments.contains { $0.action != nil } }
    private var fullText: String { segments.map(\.text).joined() }

    var body: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s12) {
            checkbox
            Text(attributed)
                .typeRole(Typography.flowCaption)
                .foregroundStyle(theme.fgMuted)
                .tint(theme.accentBase)
                .environment(\.openURL, OpenURLAction { url in
                    if let id = ActionId(rawValue: url.lastPathComponent) {
                        onLink(id)
                    }
                    return .handled
                })
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        // Row-wide toggling only when no inline links compete for taps;
        // link rows toggle via the checkbox itself.
        .onTapGesture {
            if !hasLinks { checked.toggle() }
        }
    }

    private var checkbox: some View {
        Button {
            checked.toggle()
        } label: {
            ZStack {
                if checked {
                    RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                        .fill(theme.accentBase)
                    Image(systemName: "checkmark")
                        .font(GlyphFont.checkbox)
                        .foregroundStyle(theme.onAccent)
                } else {
                    RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                        .strokeBorder(theme.borderStrong, lineWidth: Tokens.BorderWidth.hairline)
                }
            }
            .frame(width: FlowGeometry.checkboxSize, height: FlowGeometry.checkboxSize)
            // Keep the glyph box at mock size; grow the tap surface.
            .padding(Tokens.Space.s4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, -Tokens.Space.s4)
        .padding(.leading, -Tokens.Space.s4)
        .accessibilityLabel(fullText)
        .accessibilityValue(Text(verbatim: checked ? "1" : "0"))
        .accessibilityAddTraits(checked ? [.isSelected] : [])
    }

    private var attributed: AttributedString {
        var result = AttributedString()
        for segment in segments {
            var part = AttributedString(segment.text)
            if let action = segment.action {
                part.link = URL(string: "vela-flow://action/\(action.rawValue)")
                part.foregroundColor = theme.accentBase
            }
            result += part
        }
        return result
    }
}

#Preview("Ack rows") {
    struct Host: View {
        @State private var first = false
        @State private var second = true
        var body: some View {
            VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                AckRow(
                    segments: [AckSegment(text: "如果您丢失设备，可以通过 iCloud 或 Google 账户在新设备上恢复钱包。")],
                    checked: $first
                )
                AckRow(
                    segments: [
                        AckSegment(text: "我同意 "),
                        AckSegment(text: "隐私政策", action: .openPrivacyPolicy),
                        AckSegment(text: " 和 "),
                        AckSegment(text: "服务条款", action: .openTerms),
                        AckSegment(text: "。"),
                    ],
                    checked: $second
                )
            }
            .padding(Tokens.Space.s24)
        }
    }
    return Host().themed(.light)
}

#Preview("Ack rows dark") {
    struct Host: View {
        @State private var first = true
        @State private var second = false
        var body: some View {
            VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                AckRow(
                    segments: [AckSegment(text: "如果您丢失设备，可以通过 iCloud 或 Google 账户在新设备上恢复钱包。")],
                    checked: $first
                )
                AckRow(
                    segments: [
                        AckSegment(text: "我同意 "),
                        AckSegment(text: "隐私政策", action: .openPrivacyPolicy),
                        AckSegment(text: " 和 "),
                        AckSegment(text: "服务条款", action: .openTerms),
                        AckSegment(text: "。"),
                    ],
                    checked: $second
                )
            }
            .padding(Tokens.Space.s24)
        }
    }
    return Host()
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
}
