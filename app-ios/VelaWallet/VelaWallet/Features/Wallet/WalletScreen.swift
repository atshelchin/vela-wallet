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
    /// Strings this screen resolves for itself.
    ///
    /// Everything the FIXTURES know arrives pre-resolved in `model`; the
    /// identicon viewer is not in the fixtures, because it is not a state of
    /// this screen — it is a sheet the artwork opens, on this screen and on
    /// every other screen that draws an identicon.
    let loc: Loc
    /// The Settings tab (spec 019).
    ///
    /// The tab has existed since spec 015 with an `onSelect` hook nothing used.
    /// It is the way back OUT of a signed-in wallet now — because wiring a route
    /// guard without wiring its exit produces an app you cannot leave, which is
    /// what the founder hit here within a minute of the first successful create,
    /// and what Phase 5 had already hit on desktop.
    ///
    /// ⚠ Sign-out is currently the ONLY thing behind it. A real settings screen
    /// is a later feature; an unreachable wallet is not something to wait for it.
    var onSelectTab: (WalletTab) -> Void = { _ in }
    @State private var sheetShown = false
    @State private var viewingIdenticon = false

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
            WalletTabBar(tabs: model.tabs, onSelect: onSelectTab)
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
        .sheet(isPresented: $viewingIdenticon) {
            IdenticonViewerSheet(
                loc: loc,
                address: model.header.identiconSeed,
                onClose: { viewingIdenticon = false }
            )
            .presentationDetents([.medium, .large])
        }
        .onAppear { sheetShown = model.sheet != nil }
    }

    // MARK: - Header row

    /// The header owns the whole width.
    ///
    /// A trailing `NetworkFilterPill` used to sit here and cost the name and
    /// the address the room they need: a wallet called "kimik3 · something"
    /// showed as "kimik3 ·…" beside a chip nobody was reading (founder call,
    /// 2026-08-26). The pill's sheet keeps its fixture states for the gallery;
    /// what it lost is its entry point on this screen.
    private var headerRow: some View {
        WalletHeaderView(
            model: model.header,
            onIdenticon: { viewingIdenticon = true },
            identiconLabel: loc.t("componentsUi.identiconViewer.a11yOpen")
        )
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
    WalletScreen(
        model: WalletFixtures.buildMobileState(.h1, loc: Loc(overrideTag: "zh")),
        loc: Loc(overrideTag: "zh")
    )
        .themed(.dark)
        .environment(\.identiconProvider, .previewSafe)
}

#Preview("Wallet H2 light") {
    WalletScreen(
        model: WalletFixtures.buildMobileState(.h2, loc: Loc(overrideTag: "zh")),
        loc: Loc(overrideTag: "zh")
    )
        .themed(.light)
        .environment(\.identiconProvider, .previewSafe)
}
