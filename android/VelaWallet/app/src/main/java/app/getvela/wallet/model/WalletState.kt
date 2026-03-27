package app.getvela.wallet.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import app.getvela.wallet.ui.theme.VelaColor

// MARK: - WalletState (matches iOS WalletState)

class WalletState {
    var hasWallet by mutableStateOf(false)
    var address by mutableStateOf("")
    var isConnectedToBrowser by mutableStateOf(false)

    var accounts by mutableStateOf<List<Account>>(emptyList())
    var activeAccountIndex by mutableIntStateOf(0)

    val activeAccount: Account?
        get() = accounts.getOrNull(activeAccountIndex)

    val shortAddress: String
        get() {
            if (address.length <= 10) return address
            return "${address.take(6)}...${address.takeLast(4)}"
        }
}

// MARK: - Account (matches iOS Account)

data class Account(
    val id: String,
    val name: String,
    val address: String,
    val createdAt: Long = System.currentTimeMillis(),
) {
    val shortAddress: String
        get() {
            if (address.length <= 10) return address
            return "${address.take(6)}...${address.takeLast(4)}"
        }
}

// MARK: - Network (matches iOS Network)

data class Network(
    val id: String,
    val displayName: String,
    val chainId: Int,
    val iconLabel: String,
    val iconColor: Color,
    val iconBg: Color,
    val isL2: Boolean,
    val rpcURL: String,
    val explorerURL: String,
    val bundlerURL: String,
) {
    companion object {
        val ethereum = Network(
            id = "ethereum", displayName = "Ethereum", chainId = 1,
            iconLabel = "ETH", iconColor = Color(0xFF627EEA), iconBg = VelaColor.ethBg, isL2 = false,
            rpcURL = "https://eth.llamarpc.com", explorerURL = "https://etherscan.io",
            bundlerURL = "https://api.pimlico.io/v2/1/rpc",
        )
        val bnb = Network(
            id = "bnb", displayName = "BNB Chain", chainId = 56,
            iconLabel = "BNB", iconColor = Color(0xFFF0B90B), iconBg = Color(0xFFFFF8E1), isL2 = false,
            rpcURL = "https://bsc-dataseed.binance.org", explorerURL = "https://bscscan.com",
            bundlerURL = "https://api.pimlico.io/v2/56/rpc",
        )
        val polygon = Network(
            id = "polygon", displayName = "Polygon", chainId = 137,
            iconLabel = "POL", iconColor = Color(0xFF8247E5), iconBg = Color(0xFFF0EAFF), isL2 = true,
            rpcURL = "https://polygon-rpc.com", explorerURL = "https://polygonscan.com",
            bundlerURL = "https://api.pimlico.io/v2/137/rpc",
        )
        val arbitrum = Network(
            id = "arbitrum", displayName = "Arbitrum", chainId = 42161,
            iconLabel = "ARB", iconColor = Color(0xFF28A0F0), iconBg = VelaColor.arbBg, isL2 = true,
            rpcURL = "https://arb1.arbitrum.io/rpc", explorerURL = "https://arbiscan.io",
            bundlerURL = "https://api.pimlico.io/v2/42161/rpc",
        )
        val optimism = Network(
            id = "optimism", displayName = "Optimism", chainId = 10,
            iconLabel = "OP", iconColor = Color(0xFFFF0420), iconBg = VelaColor.opBg, isL2 = true,
            rpcURL = "https://mainnet.optimism.io", explorerURL = "https://optimistic.etherscan.io",
            bundlerURL = "https://api.pimlico.io/v2/10/rpc",
        )
        val base = Network(
            id = "base", displayName = "Base", chainId = 8453,
            iconLabel = "BASE", iconColor = Color(0xFF0052FF), iconBg = VelaColor.baseBg, isL2 = true,
            rpcURL = "https://mainnet.base.org", explorerURL = "https://basescan.org",
            bundlerURL = "https://api.pimlico.io/v2/8453/rpc",
        )
        val avalanche = Network(
            id = "avalanche", displayName = "Avalanche", chainId = 43114,
            iconLabel = "AVAX", iconColor = Color(0xFFE84142), iconBg = Color(0xFFFFF0F0), isL2 = false,
            rpcURL = "https://api.avax.network/ext/bc/C/rpc", explorerURL = "https://snowtrace.io",
            bundlerURL = "https://api.pimlico.io/v2/43114/rpc",
        )

        val defaults = listOf(ethereum, bnb, polygon, arbitrum, optimism, base, avalanche)

        fun chainName(chainId: Int): String =
            defaults.find { it.chainId == chainId }?.displayName ?: "Chain $chainId"

        fun nativeSymbol(chainId: Int): String = when (chainId) {
            1, 42161, 10, 8453 -> "ETH"
            56 -> "BNB"
            137 -> "POL"
            43114 -> "AVAX"
            else -> "ETH"
        }

        fun networkId(chainId: Int): String = when (chainId) {
            1 -> "eth-mainnet"
            56 -> "bnb-mainnet"
            137 -> "matic-mainnet"
            42161 -> "arb-mainnet"
            10 -> "opt-mainnet"
            8453 -> "base-mainnet"
            43114 -> "avax-mainnet"
            else -> "eth-mainnet"
        }
    }
}

// MARK: - Shared Utilities

fun formatBalance(value: Double): String {
    if (value == 0.0) return "0"
    if (value >= 1000) return String.format("%.2f", value)
    if (value >= 1) return String.format("%.4f", value)
    return String.format("%.4g", value)
}

fun shortAddr(address: String): String {
    if (address.length <= 12) return address
    return "${address.take(8)}...${address.takeLast(6)}"
}
