package app.getvela.wallet.service

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private const val BASE_URL = "https://getvela.app/api"
private val json = Json { ignoreUnknownKeys = true }

class TransactionHistoryService {

    suspend fun fetchTransactions(address: String, network: String? = null, pageSize: Int = 25): List<Transaction> = withContext(Dispatchers.IO) {
        val urlStr = buildString {
            append("$BASE_URL/transactions?address=$address&pageSize=$pageSize")
            if (network != null) append("&network=$network")
        }
        val data = httpGet(urlStr) ?: return@withContext emptyList()
        try {
            json.decodeFromString<TransactionResponse>(data).transactions
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun httpGet(urlString: String): String? {
        return try {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            if (connection.responseCode == 200) {
                connection.inputStream.bufferedReader().readText()
            } else null
        } catch (_: Exception) { null }
    }
}

@Serializable
data class TransactionResponse(val transactions: List<Transaction>)

@Serializable
data class Transaction(
    val hash: String,
    val network: String,
    val chainName: String,
    val from: String,
    val to: String,
    val value: String,
    val symbol: String,
    val decimals: Int,
    val tokenAddress: String? = null,
    val category: String, // "send", "receive", "contract", "approve"
    val timestamp: Long? = null,
    val blockNumber: String,
    val status: String,
    val tokenId: String? = null,
    val data: String? = null,
) {
    val isNative: Boolean get() = tokenAddress == null
    val isSend: Boolean get() = category == "send"
    val isReceive: Boolean get() = category == "receive"

    val displayValue: String get() {
        val v = value.toDoubleOrNull() ?: 0.0
        return if (v == 0.0) "" else if (v >= 1) String.format("%.4f", v) else String.format("%.6f", v)
    }

    val timeAgo: String get() {
        val ts = timestamp ?: return ""
        val now = System.currentTimeMillis() / 1000
        val diff = now - ts
        return when {
            diff < 60 -> "Just now"
            diff < 3600 -> "${diff / 60}m ago"
            diff < 86400 -> "${diff / 3600}h ago"
            diff < 604800 -> "${diff / 86400}d ago"
            else -> {
                val date = java.text.SimpleDateFormat("MMM d", java.util.Locale.getDefault())
                date.format(java.util.Date(ts * 1000))
            }
        }
    }
}
