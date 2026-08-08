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

struct WalletTabBar: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let tabs: TabsModel

    private var items: [(outline: LucideGlyph, fill: LucideGlyph, label: String, selected: Bool)] {
        [
            (.navWalletOutline, .navWalletSolid, tabs.wallet, true),
            (.navContactsOutline, .navContactsSolid, tabs.contacts, false),
            (.navExploreOutline, .navExploreSolid, tabs.explore, false),
            (.navSettingsOutline, .navSettingsSolid, tabs.settings, false),
        ]
    }

    var body: some View {
        HStack(spacing: Tokens.Space.s0) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(spacing: Tokens.Space.s4) {
                    LucideIcon(item.selected ? item.fill : item.outline, size: LucideIconSize.tab)
                    Text(verbatim: item.label)
                        .typeRole(Typography.tab.scaled(textScale))
                        .lineLimit(1)
                }
                .foregroundStyle(item.selected ? theme.accentBase : theme.fgSubtle)
                .frame(maxWidth: .infinity)
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
    WalletTabBar(tabs: TabsModel(wallet: "钱包", contacts: "通讯录", explore: "探索", settings: "设置"))
        .background(Tokens.dark.bgBase.color)
        .themed(.dark)
}

#Preview("Tab bar light") {
    WalletTabBar(tabs: TabsModel(wallet: "Wallet", contacts: "Contacts", explore: "Explore", settings: "Settings"))
        .themed(.light)
}
