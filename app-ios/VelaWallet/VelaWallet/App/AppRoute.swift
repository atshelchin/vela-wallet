//
//  AppRoute.swift
//  VelaWallet
//
//  Typed navigation routes.
//

enum AppRoute: Hashable {
    /// The v2 create journey — a full screen, not a sheet (spec 019).
    case create
    /// The settings screen a signed-in person reaches from the tab bar
    /// (spec 023). Pushed, so the system back gesture returns to the wallet.
    case settings
}
