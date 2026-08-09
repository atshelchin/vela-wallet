//
//  GhostAddRow.swift
//  VelaWallet
//
//  GhostAddRow (spec 018 vocabulary #16, mock C4): dashed muted circle with
//  a plus and a muted label (添加成员). Non-raised — it reads as an
//  invitation, not a row of data.
//

import SwiftUI

struct GhostAddRow: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let label: String
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Tokens.Space.s12) {
                Circle()
                    .strokeBorder(
                        theme.borderStrong,
                        style: StrokeStyle(
                            lineWidth: Tokens.BorderWidth.hairline,
                            dash: [ContactsGeometry.ghostDash, ContactsGeometry.ghostDash]
                        )
                    )
                    .frame(width: ContactsGeometry.ghostCircle, height: ContactsGeometry.ghostCircle)
                    .overlay {
                        LucideIcon(.plus, size: LucideIconSize.ghostPlus)
                            .foregroundStyle(theme.fgSubtle)
                    }
                Text(verbatim: label)
                    .typeRole(Typography.body.scaled(textScale))
                    .foregroundStyle(theme.fgMuted)
                    .lineLimit(1)
                Spacer(minLength: Tokens.Space.s12)
            }
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
            .frame(minHeight: ContactsGeometry.memberRowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview("Ghost add row dark") {
    GhostAddRow(label: "添加成员")
        .background(Tokens.dark.bgBase.color)
        .themed(.dark)
        .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("Ghost add row light") {
    GhostAddRow(label: "Add member")
        .themed(.light)
        .environment(\.lucideIconProvider, .previewSafe)
}
