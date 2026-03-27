package app.getvela.wallet.service

import android.util.Log
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

private const val TAG = "WalletAPI"
private const val BASE_URL = "https://getvela.app/api"

private val json = Json { ignoreUnknownKeys = true }

class WalletApiService {

    suspend fun fetchTokens(address: String): List<ApiToken> {
        val url = "$BASE_URL/wallet?address=$address"
        val data = httpGet(url) ?: return emptyList()
        return try {
            val response = json.decodeFromString<WalletResponse>(data)
            val filtered = response.tokens.filter { !it.spam }
            Log.d(TAG, "/wallet: ${filtered.size} tokens, total $${String.format("%.2f", filtered.sumOf { it.usdValue })}")
            filtered
        } catch (e: Exception) {
            Log.e(TAG, "/wallet parse failed: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchNFTs(address: String): List<ApiNft> {
        val url = "$BASE_URL/nft?address=$address"
        val data = httpGet(url) ?: return emptyList()
        return try {
            val response = json.decodeFromString<NftResponse>(data)
            Log.d(TAG, "/nft: ${response.nfts.size} NFTs")
            response.nfts
        } catch (e: Exception) {
            Log.e(TAG, "/nft parse failed: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchExchangeRate(currency: String = "CNY"): Double {
        val url = "$BASE_URL/exchange-rate?currency=$currency"
        val data = httpGet(url) ?: return 0.0
        return try {
            json.decodeFromString<ExchangeRateResponse>(data).rate
        } catch (e: Exception) {
            0.0
        }
    }

    private fun httpGet(urlString: String): String? {
        return try {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.useCaches = false
            if (connection.responseCode == 200) {
                connection.inputStream.bufferedReader().readText()
            } else {
                Log.e(TAG, "HTTP ${connection.responseCode} for $urlString")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}")
            null
        }
    }
}

// MARK: - Response Types

@Serializable
data class WalletResponse(val tokens: List<ApiToken>)

@Serializable
data class NftResponse(val nfts: List<ApiNft>)

@Serializable
data class ExchangeRateResponse(val currency: String, val rate: Double)

// MARK: - API Token Model (matches iOS APIToken)

@Serializable
data class ApiToken(
    val network: String,
    val chainName: String,
    val symbol: String,
    val balance: String,
    val decimals: Int,
    val logo: String? = null,
    val name: String,
    val tokenAddress: String? = null,
    val priceUsd: Double? = null,
    val spam: Boolean = false,
) {
    val id: String get() = "${network}_${tokenAddress ?: "native"}_$symbol"
    val isNative: Boolean get() = tokenAddress == null
    val balanceDouble: Double get() = balance.toDoubleOrNull() ?: 0.0
    val usdValue: Double get() = (priceUsd ?: 0.0) * balanceDouble

    val chainId: Int
        get() = when (network) {
            "eth-mainnet" -> 1
            "arb-mainnet" -> 42161
            "base-mainnet" -> 8453
            "opt-mainnet" -> 10
            "matic-mainnet" -> 137
            "bnb-mainnet" -> 56
            "avax-mainnet" -> 43114
            else -> 1
        }

    val logoUrl: String?
        get() {
            if (!logo.isNullOrEmpty()) return logo
            if (isNative) return "https://ethereum-data.awesometools.dev/chainlogos/eip155-$chainId.png"
            tokenAddress?.let { addr ->
                return "https://ethereum-data.awesometools.dev/assets/eip155-$chainId/$addr/logo.png"
            }
            return null
        }
}

// MARK: - NFT Model (matches iOS APINFT)

@Serializable
data class ApiNft(
    val network: String,
    val chainName: String,
    val contractAddress: String,
    val tokenId: String,
    val name: String? = null,
    val description: String? = null,
    val image: String? = null,
    val tokenType: String,
    val collectionName: String? = null,
    val collectionImage: String? = null,
) {
    val id: String get() = "${network}_${contractAddress}_$tokenId"
    val displayName: String get() = name ?: "${collectionName ?: "NFT"} #$tokenId"

    val imageUrl: String?
        get() {
            if (image.isNullOrEmpty()) return null
            if (image.startsWith("ipfs://")) return "https://ipfs.io/ipfs/${image.removePrefix("ipfs://")}"
            return image
        }
}
