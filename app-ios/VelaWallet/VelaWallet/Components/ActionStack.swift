//
//  ActionStack.swift
//  VelaWallet
//
//  The single authoritative outcome action stack (spec 014): one primary
//  CTA (the existing VelaButton) followed by up to two secondaries styled
//  as the mock's dark solid rows — NOT the outlined welcome-secondary
//  style (contract §5). Presses emit ActionIds only; the host decides.
//

import SwiftUI

/// One resolved, renderable action: components take resolved strings.
struct ActionEntry: Identifiable {
    let id: ActionId
    let role: ActionRole
    let title: String
}

struct ActionStack: View {
    let actions: [ActionEntry]
    let onAction: (ActionId) -> Void

    var body: some View {
        VStack(spacing: FlowGeometry.actionGap) {
            ForEach(actions) { entry in
                switch entry.role {
                case .primary:
                    VelaButton(title: entry.title, kind: .primary) {
                        onAction(entry.id)
                    }
                case .secondary:
                    SecondaryRowButton(title: entry.title) {
                        onAction(entry.id)
                    }
                }
            }
        }
    }
}

/// The mock's dark filled secondary row: full width, control.lg height,
/// sunken fill with a hairline for light-theme definition.
private struct SecondaryRowButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).typeRole(Typography.button)
        }
        .buttonStyle(SecondaryRowStyle())
    }
}

private struct SecondaryRowStyle: ButtonStyle {
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        // minHeight, not a fixed height: long-locale labels wrap centered and
        // grow the row instead of being clipped (spec 014 long-label fix).
        return configuration.label
            .foregroundStyle(theme.fgBase)
            .multilineTextAlignment(.center)
            .padding(.horizontal, Tokens.Space.s24)
            .padding(.vertical, Tokens.Space.s8)
            .frame(maxWidth: .infinity)
            .frame(minHeight: FlowGeometry.actionRowHeight)
            .background {
                RoundedRectangle(cornerRadius: Tokens.Radius.r16)
                    .fill(theme.bgSunken)
                RoundedRectangle(cornerRadius: Tokens.Radius.r16)
                    .strokeBorder(theme.borderBase, lineWidth: Tokens.BorderWidth.hairline)
            }
            .opacity(pressed ? Interaction.pressedOpacity : 1)
            .animation(.easeOut(duration: Tokens.Motion.fast), value: pressed)
    }
}

#Preview("Action stack") {
    ActionStack(
        actions: [
            ActionEntry(id: .retry, role: .primary, title: "重试"),
            ActionEntry(id: .editIndexEndpoint, role: .secondary, title: "修改索引服务地址"),
            ActionEntry(id: .reportError, role: .secondary, title: "上报这个错误"),
        ],
        onAction: { _ in }
    )
    .padding(Tokens.Space.s24)
    .themed(.light)
}

#Preview("Action stack dark") {
    ActionStack(
        actions: [
            ActionEntry(id: .retry, role: .primary, title: "重试"),
            ActionEntry(id: .editIndexEndpoint, role: .secondary, title: "修改索引服务地址"),
            ActionEntry(id: .reportError, role: .secondary, title: "上报这个错误"),
        ],
        onAction: { _ in }
    )
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgRaised.color)
    .themed(.dark)
}
