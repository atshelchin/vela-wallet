//
//  VelaButton.swift
//  VelaWallet
//
//  The single authoritative CTA control. Primary = accent fill (the only
//  accent surface on the welcome screen); secondary = outlined, label in
//  fg.base per DV-001 (the dark mock's muted label fails contrast).
//

import SwiftUI

struct VelaButton: View {
    enum Kind {
        case primary
        case secondary
    }

    let title: String
    let kind: Kind
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).typeRole(Typography.button)
        }
        .buttonStyle(VelaButtonStyle(kind: kind))
        .disabled(!enabled)
        .opacity(enabled ? 1 : Tokens.Opacity.disabled)
    }
}

private struct VelaButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    let kind: VelaButton.Kind

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        return configuration.label
            .foregroundStyle(kind == .primary ? theme.onAccent : theme.fgBase)
            .frame(maxWidth: .infinity)
            .frame(height: Tokens.Control.lg)
            .background {
                switch kind {
                case .primary:
                    Capsule().fill(theme.accentBase)
                case .secondary:
                    Capsule().strokeBorder(theme.borderStrong, lineWidth: Tokens.BorderWidth.hairline)
                }
            }
            .opacity(pressed ? Interaction.pressedOpacity : 1)
            .animation(.easeOut(duration: Tokens.Motion.fast), value: pressed)
    }
}

/// Interaction-state constants the export does not name — licensed by
/// design-system.md (`opacity.*` engineering tokens; web's opacity-hover
/// addition is the same move).
enum Interaction {
    static let pressedOpacity: Double = 0.8
}

#Preview("Buttons") {
    VStack(spacing: 16) {
        VelaButton(title: "Create Wallet", kind: .primary) {}
        VelaButton(title: "I already have a wallet", kind: .secondary) {}
        VelaButton(title: "Disabled", kind: .primary, enabled: false) {}
    }
    .padding(24)
    .themed(.light)
}

#Preview("Buttons dark") {
    VStack(spacing: 16) {
        VelaButton(title: "创建钱包", kind: .primary) {}
        VelaButton(title: "我已有钱包", kind: .secondary) {}
    }
    .padding(24)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}
