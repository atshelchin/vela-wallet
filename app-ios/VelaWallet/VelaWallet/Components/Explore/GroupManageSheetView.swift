//
//  GroupManageSheetView.swift
//  VelaWallet
//
//  Group management (mock E3), mirroring the contacts vocabulary spec 018
//  set. System groups (收藏 / 最近的 dApp) can be hidden but never deleted:
//  their trash affordance is ABSENT rather than disabled, because an
//  affordance that is only ever refused is a lie about what is possible.
//

import SwiftUI

struct GroupManageSheetView: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let title: String
    let rows: [GroupManageRow]
    let newGroup: String
    let closeLabel: String
    let hideLabel: String
    let showLabel: String
    let deleteLabel: String
    var onClose: () -> Void = {}
    var onToggle: (String) -> Void = { _ in }
    var onDelete: (String) -> Void = { _ in }
    var onNew: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s0) {
            HStack {
                Text(verbatim: title)
                    .typeRole(Typography.title.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                Spacer()
                Button(action: onClose) {
                    LucideIcon(.close, size: LucideIconSize.menuRow)
                        .foregroundStyle(theme.fgMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(closeLabel)
            }
            .padding(.vertical, Tokens.Space.s16)

            ForEach(rows) { row in
                HStack(spacing: Tokens.Space.s12) {
                    LucideIcon(.gripVertical, size: LucideIconSize.menuRow)
                        .foregroundStyle(theme.fgSubtle)
                    Text(verbatim: row.title)
                        .typeRole(Typography.rowTitle.scaled(textScale))
                        .foregroundStyle(theme.fgBase)
                    if let meta = row.meta {
                        Text(verbatim: meta)
                            .typeRole(Typography.rowSub.scaled(textScale))
                            .foregroundStyle(theme.fgSubtle)
                    }
                    Spacer(minLength: Tokens.Space.s8)
                    Button {
                        onToggle(row.id)
                    } label: {
                        LucideIcon(row.hidden ? .eyeOff : .eye,
                                   size: LucideIconSize.menuRow)
                            .foregroundStyle(theme.fgMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(row.hidden ? showLabel : hideLabel)
                    if !row.system {
                        Button {
                            onDelete(row.id)
                        } label: {
                            LucideIcon(.trash2, size: LucideIconSize.menuRow)
                                .foregroundStyle(theme.fgMuted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(deleteLabel)
                    }
                }
                // Hidden reads as hidden: the row dims, so the eye is a
                // confirmation rather than the only clue.
                .opacity(row.hidden ? Tokens.Opacity.dim : 1)
                .padding(.vertical, Tokens.Space.s16)
                Rectangle().fill(theme.borderBase).frame(height: Tokens.BorderWidth.hairline)
            }

            Button(action: onNew) {
                HStack(spacing: Tokens.Space.s12) {
                    LucideIcon(.plus, size: LucideIconSize.ghostPlus)
                        .foregroundStyle(theme.fgSubtle)
                        .frame(width: Tokens.Space.s32, height: Tokens.Space.s32)
                        .background(theme.bgSunken, in: Circle())
                    Text(verbatim: newGroup)
                        .typeRole(Typography.body.scaled(textScale))
                        .foregroundStyle(theme.fgSubtle)
                    Spacer()
                }
                .padding(.vertical, Tokens.Space.s16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
    }
}
