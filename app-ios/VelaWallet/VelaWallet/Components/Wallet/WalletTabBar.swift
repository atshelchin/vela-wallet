//
//  WalletTabBar.swift
//  VelaWallet
//
//  TabBar (spec 015 vocabulary #13): custom HStack, NOT TabView — 钱包 /
//  通讯录 / 探索 / 设置. Selected: lucide-derived solid glyph + accent tint;
//  unselected: lucide outline + subtle tint (FR-007, research D2 rev). Only
//  钱包 has content in this feature; taps re-select it (spec assumption).
//

import SwiftUI

/// The four destinations. Only 钱包 (spec 015) and 通讯录 (spec 018) have
/// content; the other two remain inert selections.
enum WalletTab: String, CaseIterable {
    case wallet, contacts, explore, settings
}

struct WalletTabBar: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let tabs: TabsModel
    /// Which destination reads as selected (solid glyph + accent).
    var selected: WalletTab = .wallet
    var onSelect: (WalletTab) -> Void = { _ in }

    private var items: [(tab: WalletTab, outline: LucideGlyph, fill: LucideGlyph, label: String)] {
        [
            (.wallet, .navWalletOutline, .navWalletSolid, tabs.wallet),
            (.contacts, .navContactsOutline, .navContactsSolid, tabs.contacts),
            (.explore, .navExploreOutline, .navExploreSolid, tabs.explore),
            (.settings, .navSettingsOutline, .navSettingsSolid, tabs.settings),
        ]
    }

    var body: some View {
        HStack(spacing: Tokens.Space.s0) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                let isSelected = item.tab == selected
                Button {
                    onSelect(item.tab)
                } label: {
                    VStack(spacing: Tokens.Space.s4) {
                        LucideIcon(isSelected ? item.fill : item.outline, size: LucideIconSize.tab)
                        Text(verbatim: item.label)
                            .typeRole(Typography.tab.scaled(textScale))
                            .lineLimit(1)
                    }
                    .foregroundStyle(isSelected ? theme.accentBase : theme.fgSubtle)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, Tokens.Space.s8)
        .frame(minHeight: WalletGeometry.tabBarHeight, alignment: .top)
        .background(theme.bgBase)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(theme.borderBase)
                .frame(height: Tokens.BorderWidth.hairline)
        }
    }
}

#Preview("Tab bar dark") {
    VStack(spacing: Tokens.Space.s24) {
        WalletTabBar(tabs: TabsModel(wallet: "钱包", contacts: "通讯录", explore: "探索", settings: "设置"))
        WalletTabBar(
            tabs: TabsModel(wallet: "钱包", contacts: "通讯录", explore: "探索", settings: "设置"),
            selected: .contacts
        )
    }
    .background(Tokens.dark.bgBase.color)
    .themed(.dark)
}

#Preview("Tab bar light") {
    WalletTabBar(tabs: TabsModel(wallet: "Wallet", contacts: "Contacts", explore: "Explore", settings: "Settings"))
        .themed(.light)
}
