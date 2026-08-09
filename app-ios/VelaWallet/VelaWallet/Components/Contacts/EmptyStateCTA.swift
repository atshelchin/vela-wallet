//
//  EmptyStateCTA.swift
//  VelaWallet
//
//  EmptyState + CTA slot (spec 018 vocabulary #14, mock C3): the spec-015
//  empty-state anatomy — outline icon tile, title, caption — extended with
//  a stacked CTA pair (accent 添加联系人 + outline 从文件导入). The buttons
//  are the one authoritative CTA control (VelaButton); the artwork tile is
//  the contacts-specific extension the 015 component does not carry.
//

import SwiftUI

struct EmptyStateCTA: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: EmptyCTAModel
    var onPrimary: () -> Void = {}
    var onSecondary: () -> Void = {}

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            Circle()
                .strokeBorder(theme.borderBase, lineWidth: Tokens.BorderWidth.hairline)
                .frame(width: ContactsGeometry.emptyTile, height: ContactsGeometry.emptyTile)
                .overlay {
                    LucideIcon(.usersRound, size: LucideIconSize.empty)
                        .foregroundStyle(theme.fgSubtle)
                }
            Text(verbatim: model.title)
                .typeRole(Typography.title.scaled(textScale))
                .foregroundStyle(theme.fgBase)
                .padding(.top, Tokens.Space.s20)
            Text(verbatim: model.caption)
                .typeRole(Typography.body.scaled(textScale))
                .foregroundStyle(theme.fgMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Tokens.Space.s8)

            VelaButton(title: model.primary, kind: .primary, action: onPrimary)
                .padding(.top, Tokens.Space.s32)
            VelaButton(title: model.secondary, kind: .secondary, action: onSecondary)
                .padding(.top, Tokens.Space.s12)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
    }
}

#Preview("Empty CTA dark") {
    EmptyStateCTA(model: EmptyCTAModel(
        title: "还没有联系人",
        caption: "添加常用地址，转账时不再反复粘贴。也可以从文件导入现有通讯录。",
        primary: "添加联系人",
        secondary: "从文件导入"
    ))
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
    .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("Empty CTA light · search empty") {
    EmptyStateCTA(model: ContactsFixtures.searchEmpty(loc: ContactsPreviewData.loc, query: "zzz"))
        .themed(.light)
        .environment(\.lucideIconProvider, .previewSafe)
}
