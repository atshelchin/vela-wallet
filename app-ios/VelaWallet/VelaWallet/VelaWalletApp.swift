//
//  VelaWalletApp.swift
//  VelaWallet
//

import SwiftUI

@main
struct VelaWalletApp: App {
    private let loc = Loc()

    var body: some Scene {
        WindowGroup {
            RootView(loc: loc)
        }
    }
}
