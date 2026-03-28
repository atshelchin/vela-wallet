import SwiftUI

@main
struct VelaWalletApp: App {
    @State private var walletState: WalletState

    init() {
        let state = WalletState()

        // Restore accounts from iCloud/local storage
        let storedAccounts = LocalStorage.shared.loadAccounts()
        if !storedAccounts.isEmpty {
            state.hasWallet = true
            state.accounts = storedAccounts.map {
                Account(id: $0.id, name: $0.name, address: $0.address, createdAt: $0.createdAt)
            }
            state.activeAccountIndex = 0
            state.address = storedAccounts[0].address
        }

        _walletState = State(initialValue: state)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(walletState)
        }
    }
}
