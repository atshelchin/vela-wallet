//
//  WalletModels.swift
//  VelaWallet
//
//  Wallet view models (spec 015, data-model.md). Components consume ONLY
//  these display-ready shapes — no service types, no formatting, no
//  fetching (FR-005 / SC-005). A later "real data" feature replaces the
//  fixture layer that builds them and nothing else. Mirrors the web
//  reference `src/lib/wallet/model.ts`.
//

import SwiftUI

/// The nine mobile home states plus the chain-select sheet (H8).
enum MobileStateId: String, CaseIterable, Identifiable {
    case h1, h1s, h2, h3, h4, h5, h6, h7, h7x, h8
    var id: String { rawValue }

    /// Gallery chip label — mock naming, not translatable copy.
    var label: String {
        switch self {
        case .h1: "H1"
        case .h1s: "H1s"
        case .h2: "H2"
        case .h3: "H3"
        case .h4: "H4"
        case .h5: "H5"
        case .h6: "H6"
        case .h7: "H7"
        case .h7x: "H7x"
        case .h8: "H8"
        }
    }
}

struct WalletHeaderModel {
    let name: String
    let addressDisplay: String
    /// Raw seed — IdenticonAvatar normalizes through vela-core (FR-006).
    let identiconSeed: String
}

enum NetworkPillModel {
    case all(dots: [Color], label: String)
    case single(dot: Color, label: String)
}

enum BalanceStateKind {
    case normal, zeroLive, loading, hidden
}

struct BalanceStatusModel {
    enum Kind { case warning, refreshing }
    let kind: Kind
    let text: String
}

struct BalanceModel {
    let label: String
    let currency: String
    let state: BalanceStateKind
    /// e.g. "$1,383" — absent while loading; mask string when hidden.
    var integer: String?
    /// e.g. "28" — rendered de-emphasised after the separator.
    var decimals: String?
    /// zero-live only (实时 · 监听收款中).
    var liveText: String?
    var status: BalanceStatusModel?
    let a11yHide: String
    let a11yShow: String
}

enum ActivityKind {
    case sent, received, dapp
}

struct ActivityRowModel: Identifiable {
    let id = UUID()
    let kind: ActivityKind
    let title: String
    let subtitle: String
    let amount: String
    let unit: String
    let positive: Bool
    let masked: Bool
    let badgeColor: Color
}

struct ActivityGroupModel: Identifiable {
    let id = UUID()
    let label: String
    let rows: [ActivityRowModel]
}

enum AssetFiatModel {
    case value(String)
    /// Orange 无价格 marker (H4).
    case noPrice(String)
    case masked
}

struct AssetRowModel: Identifiable {
    let id = UUID()
    let ticker: String
    let chain: String
    let badgeColor: Color
    let balance: String
    let fiat: AssetFiatModel
    let masked: Bool
}

enum SectionMode {
    case rows, empty, loading
}

struct SectionEmptyModel {
    let title: String
    let caption: String
}

struct SectionModel {
    let title: String
    let action: String
    let mode: SectionMode
    var empty: SectionEmptyModel?
}

enum ChainDot {
    /// 所有网络 row — neutral dot resolved from the theme at render time.
    case all
    case color(Color)
}

struct ChainRowModel: Identifiable {
    let id = UUID()
    let name: String
    let dot: ChainDot
    let count: Int
    let selected: Bool
}

struct ChainSheetModel {
    let title: String
    let rows: [ChainRowModel]
}

struct TabsModel {
    let wallet: String
    let contacts: String
    let explore: String
    let settings: String
}

struct ActionsModel {
    let receive: String
    let send: String
    let scan: String
}

struct WalletHomeModel {
    let state: MobileStateId
    let header: WalletHeaderModel
    let pill: NetworkPillModel
    let balance: BalanceModel
    let actions: ActionsModel
    let activitySection: SectionModel
    let activityGroups: [ActivityGroupModel]
    let assetsSection: SectionModel
    let assetRows: [AssetRowModel]
    let tabs: TabsModel
    var sheet: ChainSheetModel?
    /// 1 or 1.35 — multiplies wallet type roles via walletTextScale (FR-011).
    let textScale: CGFloat
}
