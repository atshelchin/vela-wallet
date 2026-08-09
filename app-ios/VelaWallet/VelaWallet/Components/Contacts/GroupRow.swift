//
//  GroupRow.swift
//  VelaWallet
//
//  GroupRow (spec 018 vocabulary #2, mock C1): leading rounded-square tile
//  with the users-round glyph, group name, trailing `N 人` + chevron.
//

import SwiftUI

struct GroupRow: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: GroupRowModel
    var selected: Bool = false
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Tokens.Space.s12) {
                RoundedRectangle(cornerRadius: ContactsGeometry.groupTileRadius)
                    .fill(theme.bgRaised)
                    .frame(width: ContactsGeometry.groupTile, height: ContactsGeometry.groupTile)
                    .overlay {
                        LucideIcon(.usersRound, size: LucideIconSize.groupTileGlyph)
                            .foregroundStyle(theme.fgMuted)
                    }
                Text(verbatim: model.name)
                    .typeRole(Typography.rowTitle.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                    .lineLimit(1)
                Spacer(minLength: Tokens.Space.s12)
                Text(verbatim: model.countLabel)
                    .typeRole(Typography.rowSub.scaled(textScale))
                    .foregroundStyle(theme.fgMuted)
                    .lineLimit(1)
                LucideIcon(.chevronRight, size: LucideIconSize.smallChevron)
                    .foregroundStyle(theme.fgSubtle)
            }
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
            .frame(minHeight: ContactsGeometry.groupRowHeight)
            .background(selected ? theme.bgRaised : theme.bgBase)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

#Preview("Group rows dark") {
    VStack(spacing: Tokens.Space.s0) {
        GroupRow(model: GroupRowModel(name: "家人", countLabel: "3 人"))
        GroupRow(model: GroupRowModel(name: "工作", countLabel: "5 人"), selected: true)
        GroupRow(model: GroupRowModel(name: "交易所", countLabel: "2 人"))
    }
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
    .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("Group rows light") {
    VStack(spacing: Tokens.Space.s0) {
        GroupRow(model: GroupRowModel(name: "Family", countLabel: "3 people"))
        GroupRow(model: GroupRowModel(name: "Work", countLabel: "5 people"))
    }
    .themed(.light)
    .environment(\.lucideIconProvider, .previewSafe)
}
