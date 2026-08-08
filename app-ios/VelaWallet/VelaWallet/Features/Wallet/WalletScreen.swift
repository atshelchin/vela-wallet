//
//  WalletScreen.swift
//  VelaWallet
//
//  The mobile wallet home (spec 015 FR-002): assembles the component
//  vocabulary from a fixture-built WalletHomeModel — screens compose
//  components, never re-implement them (FR-001). All ten H-states render
//  from fixtures alone; H8 auto-presents the chain-select sheet; H7x
//  threads its 1.35× text scale through the walletTextScale environment.
//

import SwiftUI

struct WalletScreen: View {
    @Environment(\.theme) private var theme

    let model: WalletHomeModel
    @State private var sheetShown = false

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s0) {
                    headerRow
                        .padding(.top, Tokens.Space.s8)
                    BalanceDisplay(model: model.balance)
                        .padding(.top, Tokens.Space.s24)
                    ActionButtonRow(model: model.actions)
                        .padding(.top, Tokens.Space.s24)
                    section(model.activitySection, isActivity: true)
                        .padding(.top, Tokens.Space.s32)
                    section(model.assetsSection, isActivity: false)
                        .padding(.top, Tokens.Space.s32)
                }
                .padding(.horizontal, Tokens.Layout.screenPaddingX)
                .padding(.bottom, Tokens.Space.s24)
            }
            WalletTabBar(tabs: model.tabs)
        }
        .background(theme.bgBase.ignoresSafeArea())
        .environment(\.walletTextScale, model.textScale)
        .sheet(isPresented: $sheetShown) {
            if let sheet = model.sheet {
                ChainSelectSheet(model: sheet)
                    .environment(\.walletTextScale, model.textScale)
                    .presentationDetents([.height(WalletGeometry.chainSheetHeight)])
                    .presentationDragIndicator(.hidden)
                    .presentationCornerRadius(Tokens.Radius.r20)
                    .presentationBackground(theme.bgBase)
            }
        }
        .onAppear { sheetShown = model.sheet != nil }
    }

    // MARK: - Header row (WalletHeader + trailing NetworkFilterPill)

    private var headerRow: some View {
        HStack(spacing: Tokens.Space.s12) {
            WalletHeaderView(model: model.header)
            Spacer(minLength: Tokens.Space.s12)
            NetworkFilterPill(model: model.pill)
                .fixedSize()
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func section(_ section: SectionModel, isActivity: Bool) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s0) {
            WalletSectionHeader(title: section.title, action: section.action)
            switch section.mode {
            case .rows:
                if isActivity {
                    activityRows
                } else {
                    assetRows
                }
            case .empty:
                if let empty = section.empty {
                    WalletEmptyState(icon: isActivity ? .inbox : .walletUtility, model: empty)
                }
            case .loading:
                let count = isActivity ? WalletGeometry.skeletonActivityRows : WalletGeometry.skeletonAssetRows
                VStack(spacing: Tokens.Space.s0) {
                    ForEach(0..<count, id: \.self) { _ in
                        SkeletonRow()
                    }
                }
                .padding(.top, Tokens.Space.s8)
            }
        }
    }

    private var activityRows: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s0) {
            ForEach(model.activityGroups) { group in
                Text(verbatim: group.label)
                    .typeRole(Typography.rowSub.scaled(model.textScale))
                    .foregroundStyle(theme.fgSubtle)
                    .padding(.top, Tokens.Space.s12)
                ForEach(Array(group.rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 {
                        rowDivider
                    }
                    ActivityRowView(model: row)
                }
            }
        }
    }

    private var assetRows: some View {
        VStack(spacing: Tokens.Space.s0) {
            ForEach(Array(model.assetRows.enumerated()), id: \.element.id) { index, row in
                if index > 0 {
                    rowDivider
                }
                AssetRowView(model: row)
            }
        }
        .padding(.top, Tokens.Space.s8)
    }

    private var rowDivider: some View {
        Rectangle()
            .fill(theme.borderBase)
            .frame(height: Tokens.BorderWidth.hairline)
            .padding(.leading, WalletGeometry.rowDividerInset)
    }
}

#Preview("Wallet H1 dark") {
    WalletScreen(model: WalletFixtures.buildMobileState(.h1, loc: Loc(overrideTag: "zh")))
        .themed(.dark)
        .environment(\.identiconProvider, .previewSafe)
}

#Preview("Wallet H2 light") {
    WalletScreen(model: WalletFixtures.buildMobileState(.h2, loc: Loc(overrideTag: "zh")))
        .themed(.light)
        .environment(\.identiconProvider, .previewSafe)
}
