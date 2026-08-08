//
//  WalletTabBar.swift
//  VelaWallet
//
//  TabBar (spec 015 vocabulary #13): custom HStack, NOT TabView — 钱包 /
//  通讯录 / 探索 / 设置. Selected: solid (.fill) icon + accent tint;
//  unselected: outline icon + subtle tint (FR-007). Only 钱包 has content
//  in this feature; taps re-select it (spec assumption).
//

import SwiftUI

/// SF Symbol names resolved once at launch. `wallet.bifold` shipped with
/// SF Symbols 6 (iOS 18); on iOS 17 we fall back to `creditcard`
/// (research D2 contingency).
enum WalletSymbols {
    static let walletOutline = resolve("wallet.bifold", fallback: "creditcard")
    static let walletFill = resolve("wallet.bifold.fill", fallback: "creditcard.fill")

    private static func resolve(_ name: String, fallback: String) -> String {
        UIImage(systemName: name) != nil ? name : fallback
    }
}

struct WalletTabBar: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let tabs: TabsModel

    private var items: [(outline: String, fill: String, label: String, selected: Bool)] {
        [
            (WalletSymbols.walletOutline, WalletSymbols.walletFill, tabs.wallet, true),
            ("person.2", "person.2.fill", tabs.contacts, false),
            ("safari", "safari.fill", tabs.explore, false),
            ("gearshape", "gearshape.fill", tabs.settings, false),
        ]
    }

    var body: some View {
        HStack(spacing: Tokens.Space.s0) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(spacing: Tokens.Space.s4) {
                    Image(systemName: item.selected ? item.fill : item.outline)
                        .font(WalletIconFont.tab)
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
