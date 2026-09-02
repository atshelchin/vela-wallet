//
//  ExploreTabsScreen.swift
//  VelaWallet
//
//  The tab switcher (mock E5): a two-column grid of cards, a "+" that opens
//  the start page, and the one destructive affordance — 关闭全部标签页 —
//  kept quiet at the bottom rather than beside every card.
//

import SwiftUI

struct ExploreTabsScreen: View {
    @Environment(\.theme) private var theme
    @Environment(\.walletTextScale) private var textScale

    let tabs: [TabModel]
    let copy: TabsScreenCopy
    var onDone: () -> Void = {}
    var onOpen: (String) -> Void = { _ in }
    var onClose: (String) -> Void = { _ in }
    var onNew: () -> Void = {}
    var onCloseAll: () -> Void = {}

    private let columns = [GridItem(.flexible(), spacing: Tokens.Space.s16),
                           GridItem(.flexible(), spacing: Tokens.Space.s16)]

    var body: some View {
        ScrollView {
            VStack(spacing: Tokens.Space.s16) {
                HStack {
                    Text(verbatim: copy.title)
                        .typeRole(Typography.display.scaled(textScale))
                        .foregroundStyle(theme.fgBase)
                    Spacer()
                    Button(action: onDone) {
                        Text(verbatim: copy.done)
                            .typeRole(Typography.button.scaled(textScale))
                            .foregroundStyle(theme.fgBase)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, Tokens.Space.s20)

                LazyVGrid(columns: columns, spacing: Tokens.Space.s16) {
                    ForEach(tabs) { tab in
                        TabCardView(tab: tab, closeLabel: copy.close,
                                    onOpen: onOpen, onClose: onClose)
                    }
                    Button(action: onNew) {
                        VStack(spacing: Tokens.Space.s8) {
                            LucideIcon(.plus, size: LucideIconSize.action)
                            Text(verbatim: copy.newTab)
                                .typeRole(Typography.rowSub.scaled(textScale))
                        }
                        .foregroundStyle(theme.fgMuted)
                        .frame(maxWidth: .infinity)
                        .aspectRatio(ExploreGeometry.tabCardAspect, contentMode: .fit)
                        .background(theme.bgSunken,
                                    in: RoundedRectangle(cornerRadius: Tokens.Radius.r16))
                    }
                    .buttonStyle(.plain)
                }

                Button(action: onCloseAll) {
                    Text(verbatim: copy.closeAll)
                        .typeRole(Typography.rowSub.scaled(textScale))
                        .foregroundStyle(theme.fgSubtle)
                        .padding(Tokens.Space.s20)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Tokens.Layout.screenPaddingX)
        }
        .background(theme.bgBase)
    }
}
