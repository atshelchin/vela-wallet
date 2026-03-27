package app.getvela.wallet.service

import android.content.Context
import android.content.SharedPreferences
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val json = Json { ignoreUnknownKeys = true }

class LocalStorage private constructor(private val prefs: SharedPreferences) {

    companion object {
        @Volatile
        private var instance: LocalStorage? = null

        fun init(context: Context) {
            if (instance == null) {
                synchronized(this) {
                    if (instance == null) {
                        instance = LocalStorage(
                            context.getSharedPreferences("vela_wallet", Context.MODE_PRIVATE)
                        )
                    }
                }
            }
        }

        val shared: LocalStorage
            get() = instance ?: throw IllegalStateException("LocalStorage not initialized. Call init() first.")
    }

    private val accountsKey = "vela.accounts"
    private val pendingUploadsKey = "vela.pendingUploads"
    private val customTokensKey = "vela.customTokens"

    // MARK: - Accounts

    @Serializable
    data class StoredAccount(
        val id: String,
        val name: String,
        val publicKeyHex: String,
        val address: String,
        val createdAt: Long = System.currentTimeMillis(),
    )

    fun saveAccount(account: StoredAccount) {
        val accounts = loadAccounts().toMutableList()
        accounts.removeAll { it.id == account.id }
        accounts.add(account)
        save(accountsKey, json.encodeToString(accounts))
    }

    fun loadAccounts(): List<StoredAccount> {
        val data = prefs.getString(accountsKey, null) ?: return emptyList()
        return try {
            json.decodeFromString(data)
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun findAccount(credentialId: String): StoredAccount? =
        loadAccounts().find { it.id == credentialId }

    // MARK: - Pending Uploads

    @Serializable
    data class PendingUpload(
        val id: String,
        val name: String,
        val publicKeyHex: String,
        val attestationObjectHex: String,
        val createdAt: Long = System.currentTimeMillis(),
    )

    fun savePendingUpload(upload: PendingUpload) {
        val uploads = loadPendingUploads().toMutableList()
        uploads.removeAll { it.id == upload.id }
        uploads.add(upload)
        save(pendingUploadsKey, json.encodeToString(uploads))
    }

    fun loadPendingUploads(): List<PendingUpload> {
        val data = prefs.getString(pendingUploadsKey, null) ?: return emptyList()
        return try {
            json.decodeFromString(data)
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun removePendingUpload(credentialId: String) {
        val uploads = loadPendingUploads().toMutableList()
        uploads.removeAll { it.id == credentialId }
        save(pendingUploadsKey, json.encodeToString(uploads))
    }

    fun hasPendingUploads(): Boolean = loadPendingUploads().isNotEmpty()

    // MARK: - Custom Tokens

    @Serializable
    data class CustomToken(
        val id: String,
        val chainId: Int,
        val contractAddress: String,
        val symbol: String,
        val name: String,
        val decimals: Int,
        val networkName: String,
    ) {
        val networkId: String
            get() = app.getvela.wallet.model.Network.networkId(chainId)
    }

    fun saveCustomToken(token: CustomToken) {
        val tokens = loadCustomTokens().toMutableList()
        tokens.removeAll { it.id == token.id }
        tokens.add(token)
        save(customTokensKey, json.encodeToString(tokens))
    }

    fun loadCustomTokens(): List<CustomToken> {
        val data = prefs.getString(customTokensKey, null) ?: return emptyList()
        return try {
            json.decodeFromString(data)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun save(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }
}
