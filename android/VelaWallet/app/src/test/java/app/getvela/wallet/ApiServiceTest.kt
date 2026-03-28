package app.getvela.wallet

import app.getvela.wallet.model.Network
import app.getvela.wallet.model.formatBalance
import app.getvela.wallet.service.ApiToken
import org.junit.Assert.*
import org.junit.Test

/**
 * API service model tests — token parsing, chain ID mapping, value formatting.
 * Mirrors iOS APIServiceTests.swift.
 */
class ApiServiceTest {

    // MARK: - ApiToken Properties

    @Test
    fun apiToken_usdValue() {
        val token = ApiToken(
            network = "eth-mainnet", chainName = "Ethereum", symbol = "ETH",
            balance = "1.5", decimals = 18, name = "Ethereum",
            priceUsd = 2000.0, spam = false,
        )
        assertEquals(3000.0, token.usdValue, 0.01)
    }

    @Test
    fun apiToken_zeroBalance() {
        val token = ApiToken(
            network = "eth-mainnet", chainName = "Ethereum", symbol = "ETH",
            balance = "0", decimals = 18, name = "Ethereum",
            priceUsd = 2000.0, spam = false,
        )
        assertEquals(0.0, token.usdValue, 0.01)
    }

    @Test
    fun apiToken_isNative() {
        val native = ApiToken(network = "eth-mainnet", chainName = "Ethereum", symbol = "ETH",
            balance = "1", decimals = 18, name = "Ethereum", tokenAddress = null, priceUsd = null, spam = false)
        val erc20 = ApiToken(network = "eth-mainnet", chainName = "Ethereum", symbol = "USDC",
            balance = "1", decimals = 6, name = "USDC", tokenAddress = "0x1234", priceUsd = null, spam = false)
        assertTrue(native.isNative)
        assertFalse(erc20.isNative)
    }

    @Test
    fun apiToken_chainId_mapping() {
        val tokens = listOf(
            "eth-mainnet" to 1,
            "arb-mainnet" to 42161,
            "base-mainnet" to 8453,
            "opt-mainnet" to 10,
            "matic-mainnet" to 137,
            "bnb-mainnet" to 56,
            "avax-mainnet" to 43114,
        )
        for ((network, expectedChainId) in tokens) {
            val token = ApiToken(network = network, chainName = "", symbol = "", balance = "0",
                decimals = 18, name = "", priceUsd = null, spam = false)
            assertEquals("$network should map to $expectedChainId", expectedChainId, token.chainId)
        }
    }

    @Test
    fun apiToken_id_unique() {
        val t1 = ApiToken(network = "eth-mainnet", chainName = "Ethereum", symbol = "ETH",
            balance = "1", decimals = 18, name = "Ethereum", tokenAddress = null, priceUsd = null, spam = false)
        val t2 = ApiToken(network = "eth-mainnet", chainName = "Ethereum", symbol = "USDC",
            balance = "1", decimals = 6, name = "USDC", tokenAddress = "0xA0b8", priceUsd = null, spam = false)
        assertNotEquals(t1.id, t2.id)
    }

    @Test
    fun apiToken_logoUrl_native() {
        val token = ApiToken(network = "eth-mainnet", chainName = "Ethereum", symbol = "ETH",
            balance = "1", decimals = 18, name = "Ethereum", tokenAddress = null, priceUsd = null, spam = false)
        assertNotNull(token.logoUrl)
        assertTrue(token.logoUrl!!.contains("eip155-1"))
    }

    // MARK: - Network

    @Test
    fun network_chainName() {
        assertEquals("Ethereum", Network.chainName(1))
        assertEquals("Arbitrum", Network.chainName(42161))
        assertEquals("Chain 999", Network.chainName(999))
    }

    @Test
    fun network_nativeSymbol() {
        assertEquals("ETH", Network.nativeSymbol(1))
        assertEquals("BNB", Network.nativeSymbol(56))
        assertEquals("POL", Network.nativeSymbol(137))
        assertEquals("AVAX", Network.nativeSymbol(43114))
    }

    @Test
    fun network_networkId() {
        assertEquals("eth-mainnet", Network.networkId(1))
        assertEquals("arb-mainnet", Network.networkId(42161))
        assertEquals("base-mainnet", Network.networkId(8453))
    }

    @Test
    fun network_defaults_has7() {
        assertEquals(7, Network.defaults.size)
    }

    // MARK: - Format Balance

    @Test
    fun formatBalance_values() {
        assertEquals("0", formatBalance(0.0))
        assertNotEquals("0", formatBalance(0.001))
        assertTrue(formatBalance(1234.56).contains("1234"))
    }
}
