package app.getvela.wallet.core.passkey

import android.graphics.BitmapFactory
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import uniffi.vela_core_uniffi.passkeyDirectoryEntry
import uniffi.vela_core_uniffi.passkeyDirectoryUrl
import uniffi.vela_core_uniffi.rasterizeSvgPng

/** A directory answer, in the app's own vocabulary. */
data class PasskeyHolder(val name: String, val iconUrl: String?)

/**
 * Names for the authenticator models the compiled catalog cannot name.
 *
 * The catalog carries software passkey providers; hardware keys live in the
 * FIDO metadata service, hundreds of models deep, which is what the directory
 * service answers for. It is OUR service and stores nothing (founder,
 * 2026-08-26) — and the catalog still answers first, instantly and offline, so
 * this only ever runs for a key nothing on the device could name.
 *
 * The core owns the contract: which AAGUIDs are worth asking about, and what
 * counts as an answer (the body must be about the question, and an icon path
 * must be the service's own shape before anything fetches it). This object owns
 * only the transport and the memory.
 *
 * A failure is remembered as "no answer" rather than retried on every
 * recomposition: the row already shows something honest, and nothing here is
 * load-bearing.
 */
object PasskeyDirectory {
    /** Settled answers; `null` means asked with nothing to show for it. */
    private val entries = mutableStateMapOf<String, PasskeyHolder?>()
    private val marks = mutableStateMapOf<String, ImageBitmap?>()
    private val asking = HashSet<String>()

    /** Six seconds: a key list must never wait on a name. */
    private const val TIMEOUT_MS = 6_000

    /**
     * The settled answer for [aaguid], or `null` while there is none. Reading
     * this from a composable subscribes it, so the row recomposes when the
     * answer lands; [lookup] does the asking.
     */
    fun holder(aaguid: String, dark: Boolean): PasskeyHolder? = entries[key(aaguid, dark)]

    /** The settled mark for [url] at [sizePx], or `null` while there is none. */
    fun mark(url: String, sizePx: Int): ImageBitmap? = marks["$url@$sizePx"]

    /** Ask about [aaguid] once per session. Safe to call on every composition. */
    suspend fun lookup(aaguid: String, dark: Boolean) {
        val key = key(aaguid, dark)
        if (entries.containsKey(key)) return
        synchronized(asking) { if (!asking.add(key)) return }
        val holder = withContext(Dispatchers.IO) {
            val url = runCatching { passkeyDirectoryUrl(aaguid) }.getOrNull() ?: return@withContext null
            val json = fetchText(url) ?: return@withContext null
            runCatching { passkeyDirectoryEntry(aaguid, json, dark) }.getOrNull()
                ?.let { PasskeyHolder(it.name, it.iconUrl) }
        }
        entries[key] = holder
        synchronized(asking) { asking.remove(key) }
    }

    /** Fetch and decode a directory mark once per (url, size). */
    suspend fun fetchMark(url: String, sizePx: Int) {
        val key = "$url@$sizePx"
        if (marks.containsKey(key)) return
        synchronized(asking) { if (!asking.add(key)) return }
        val bitmap = withContext(Dispatchers.IO) {
            val bytes = fetchBytes(url) ?: return@withContext null
            // The service serves both: a PNG decodes directly, an SVG goes
            // through the same rasterizer every other piece of core artwork uses.
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                ?: runCatching { rasterizeSvgPng(bytes.decodeToString(), sizePx.toUInt()) }
                    .getOrNull()
                    ?.let { png -> BitmapFactory.decodeByteArray(png, 0, png.size)?.asImageBitmap() }
        }
        marks[key] = bitmap
        synchronized(asking) { asking.remove(key) }
    }

    private fun key(aaguid: String, dark: Boolean) = "${aaguid.lowercase()}|$dark"

    private fun fetchText(url: String): String? = fetchBytes(url, "application/json")?.decodeToString()

    private fun fetchBytes(url: String, accept: String? = null): ByteArray? = runCatching {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            accept?.let { setRequestProperty("Accept", it) }
        }
        try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return@runCatching null
            connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()
}
