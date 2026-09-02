//
//  ExploreScreen.swift
//  VelaWallet
//
//  The Explore tab (spec 022 FR-002): one surface with three views — the
//  start page, a page being browsed, and the tab switcher — assembled from
//  the component vocabulary. Screens compose components, never re-implement
//  them (the spec-015 rule).
//
//  Every E-state renders from fixtures alone; what a person DOES here is
//  local view state layered over the model, so swapping the model (a locale
//  change, the gallery's state picker) still lands.
//

import SwiftUI

struct ExploreScreen: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let model: ExploreHomeModel
    let loc: Loc
    /// A signing request the page can raise. Fixture-driven for now.
    var signing: SigningModel?
    var onSelectTab: (WalletTab) -> Void = { _ in }

    @State private var viewOverride: ExploreView?
    @State private var sheet: ExploreSheet?
    @State private var signingUp = false
    /// Groups hidden here rather than in the fixture: hiding is something a
    /// person does, and the sheet has to show it happening.
    @State private var hidden: Set<String> = []

    private var view: ExploreView { viewOverride ?? model.view }

    private var visibleGroups: [GroupModel] {
        model.groups.filter { !hidden.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            switch view {
            case .tabs:
                ExploreTabsScreen(
                    tabs: model.tabs, copy: model.tabsScreen,
                    onDone: { viewOverride = .browsing },
                    onOpen: { _ in viewOverride = .browsing },
                    onClose: { _ in viewOverride = .start },
                    onNew: { viewOverride = .start },
                    onCloseAll: { viewOverride = .start }
                )
            case .browsing:
                AddressBarView(
                    host: model.browser.host, secure: model.browser.secure,
                    secureLabel: loc.t("explore.secureSite"),
                    closeLabel: loc.t("explore.closePage"),
                    menuLabel: loc.t("explore.siteMenu"),
                    onClose: { viewOverride = .start },
                    onMenu: { sheet = model.menus.siteMenu }
                )
                ScrollView {
                    DemoPageView(page: model.browser.page) {
                        if signing != nil { signingUp = true }
                    }
                }
                BrowserToolbarView(
                    browser: model.browser,
                    backLabel: loc.t("explore.back"),
                    forwardLabel: loc.t("explore.forward"),
                    accountLabel: loc.t("explore.account"),
                    connectedLabel: loc.t("explore.connectedTag"),
                    bookmarkLabel: loc.t("explore.addToFavorites"),
                    tabsLabel: loc.t("explore.tabs"),
                    onAccount: { sheet = .connection(model.menus.connection) },
                    onTabs: { viewOverride = .tabs }
                )
            case .start:
                startPage
                WalletTabBar(tabs: model.nav, selected: .explore, onSelect: onSelectTab)
            }
        }
        .background(theme.bgBase.ignoresSafeArea())
        .environment(\.walletTextScale, 1)
        .sheet(item: $sheet) { sheet in
            sheetContent(sheet)
                .presentationDragIndicator(.visible)
                .presentationDetents([.medium, .large])
                .presentationCornerRadius(Tokens.Radius.r20)
                .presentationBackground(theme.bgBase)
        }
        .sheet(isPresented: $signingUp) {
            if let signing {
                SigningSheet(model: signing, onConfirm: { signingUp = false })
                    .presentationDragIndicator(.visible)
                    .presentationDetents([.large])
                    .presentationCornerRadius(Tokens.Radius.r20)
                    .presentationBackground(theme.bgRaised)
            }
        }
        .onAppear { sheet = model.sheet }
    }

    private var startPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s0) {
                HStack {
                    Text(verbatim: model.title)
                        .typeRole(Typography.display.scaled(textScale))
                        .foregroundStyle(theme.fgBase)
                    Spacer()
                    if let count = model.tabCountLabel {
                        Button {
                            viewOverride = .tabs
                        } label: {
                            Text(verbatim: count)
                                .typeRole(Typography.label.scaled(textScale))
                                .foregroundStyle(theme.fgBase)
                                .frame(minWidth: ExploreGeometry.tabCount,
                                       minHeight: ExploreGeometry.tabCount)
                                .overlay(
                                    RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                                        .stroke(theme.fgBase,
                                                lineWidth: Tokens.BorderWidth.emphasis)
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(model.tabsScreen.title)
                    }
                }
                .padding(.top, Tokens.Space.s20)
                .padding(.bottom, Tokens.Space.s16)

                ExploreSearchField(
                    placeholder: model.searchPlaceholder, scanLabel: model.scanLabel,
                    onSubmit: { _ in viewOverride = .browsing }
                )
                .padding(.bottom, Tokens.Space.s20)

                if let empty = model.empty {
                    ExploreEmptyView(title: empty.title, caption: empty.caption, cta: empty.cta) {
                        viewOverride = .browsing
                    }
                }

                if let favorites = model.favorites {
                    WalletSectionHeader(
                        title: favorites.title, action: favorites.action,
                        onAction: { sheet = model.menus.groupManage }
                    )
                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible(), spacing: Tokens.Space.s8),
                                       count: ExploreGeometry.tileColumns),
                        spacing: Tokens.Space.s20
                    ) {
                        ForEach(favorites.tiles) { tile in
                            SiteTileView(tile: tile) { _ in viewOverride = .browsing }
                        }
                    }
                    .padding(.vertical, Tokens.Space.s12)
                }

                ForEach(visibleGroups) { group in
                    WalletSectionHeader(
                        title: group.title,
                        action: group.action == .clear ? loc.t("explore.clear") : "⋯",
                        onAction: { sheet = model.menus.groupManage }
                    )
                    ForEach(group.sites) { site in
                        SiteRowView(site: site) { _ in viewOverride = .browsing }
                    }
                }
            }
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
            .padding(.bottom, Tokens.Space.s24)
        }
    }

    @ViewBuilder
    private func sheetContent(_ sheet: ExploreSheet) -> some View {
        switch sheet {
        case .groupManage(let title, let rows, let newGroup):
            ScrollView {
                GroupManageSheetView(
                    title: title,
                    rows: rows.map { row in
                        var copy = row
                        copy.hidden = hidden.contains(row.id) || row.hidden
                        return copy
                    },
                    newGroup: newGroup,
                    closeLabel: loc.t("explore.close"),
                    hideLabel: loc.t("explore.hide"),
                    showLabel: loc.t("explore.show"),
                    deleteLabel: loc.t("explore.delete"),
                    onClose: { self.sheet = nil },
                    onToggle: { id in
                        if hidden.contains(id) { hidden.remove(id) } else { hidden.insert(id) }
                    }
                )
            }
        case .siteMenu(let site, let statusLine, let items):
            ScrollView {
                SiteMenuSheetView(
                    site: site, statusLine: statusLine, items: items,
                    closeLabel: loc.t("explore.close"),
                    onClose: { self.sheet = nil },
                    onPick: { id in
                        self.sheet = nil
                        if id == "close" { viewOverride = .start }
                    }
                )
            }
        case .connection(let connection):
            ScrollView {
                ConnectionPanelView(
                    connection: connection, closeLabel: loc.t("explore.close"),
                    onClose: { self.sheet = nil },
                    onDisconnect: { self.sheet = nil }
                )
            }
        }
    }
}
