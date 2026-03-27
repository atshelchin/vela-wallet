package app.getvela.wallet.service

import android.util.Log
import app.getvela.wallet.model.Network
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private const val TAG = "RPCAdapter"

/**
 * RPC Adapter — routes JSON-RPC calls to user-configured or default endpoints.
 *
 * Local-First Architecture: users can bring their own RPC nodes.
 * Fallback order: user-configured URL → getvela.app proxy → public RPC.
 */
object RPCAdapter {
    private const val DEFAULT_PROXY_URL = "https://getvela.app/api/bundler"

    // MARK: - Standard RPC Call

    /** Send a standard JSON-RPC call. Tries user config → proxy → public RPC. */
    fun call(method: String, params: JSONArray, chainId: Int): String {
        // 1. User-configured RPC (TODO: load from user settings)

        // 2. Vela proxy
        try {
            return proxyRPC(method, params, chainId)
        } catch (e: Exception) {
            Log.d(TAG, "Proxy failed for $method: ${e.message}")
        }

        // 3. Public RPC fallback
        val publicUrl = Network.defaults.find { it.chainId == chainId }?.rpcURL
        if (publicUrl != null) {
            return directRPC(publicUrl, method, params)
        }

        throw RPCException("All RPC endpoints failed for $method on chain $chainId")
    }

    // MARK: - Bundler Call (ERC-4337 methods)

    /** Send a bundler-specific call (eth_sendUserOperation, etc.). */
    fun bundlerCall(method: String, params: JSONArray, chainId: Int): String {
        // 1. User-configured bundler (TODO)

        // 2. Vela proxy
        return proxyRPC(method, params, chainId)
    }

    // MARK: - Direct JSON-RPC

    private fun directRPC(url: String, method: String, params: JSONArray): String {
        val body = JSONObject().apply {
            put("jsonrpc", "2.0")
            put("id", 1)
            put("method", method)
            put("params", params)
        }
        return httpPost(url, body.toString())
    }

    // MARK: - Proxy RPC (via getvela.app)

    private fun proxyRPC(method: String, params: JSONArray, chainId: Int): String {
        val network = Network.networkId(chainId)
        val body = JSONObject().apply {
            put("method", method)
            put("params", params)
            put("network", network)
        }
        return httpPost(DEFAULT_PROXY_URL, body.toString())
    }

    // MARK: - HTTP

    private fun httpPost(urlString: String, body: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        connection.doOutput = true

        connection.outputStream.use { it.write(body.toByteArray()) }

        if (connection.responseCode !in 200..299) {
            throw RPCException("HTTP ${connection.responseCode}")
        }
        return connection.inputStream.bufferedReader().readText()
    }

    class RPCException(message: String) : Exception(message)
}
