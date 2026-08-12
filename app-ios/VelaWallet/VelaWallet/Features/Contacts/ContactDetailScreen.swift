//
//  ContactDetailScreen.swift
//  VelaWallet
//
//  Mobile contact detail (spec 018 FR-002, mocks C2 / C2s): back chevron +
//  edit pencil, identicon hero, name, short address, group chips, the three
//  action cards, the full mono address block, 最近往来 over spec-015
//  ActivityRow instances, and the centered destructive 删除联系人 which
//  raises the confirm sheet (C2s).
//
//  Reused from spec 015: IdenticonAvatar, ActionButtonRow, WalletSectionHeader,
//  ActivityRowView, WalletEmptyState (the no-activity edge case).
//

import SwiftUI

struct ContactDetailScreen: View {
    @Environment(\.theme) private var theme

    let model: ContactDetailModel
    var onBack: () -> Void = {}

    @State private var sheetShown = false

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            navBar
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s0) {
                    hero
                    ActionButtonRow(items: [
                        ActionCardItem(icon: .arrowUpRight, label: model.actions.send),
                        ActionCardItem(icon: .arrowDownLeft, label: model.actions.receive),
                        ActionCardItem(icon: .qrCode, label: model.actions.qr),
                    ])
                    .padding(.top, Tokens.Space.s24)

                    hairline.padding(.top, Tokens.Space.s24)

                    AddressBlock(
                        label: model.addressLabel,
                        lines: model.addressLines,
                        copyLabel: model.copyLabel,
                        copiedLabel: model.copiedLabel
                    )
                    .padding(.top, Tokens.Space.s24)

                    hairline.padding(.top, Tokens.Space.s24)

                    WalletSectionHeader(title: model.activityTitle, action: model.activityAction)
                        .padding(.top, Tokens.Space.s24)
                    activity

                    deleteAction
                        .padding(.top, Tokens.Space.s32)
                }
                .padding(.horizontal, Tokens.Layout.screenPaddingX)
                .padding(.bottom, Tokens.Space.s32)
            }
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

    // MARK: - Chrome

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
            Button {} label: {
                LucideIcon(.pencil, size: LucideIconSize.menuRow)
                    .foregroundStyle(theme.fgBase)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.editLabel)
        }
        .padding(.horizontal, Tokens.Space.s12)
    }

    private var hero: some View {
        VStack(spacing: Tokens.Space.s0) {
            IdenticonAvatar(seed: model.contact.addressFull, size: ContactsGeometry.detailAvatar)
            Text(verbatim: model.contact.name)
                .typeRole(Typography.title.scaled(model.textScale))
                .foregroundStyle(theme.fgBase)
                .multilineTextAlignment(.center)
                .padding(.top, Tokens.Space.s16)
            Text(verbatim: model.contact.addressDisplay)
                .monoRole(Typography.monoAddressDetail.scaled(model.textScale))
                .foregroundStyle(theme.fgMuted)
                .padding(.top, Tokens.Space.s8)
            GroupChips(chips: model.chips, addLabel: model.addChip)
                .padding(.top, Tokens.Space.s12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Tokens.Space.s16)
    }

    @ViewBuilder private var activity: some View {
        if model.activity.isEmpty, let empty = model.activityEmpty {
            WalletEmptyState(icon: .inbox, model: empty)
        } else {
            VStack(spacing: Tokens.Space.s0) {
                ForEach(Array(model.activity.enumerated()), id: \.element.id) { index, row in
                    if index > 0 {
                        Rectangle()
                            .fill(theme.borderBase)
                            .frame(height: Tokens.BorderWidth.hairline)
                            .padding(.leading, WalletGeometry.rowDividerInset)
                    }
                    ActivityRowView(model: row)
                }
            }
        }
    }

    private var deleteAction: some View {
        Button {
            sheetShown = true
        } label: {
            Text(verbatim: model.deleteLabel)
                .typeRole(Typography.button.scaled(model.textScale))
                .foregroundStyle(theme.errorBase)
                .frame(maxWidth: .infinity)
                .frame(minHeight: Tokens.Control.md)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var hairline: some View {
        Rectangle()
            .fill(theme.borderBase)
            .frame(height: Tokens.BorderWidth.hairline)
    }
}

#Preview("C2 detail dark") {
    ContactDetailScreen(model: ContactsFixtures.buildMobileState(.c2, loc: ContactsPreviewData.loc).detail!)
        .themed(.dark)
        .environment(\.identiconProvider, .previewSafe)
        .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("C2 detail light") {
    ContactDetailScreen(model: ContactsFixtures.buildMobileState(.c2, loc: ContactsPreviewData.loc).detail!)
        .themed(.light)
        .environment(\.identiconProvider, .previewSafe)
        .environment(\.lucideIconProvider, .previewSafe)
}
