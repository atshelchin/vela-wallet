//
//  AllowanceEditorView.swift
//  VelaWallet
//
//  The approval editor (spec 022 §4, never-unlimited mandate).
//
//  The `requested` chip is DISABLED whenever the request is unlimited — not
//  merely unselected. A wallet that renders "unlimited" as one tap among four
//  has made the dangerous choice the easy one; this one refuses to offer it
//  at all and makes you name a finite number instead.
//

import SwiftUI

struct AllowanceEditorView: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let label: String
    let value: String
    let valueTone: SigningTone
    let chips: [AllowanceChip]
    var note: String?
    var resultingTotal: SigningRow?
    var onChip: (String) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s12) {
            VStack(alignment: .leading, spacing: Tokens.Space.s12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: label)
                        .typeRole(Typography.rowSub.scaled(textScale))
                        .foregroundStyle(theme.fgMuted)
                    Spacer(minLength: Tokens.Space.s12)
                    Text(verbatim: value)
                        .typeRole(Typography.title.scaled(textScale))
                        .foregroundStyle(valueTone == .neutral ? theme.fgBase
                                                               : valueTone.color(theme))
                }

                FlowChips(chips: chips, onChip: onChip)

                if let note {
                    Text(verbatim: note)
                        .typeRole(Typography.rowSub.scaled(textScale))
                        .foregroundStyle(theme.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(Tokens.Space.s16)
            .overlay(
                RoundedRectangle(cornerRadius: Tokens.Radius.r16)
                    .stroke(theme.borderBase, lineWidth: Tokens.BorderWidth.hairline)
            )

            if let resultingTotal {
                SigningRowsView(rows: [resultingTotal])
            }
        }
    }
}

/// The chips, wrapped. Four have to fit a 390pt frame, as they do in the mock.
private struct FlowChips: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let chips: [AllowanceChip]
    let onChip: (String) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Tokens.Space.s8) { chipRow(chips) }
            VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                HStack(spacing: Tokens.Space.s8) { chipRow(Array(chips.prefix(2))) }
                HStack(spacing: Tokens.Space.s8) { chipRow(Array(chips.dropFirst(2))) }
            }
        }
    }

    @ViewBuilder
    private func chipRow(_ chips: [AllowanceChip]) -> some View {
        ForEach(chips) { chip in
            Button {
                onChip(chip.id)
            } label: {
                Text(verbatim: chip.label)
                    .typeRole(Typography.rowSub.scaled(textScale))
                    .foregroundStyle(chip.state == .selected ? theme.accentBase : theme.fgBase)
                    .padding(.horizontal, Tokens.Space.s12)
                    .frame(height: Tokens.Control.sm)
                    .overlay(
                        Capsule().stroke(
                            chip.state == .selected ? theme.accentBase : theme.borderStrong,
                            lineWidth: Tokens.BorderWidth.hairline
                        )
                    )
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(chip.state == .disabled)
            .opacity(chip.state == .disabled ? Tokens.Opacity.disabled : 1)
        }
    }
}
