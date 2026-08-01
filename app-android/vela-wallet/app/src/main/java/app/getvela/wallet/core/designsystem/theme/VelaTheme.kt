package app.getvela.wallet.core.designsystem.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import app.getvela.wallet.core.data.ThemePreference
import app.getvela.wallet.core.designsystem.tokens.VelaColors
import app.getvela.wallet.core.designsystem.tokens.VelaColorsDark
import app.getvela.wallet.core.designsystem.tokens.VelaColorsLight
import app.getvela.wallet.core.designsystem.tokens.VelaOnAccent

val LocalVelaColors = staticCompositionLocalOf { VelaColorsLight }

/** Token access for composables: `VelaTheme.colors.…`. */
object VelaTheme {
    val colors: VelaColors
        @Composable get() = LocalVelaColors.current
}

@Composable
fun ThemePreference.isDarkEffective(): Boolean = when (this) {
    ThemePreference.Light -> false
    ThemePreference.Dark -> true
    ThemePreference.Auto -> isSystemInDarkTheme()
}

/**
 * Theme = token-set activation (core + exactly one palette). Material dynamic color
 * is deliberately absent (brand palette, spec FR-005); the M3 scheme below only
 * feeds the Material components in use (sheet, ripple, scaffold defaults).
 */
@Composable
fun VelaTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) VelaColorsDark else VelaColorsLight
    CompositionLocalProvider(LocalVelaColors provides colors) {
        MaterialTheme(
            colorScheme = colors.toMaterialScheme(darkTheme),
            content = content,
        )
    }
}

private fun VelaColors.toMaterialScheme(dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = accentBase,
        onPrimary = VelaOnAccent,
        primaryContainer = accentSoft,
        onPrimaryContainer = fgBase,
        secondary = fgMuted,
        onSecondary = fgInverse,
        background = bgBase,
        onBackground = fgBase,
        surface = bgRaised,
        onSurface = fgBase,
        surfaceVariant = bgSunken,
        onSurfaceVariant = fgMuted,
        surfaceContainerLow = bgRaised,
        surfaceContainer = bgRaised,
        surfaceContainerHigh = bgRaised,
        outline = borderBase,
        outlineVariant = borderStrong,
        error = errorBase,
        onError = fgInverse,
        errorContainer = errorSoft,
        onErrorContainer = errorBase,
        scrim = fixed.backdrop,
    )
}
