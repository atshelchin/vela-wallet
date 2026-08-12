//
//  ActionMenuSheet.swift
//  VelaWallet
//
//  ActionMenuSheet (spec 018 vocabulary #7, mocks C5/C6 + the delete
//  confirm): drag handle, icon+label rows, optional divider before a
//  destructive row (error color), and a separate 取消 button. One component
//  hosts all three contents. Presented through `.sheet` with a
//  self-measuring content detent (FlowSheet precedent); the system supplies
//  the 250ms rise over the scrim and honours reduce-motion itself.
//
//  Every row is an action sink — nothing here mutates state (spec
//  Assumptions: menu items render and dismiss only).
//

import SwiftUI

struct ActionMenuSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: ActionMenuModel
    var onItem: (MenuItemModel) -> Void = { _ in }
    var onCancel: () -> Void = {}

    @State private var contentHeight: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s0) {
            Capsule()
                .fill(theme.borderStrong)
                .frame(width: WalletGeometry.sheetHandleWidth, height: WalletGeometry.sheetHandleHeight)
                .frame(maxWidth: .infinity)
                .padding(.top, Tokens.Space.s8)

            if let title = model.title {
                Text(verbatim: title)
                    .typeRole(Typography.title.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    .padding(.top, Tokens.Space.s20)
            }
            if let body = model.body {
                Text(verbatim: body)
                    .typeRole(Typography.body.scaled(textScale))
                    .foregroundStyle(theme.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    .padding(.top, Tokens.Space.s8)
            }

            VStack(spacing: Tokens.Space.s0) {
                ForEach(model.items) { item in
                    if item.dividerAbove {
                        Rectangle()
                            .fill(theme.borderBase)
                            .frame(height: Tokens.BorderWidth.hairline)
                            .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    }
                    row(item)
                }
            }
            .padding(.top, model.title == nil ? Tokens.Space.s8 : Tokens.Space.s16)

            Button(action: onCancel) {
                Text(verbatim: model.cancel)
                    .typeRole(Typography.button.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: Tokens.Control.lg)
                    .background {
                        RoundedRectangle(cornerRadius: ContactsGeometry.searchFieldRadius)
                            .strokeBorder(theme.borderBase, lineWidth: Tokens.BorderWidth.hairline)
                    }
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
            .padding(.top, Tokens.Space.s12)
            .padding(.bottom, Tokens.Space.s24)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
        } action: { height in
            contentHeight = height
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(max(contentHeight, 1))])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(Tokens.Radius.r20)
        .presentationBackground(theme.bgRaised)
    }

    private func row(_ item: MenuItemModel) -> some View {
        Button {
            onItem(item)
        } label: {
            HStack(spacing: Tokens.Space.s16) {
                LucideIcon(item.icon, size: LucideIconSize.menuRow)
                Text(verbatim: item.label)
                    .typeRole(Typography.menuRow.scaled(textScale))
                    .lineLimit(1)
                Spacer(minLength: Tokens.Space.s12)
            }
            .foregroundStyle(item.destructive ? theme.errorBase : theme.fgBase)
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
            .frame(minHeight: ContactsGeometry.menuRowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview("Action menu · add") {
    ActionMenuSheet(model: ContactsFixtures.addMenu(loc: ContactsPreviewData.loc))
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
        .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("Action menu · group") {
    ActionMenuSheet(model: ContactsFixtures.groupMenu(loc: ContactsPreviewData.loc))
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
        .environment(\.lucideIconProvider, .previewSafe)
}

#Preview("Action menu · delete confirm light") {
    ActionMenuSheet(model: ContactsFixtures.deleteConfirm(loc: ContactsPreviewData.loc, name: "Alice"))
        .themed(.light)
        .environment(\.lucideIconProvider, .previewSafe)
}
