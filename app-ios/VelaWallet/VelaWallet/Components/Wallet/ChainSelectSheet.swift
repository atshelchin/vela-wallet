//
//  ChainSelectSheet.swift
//  VelaWallet
//
//  BottomSheet + ChainFilterList (spec 015 vocabulary #14/#15, mock H8):
//  drag handle, title row with trailing search icon, then chain rows —
//  所有网络 first with an accent checkmark, each row a chain dot + name +
//  per-chain asset count. Presented over the dimmed home via .sheet with
//  a fixed detent.
//

import SwiftUI

struct ChainSelectSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: ChainSheetModel

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s0) {
            Capsule()
                .fill(theme.borderStrong)
                .frame(width: WalletGeometry.sheetHandleWidth, height: WalletGeometry.sheetHandleHeight)
                .frame(maxWidth: .infinity)
                .padding(.top, Tokens.Space.s8)

            HStack {
                Text(verbatim: model.title)
                    .typeRole(Typography.title.scaled(textScale))
                    .foregroundStyle(theme.fgBase)
                Spacer(minLength: Tokens.Space.s12)
                LucideIcon(.search, size: LucideIconSize.sheetSearch)
                    .foregroundStyle(theme.fgMuted)
            }
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
            .padding(.vertical, Tokens.Space.s16)

            ForEach(model.rows) { row in
                chainRow(row)
            }

            Spacer(minLength: Tokens.Space.s0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.bgBase)
    }

    private func chainRow(_ row: ChainRowModel) -> some View {
        HStack(spacing: Tokens.Space.s12) {
            dot(row.dot)
            Text(verbatim: row.name)
                .typeRole(Typography.body.scaled(textScale))
                .foregroundStyle(theme.fgBase)
                .lineLimit(1)
            Spacer(minLength: Tokens.Space.s12)
            if row.selected {
                LucideIcon(.check, size: LucideIconSize.checkmark)
                    .foregroundStyle(theme.accentBase)
            }
            Text(verbatim: String(row.count))
                .typeRole(Typography.label.scaled(textScale))
                .foregroundStyle(theme.fgMuted)
        }
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .frame(minHeight: WalletGeometry.chainRowHeight)
    }

    private func dot(_ dot: ChainDot) -> some View {
        Circle()
            .fill({
                switch dot {
                case .all: theme.fgSubtle
                case .color(let color): color
                }
            }())
            .frame(width: WalletGeometry.chainDot, height: WalletGeometry.chainDot)
    }
}

#Preview("Chain sheet dark") {
    ChainSelectSheet(model: ChainSheetModel(title: "选择链", rows: [
        ChainRowModel(name: "所有网络", dot: .all, count: 8, selected: true),
        ChainRowModel(name: "BNB Chain", dot: .color(ChainPalette.bnb), count: 1, selected: false),
        ChainRowModel(name: "Ethereum", dot: .color(ChainPalette.ethereum), count: 3, selected: false),
        ChainRowModel(name: "Arbitrum", dot: .color(ChainPalette.arbitrum), count: 1, selected: false),
        ChainRowModel(name: "Gnosis", dot: .color(ChainPalette.gnosis), count: 1, selected: false),
        ChainRowModel(name: "Base", dot: .color(ChainPalette.base), count: 1, selected: false),
        ChainRowModel(name: "Polygon", dot: .color(ChainPalette.polygon), count: 1, selected: false),
    ]))
    .themed(.dark)
}
