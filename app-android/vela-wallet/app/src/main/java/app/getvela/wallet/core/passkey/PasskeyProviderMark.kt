package app.getvela.wallet.core.passkey

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import uniffi.vela_core_uniffi.passkeyProviderPng

/**
 * The mark of the vault holding a passkey — Apple Passwords, 1Password,
 * Windows Hello — rasterized by vela-core from the AAGUID the authenticator
 * reported at registration (spec 019, founder call 2026-08-26).
 *
 * Draws NOTHING when the catalog has no entry. That is a normal answer, not a
 * failure: hardware keys live in the FIDO metadata service rather than in this
 * catalog, and an authenticator may report no AAGUID at all. The caller keeps
 * the glyph it always drew, which is what `key.method` is for.
 *
 * The lookup is offline by construction — a directory service would learn which
 * vault holds this wallet's key, and that is nobody's business.
 *
 * Preview/tooling note: the native library is not loadable in the preview
 * process, so the FFI touch sits behind runCatching and simply renders nothing
 * — the same degradation an unknown AAGUID gets.
 */
@Composable
fun PasskeyProviderMark(
    aaguid: String,
    /** The provider's name — the mark's content description. */
    name: String,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val dark = VelaTheme.isDark
    val sizePx = with(LocalDensity.current) { size.roundToPx() }.coerceAtLeast(1)
    val bitmap = remember(aaguid, dark, sizePx) { providerBitmap(aaguid, dark, sizePx) } ?: return
    Image(
        bitmap = bitmap,
        contentDescription = name.ifEmpty { null },
        modifier = modifier.size(size),
    )
}

/** Decoded-bitmap LRU keyed on aaguid + theme + pixel size. */
private val markCache = LruCache<String, ImageBitmap>(32)

/**
 * Misses are remembered as well: an unknown AAGUID must not re-enter the FFI
 * every time a key list recomposes.
 */
private val misses = HashSet<String>()

private fun providerBitmap(aaguid: String, dark: Boolean, sizePx: Int): ImageBitmap? {
    if (aaguid.isBlank()) return null
    val key = "$aaguid|$dark@$sizePx"
    markCache.get(key)?.let { return it }
    synchronized(misses) { if (misses.contains(key)) return null }
    val bytes = runCatching { passkeyProviderPng(aaguid, dark, sizePx.toUInt()) }.getOrNull()
    val decoded = bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
    if (decoded == null) {
        synchronized(misses) { misses.add(key) }
        return null
    }
    return decoded.asImageBitmap().also { markCache.put(key, it) }
}
