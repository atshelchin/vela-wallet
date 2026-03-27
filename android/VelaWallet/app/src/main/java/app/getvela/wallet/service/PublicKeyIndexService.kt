package app.getvela.wallet.service

import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

private const val TAG = "PublicKeyIndex"
private const val BASE_URL = "https://webauthnp256-publickey-index.biubiu.tools"

private val json = Json { ignoreUnknownKeys = true }

/**
 * Client for the WebAuthn P256 Public Key Index API.
 * Port of iOS PublicKeyIndexService.
 */
class PublicKeyIndexService {

    fun getChallenge(): String {
        val response = httpGet("$BASE_URL/api/challenge")
        return json.decodeFromString<ChallengeResponse>(response).challenge
    }

    fun create(request: CreateRequest): PublicKeyRecord {
        Log.d(TAG, "POST /api/create, credentialId: ${request.credentialId.take(20)}...")
        val body = json.encodeToString(request)
        val response = httpPost("$BASE_URL/api/create", body)
        return json.decodeFromString(response)
    }

    fun query(rpId: String, credentialId: String): PublicKeyRecord {
        val response = httpGet("$BASE_URL/api/query?rpId=$rpId&credentialId=$credentialId")
        return json.decodeFromString(response)
    }

    // MARK: - HTTP

    private fun httpGet(urlString: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        if (connection.responseCode != 200) {
            val errorBody = connection.errorStream?.bufferedReader()?.readText() ?: ""
            Log.e(TAG, "HTTP ${connection.responseCode}: $errorBody")
            throw Exception("HTTP ${connection.responseCode}: $errorBody")
        }
        return connection.inputStream.bufferedReader().readText()
    }

    private fun httpPost(urlString: String, body: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        connection.doOutput = true
        connection.outputStream.use { it.write(body.toByteArray()) }

        if (connection.responseCode !in 200..201) {
            val errorBody = connection.errorStream?.bufferedReader()?.readText() ?: ""
            Log.e(TAG, "HTTP ${connection.responseCode}: $errorBody")
            throw Exception("HTTP ${connection.responseCode}: $errorBody")
        }
        return connection.inputStream.bufferedReader().readText()
    }

    // MARK: - Types

    @Serializable
    data class ChallengeResponse(val challenge: String)

    @Serializable
    data class CreateRequest(
        val rpId: String,
        val credentialId: String,
        val publicKey: String,
        val challenge: String,
        val signature: String,
        val authenticatorData: String,
        val clientDataJSON: String,
        val name: String,
    )

    @Serializable
    data class PublicKeyRecord(
        val rpId: String,
        val credentialId: String,
        val publicKey: String,
        val name: String,
        val createdAt: Long,
    )
}
