//
//  GroupChips.swift
//  VelaWallet
//
//  GroupChips (spec 018 vocabulary #10, mock C2): one filled pill per group
//  membership plus a trailing outlined `+ 分组` add chip. Wraps when a
//  contact belongs to several groups (spec edge case).
//

import SwiftUI

struct GroupChips: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let chips: [String]
    /// Label of the trailing add chip (分组 — rendered with a leading +).
    let addLabel: String
    var onAdd: () -> Void = {}

    var body: some View {
        // ViewThatFits keeps the single-group mock on one row and lets a
        // multi-group contact wrap onto a second (spec edge case).
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Tokens.Space.s8) { allChips }
            VStack(spacing: Tokens.Space.s8) {
                HStack(spacing: Tokens.Space.s8) { membershipChips }
                addChip
            }
        }
    }

    @ViewBuilder private var allChips: some View {
        membershipChips
        addChip
    }

    @ViewBuilder private var membershipChips: some View {
        ForEach(chips, id: \.self) { chip in
            label(chip)
                .foregroundStyle(theme.fgMuted)
                .background(Capsule().fill(theme.bgRaised))
        }
    }

    private var addChip: some View {
        Button(action: onAdd) {
            HStack(spacing: Tokens.Space.s4) {
                LucideIcon(.plus, size: LucideIconSize.chipPlus)
                Text(verbatim: addLabel)
                    .typeRole(Typography.chip.scaled(textScale))
                    .lineLimit(1)
            }
            .foregroundStyle(theme.fgMuted)
            .padding(.horizontal, Tokens.Space.s12)
            .frame(minHeight: ContactsGeometry.chipHeight)
            .background(Capsule().strokeBorder(theme.borderStrong, lineWidth: Tokens.BorderWidth.hairline))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func label(_ text: String) -> some View {
        Text(verbatim: text)
            .typeRole(Typography.chip.scaled(textScale))
            .lineLimit(1)
            .padding(.horizontal, Tokens.Space.s12)
            .frame(minHeight: ContactsGeometry.chipHeight)
    }
}

#Preview("Group chips dark") {
    VStack(spacing: Tokens.Space.s16) {
        GroupChips(chips: ["家人"], addLabel: "分组")
        GroupChips(chips: ["家人", "工作", "交易所"], addLabel: "分组")
    }
    .padding(Tokens.Space.s24)
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
    .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("Group chips light") {
    GroupChips(chips: ["Family"], addLabel: "Groups")
        .padding(Tokens.Space.s24)
        .themed(.light)
        .environment(\.lucideIconProvider, .previewSafe)
}
