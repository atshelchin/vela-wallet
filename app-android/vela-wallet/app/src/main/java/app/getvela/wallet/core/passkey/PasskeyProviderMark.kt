package app.getvela.wallet.core.passkey

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.feature.onboarding.core.CreateKeyRow
import app.getvela.wallet.feature.onboarding.core.KeyMethod
import uniffi.vela_core_uniffi.passkeyFallbackPng
import uniffi.vela_core_uniffi.passkeyProviderPng

/**
 * The mark of the vault holding a passkey — Apple Passwords, 1Password,
 * Windows Hello — rasterized by vela-core from the AAGUID the authenticator
 * reported at registration (spec 019, founder call 2026-08-26).
 *
 * Three sources, in order: the provider's own mark from the compiled catalog;
 * the directory service's mark for a model no catalog carries (hardware keys);
 * and the security-key artwork when neither can name it but the authenticator at
 * least said what KIND it is. A platform authenticator nobody can name gets
 * none of them, and the caller keeps the glyph it always drew.
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
    /** The row this mark stands for; everything comes off it. */
    key: CreateKeyRow,
    /** The mark's content description. */
    label: String,
    size: Dp,
    modifier: Modifier = Modifier,
): Boolean {
    val dark = VelaTheme.isDark
    val colors = VelaTheme.colors
    val sizePx = with(LocalDensity.current) { size.roundToPx() }.coerceAtLeast(1)
    val palette = MarkPalette(
        strong = colors.fgMuted.hex(),
        soft = colors.borderStrong.hex(),
        hole = colors.bgBase.hex(),
    )
    // The directory is asked once per AAGUID; its answer arrives as state, so
    // the row recomposes when it lands rather than blocking on it.
    val listed = PasskeyDirectory.holder(key.aaguid, dark)
    LaunchedEffect(key.aaguid, dark) {
        if (key.aaguid.isNotBlank()) PasskeyDirectory.lookup(key.aaguid, dark)
    }
    LaunchedEffect(listed?.iconUrl, sizePx) {
        listed?.iconUrl?.let { PasskeyDirectory.fetchMark(it, sizePx) }
    }

    val bitmap = remember(key.aaguid, key.transports, key.method, dark, palette, sizePx) {
        providerBitmap(key.aaguid, dark, sizePx)
    }
        ?: listed?.iconUrl?.let { PasskeyDirectory.mark(it, sizePx) }
        ?: remember(key.authenticatorAttachment, key.transports, key.method, palette, sizePx) {
            fallbackBitmap(key, palette, sizePx)
        }
        ?: return false
    Image(
        bitmap = bitmap,
        contentDescription = label.ifEmpty { null },
        modifier = modifier.size(size),
    )
    return true
}

/**
 * The three colour slots the fallback artwork wears — the app's tokens, not the
 * greys it shipped with.
 */
data class MarkPalette(val strong: String, val soft: String, val hole: String)

/** `#rrggbb`: the artwork is an SVG, and an SVG wants what CSS wants. */
private fun Color.hex(): String = String.format("#%06X", toArgb() and 0xFFFFFF)

private fun fallbackBitmap(key: CreateKeyRow, palette: MarkPalette, sizePx: Int): ImageBitmap? {
    val id = "f|${key.authenticatorAttachment}|${key.transports}|${key.method}|" +
        "${palette.strong}@$sizePx"
    markCache.get(id)?.let { return it }
    synchronized(misses) { if (misses.contains(id)) return null }
    val bytes = runCatching {
        passkeyFallbackPng(
            authenticatorAttachment = key.authenticatorAttachment,
            transports = key.transports,
            choseSecurityKey = key.method == KeyMethod.SecurityKey,
            strong = palette.strong,
            soft = palette.soft,
            hole = palette.hole,
            sizePx = sizePx.toUInt(),
        )
    }.getOrNull()
    val decoded = bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
    if (decoded == null) {
        synchronized(misses) { misses.add(id) }
        return null
    }
    return decoded.asImageBitmap().also { markCache.put(id, it) }
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
