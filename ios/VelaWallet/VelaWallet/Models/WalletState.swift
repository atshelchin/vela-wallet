import SwiftUI
import Observation

@Observable
final class WalletState {
    var hasWallet = false
    var address: String = ""
    var isConnectedToBrowser = false

    /// All accounts the user has created/logged in with
    var accounts: [Account] = []
    var activeAccountIndex: Int = 0

    var activeAccount: Account? {
        guard !accounts.isEmpty, activeAccountIndex < accounts.count else { return nil }
        return accounts[activeAccountIndex]
    }

    var shortAddress: String {
        guard address.count > 10 else { return address }
        return "\(address.prefix(6))...\(address.suffix(4))"
    }
}

// MARK: - Account

struct Account: Identifiable {
    let id: String  // passkey credential ID
    let name: String  // user-chosen display name
    let address: String
    let createdAt: Date

    var shortAddress: String {
        guard address.count > 10 else { return address }
        return "\(address.prefix(6))...\(address.suffix(4))"
    }
}

// MARK: - Network

struct Network: Identifiable, Equatable {
    let id: String
    let displayName: String
    let chainId: Int
    let iconLabel: String
    let iconColor: Color
    let iconBg: Color
    let isL2: Bool

    var rpcURL: String
    var explorerURL: String
    var bundlerURL: String

    var subtitle: String {
        isL2 ? "L2 · Chain \(chainId)" : "Mainnet · Chain \(chainId)"
    }

    static func == (lhs: Network, rhs: Network) -> Bool {
        lhs.id == rhs.id
    }

    // MARK: - Default Networks (7)

    static let ethereum = Network(
        id: "ethereum", displayName: "Ethereum", chainId: 1,
        iconLabel: "ETH", iconColor: Color(hex: 0x627EEA), iconBg: VelaColor.ethBg, isL2: false,
        rpcURL: "https://eth.llamarpc.com", explorerURL: "https://etherscan.io",
        bundlerURL: "https://api.pimlico.io/v2/1/rpc"
    )
    static let bnb = Network(
        id: "bnb", displayName: "BNB Chain", chainId: 56,
        iconLabel: "BNB", iconColor: Color(hex: 0xF0B90B), iconBg: Color(hex: 0xFFF8E1), isL2: false,
        rpcURL: "https://bsc-dataseed.binance.org", explorerURL: "https://bscscan.com",
        bundlerURL: "https://api.pimlico.io/v2/56/rpc"
    )
    static let polygon = Network(
        id: "polygon", displayName: "Polygon", chainId: 137,
        iconLabel: "POL", iconColor: Color(hex: 0x8247E5), iconBg: Color(hex: 0xF0EAFF), isL2: true,
        rpcURL: "https://polygon-rpc.com", explorerURL: "https://polygonscan.com",
        bundlerURL: "https://api.pimlico.io/v2/137/rpc"
    )
    static let arbitrum = Network(
        id: "arbitrum", displayName: "Arbitrum", chainId: 42161,
        iconLabel: "ARB", iconColor: Color(hex: 0x28A0F0), iconBg: VelaColor.arbBg, isL2: true,
        rpcURL: "https://arb1.arbitrum.io/rpc", explorerURL: "https://arbiscan.io",
        bundlerURL: "https://api.pimlico.io/v2/42161/rpc"
    )
    static let optimism = Network(
        id: "optimism", displayName: "Optimism", chainId: 10,
        iconLabel: "OP", iconColor: Color(hex: 0xFF0420), iconBg: VelaColor.opBg, isL2: true,
        rpcURL: "https://mainnet.optimism.io", explorerURL: "https://optimistic.etherscan.io",
        bundlerURL: "https://api.pimlico.io/v2/10/rpc"
    )
    static let base = Network(
        id: "base", displayName: "Base", chainId: 8453,
        iconLabel: "BASE", iconColor: Color(hex: 0x0052FF), iconBg: VelaColor.baseBg, isL2: true,
        rpcURL: "https://mainnet.base.org", explorerURL: "https://basescan.org",
        bundlerURL: "https://api.pimlico.io/v2/8453/rpc"
    )
    static let avalanche = Network(
        id: "avalanche", displayName: "Avalanche", chainId: 43114,
        iconLabel: "AVAX", iconColor: Color(hex: 0xE84142), iconBg: Color(hex: 0xFFF0F0), isL2: false,
        rpcURL: "https://api.avax.network/ext/bc/C/rpc", explorerURL: "https://snowtrace.io",
        bundlerURL: "https://api.pimlico.io/v2/43114/rpc"
    )

    static var defaults: [Network] {
        [.ethereum, .bnb, .polygon, .arbitrum, .optimism, .base, .avalanche]
    }
}

// MARK: - Token

struct Token: Identifiable {
    let id: String
    let name: String
    let symbol: String
    let balance: Double
    let usdValue: Double
    let iconLabel: String
    let iconColor: Color
    let iconBg: Color

    static let samples: [Token] = [
        Token(
            id: "eth", name: "Ethereum", symbol: "ETH",
            balance: 1.245, usdValue: 3981.60,
            iconLabel: "Ξ", iconColor: Color(hex: 0x627EEA), iconBg: VelaColor.ethBg
        ),
        Token(
            id: "usdc", name: "USD Coin", symbol: "USDC",
            balance: 200.00, usdValue: 200.00,
            iconLabel: "$", iconColor: Color(hex: 0x2775CA), iconBg: VelaColor.usdcBg
        ),
        Token(
            id: "dai", name: "Dai", symbol: "DAI",
            balance: 99.90, usdValue: 99.90,
            iconLabel: "D", iconColor: Color(hex: 0xF5AC37), iconBg: VelaColor.daiBg
        ),
    ]
}
