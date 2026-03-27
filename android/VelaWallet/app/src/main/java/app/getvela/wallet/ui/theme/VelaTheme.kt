package app.getvela.wallet.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// MARK: - Colors (matches iOS VelaColor)

object VelaColor {
    val bg = Color(0xFFFAFAF8)
    val bgCard = Color.White
    val bgWarm = Color(0xFFF5F3EF)

    val textPrimary = Color(0xFF1A1A18)
    val textSecondary = Color(0xFF7A776E)
    val textTertiary = Color(0xFFB0ADA5)

    val accent = Color(0xFFE8572A)
    val accentSoft = Color(0xFFFFF0EB)

    val green = Color(0xFF2D8E5F)
    val greenSoft = Color(0xFFEDFAF2)

    val blue = Color(0xFF4267F4)
    val blueSoft = Color(0xFFEDF0FF)

    val border = Color(0xFFECEAE4)

    // Token icon backgrounds
    val ethBg = Color(0xFFEEF0F8)
    val usdcBg = Color(0xFFEDF7F0)
    val daiBg = Color(0xFFFFF8E7)

    // Network icon backgrounds
    val arbBg = Color(0xFFE8F4FD)
    val baseBg = Color(0xFFE8EEFF)
    val opBg = Color(0xFFFFECEC)
}

// MARK: - Typography (matches iOS VelaFont)

object VelaTypography {
    fun heading(sizeSp: Float) = TextStyle(
        fontSize = sizeSp.sp,
        fontWeight = FontWeight.Bold,
        fontFamily = FontFamily.Default,
    )

    fun title(sizeSp: Float) = TextStyle(
        fontSize = sizeSp.sp,
        fontWeight = FontWeight.SemiBold,
        fontFamily = FontFamily.Default,
    )

    fun body(sizeSp: Float) = TextStyle(
        fontSize = sizeSp.sp,
        fontWeight = FontWeight.Normal,
        fontFamily = FontFamily.Default,
    )

    fun label(sizeSp: Float) = TextStyle(
        fontSize = sizeSp.sp,
        fontWeight = FontWeight.SemiBold,
        fontFamily = FontFamily.Default,
    )

    fun mono(sizeSp: Float) = TextStyle(
        fontSize = sizeSp.sp,
        fontWeight = FontWeight.Medium,
        fontFamily = FontFamily.Monospace,
    )

    fun caption() = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        fontFamily = FontFamily.Default,
    )
}

// MARK: - Spacing & Radius (matches iOS VelaSpacing / VelaRadius)

object VelaRadius {
    val card: Dp = 16.dp
    val cardSmall: Dp = 10.dp
    val button: Dp = 16.dp
}

object VelaSpacing {
    val screenH: Dp = 24.dp
    val cardPadding: Dp = 20.dp
    val itemGap: Dp = 14.dp
}

val VelaCardShape = RoundedCornerShape(VelaRadius.card)
val VelaButtonShape = RoundedCornerShape(VelaRadius.button)

// MARK: - Material 3 Theme Wrapper

private val VelaLightColorScheme = lightColorScheme(
    primary = VelaColor.textPrimary,
    secondary = VelaColor.accent,
    background = VelaColor.bg,
    surface = VelaColor.bgCard,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = VelaColor.textPrimary,
    onSurface = VelaColor.textPrimary,
    outline = VelaColor.border,
)

@Composable
fun VelaWalletTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = VelaLightColorScheme,
        content = content,
    )
}
