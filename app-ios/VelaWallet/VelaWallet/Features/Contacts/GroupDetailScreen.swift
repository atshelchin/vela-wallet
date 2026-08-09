//
//  GroupDetailScreen.swift
//  VelaWallet
//
//  Mobile group detail (spec 018 FR-002, mocks C4 / C6): back chevron + ⋯,
//  large group title with the member count, member rows (the ContactRow
//  member variant), the ghost 添加成员 row, and the bottom-pinned 群发转账
//  CTA with its caption. The ⋯ button raises the group ActionMenuSheet (C6).
//

import SwiftUI

struct GroupDetailScreen: View {
    @Environment(\.theme) private var theme

    let model: GroupDetailModel
    var onBack: () -> Void = {}
    var onOpenMember: (ContactModel) -> Void = { _ in }

    @State private var sheetShown = false

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s0) {
                    title
                    membersBlock
                        .padding(.top, Tokens.Space.s16)
                    GhostAddRow(label: model.addMemberLabel)
                }
                .padding(.bottom, Tokens.Space.s24)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            PinnedCTABar(title: model.ctaLabel, caption: model.ctaCaption, enabled: model.ctaEnabled)
                .padding(.bottom, Tokens.Space.s8)
        }
        .background(theme.bgBase.ignoresSafeArea())
        .environment(\.walletTextScale, model.textScale)
        .sheet(isPresented: $sheetShown) {
            if let sheet = model.sheet {
                ActionMenuSheet(model: sheet, onItem: { _ in }, onCancel: { sheetShown = false })
                    .environment(\.walletTextScale, model.textScale)
            }
        }
        .onAppear { sheetShown = model.sheet != nil }
    }

    private var navBar: some View {
        HStack(spacing: Tokens.Space.s12) {
            Button(action: onBack) {
                LucideIcon(.chevronLeft, size: LucideIconSize.action)
                    .foregroundStyle(theme.fgBase)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.backLabel)
            Spacer(minLength: Tokens.Space.s12)
            Button {
                sheetShown = true
            } label: {
                LucideIcon(.ellipsis, size: LucideIconSize.action)
                    .foregroundStyle(theme.fgMuted)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.moreLabel)
        }
        .padding(.horizontal, Tokens.Space.s12)
    }

    private var title: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s4) {
            Text(verbatim: model.name)
                .typeRole(Typography.pageTitle.scaled(model.textScale))
                .foregroundStyle(theme.fgBase)
                .lineLimit(1)
            Text(verbatim: model.membersLabel)
                .typeRole(Typography.rowSub.scaled(model.textScale))
                .foregroundStyle(theme.fgMuted)
        }
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.top, Tokens.Space.s16)
    }

    private var membersBlock: some View {
        VStack(spacing: Tokens.Space.s0) {
            ForEach(Array(model.members.enumerated()), id: \.element.id) { index, member in
                if index > 0 {
                    Rectangle()
                        .fill(theme.borderBase)
                        .frame(height: Tokens.BorderWidth.hairline)
                        .padding(.horizontal, Tokens.Layout.screenPaddingX)
                }
                ContactRow(contact: member, size: .member, onTap: { onOpenMember(member) })
            }
        }
    }
}

#Preview("C4 group dark") {
    GroupDetailScreen(model: ContactsFixtures.buildMobileState(.c4, loc: ContactsPreviewData.loc).group!)
        .themed(.dark)
        .environment(\.identiconProvider, .previewSafe)
        .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("C4 empty group light") {
    GroupDetailScreen(model: ContactsFixtures.emptyGroup(loc: ContactsPreviewData.loc))
        .themed(.light)
        .environment(\.identiconProvider, .previewSafe)
        .environment(\.lucideIconProvider, .previewSafe)
}
