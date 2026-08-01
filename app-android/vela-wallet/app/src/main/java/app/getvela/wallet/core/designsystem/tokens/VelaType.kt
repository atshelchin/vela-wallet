package app.getvela.wallet.core.designsystem.tokens

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R

/** core.text sizes (sp; OS font scale applies on top). */
object VelaTextSize {
    val xs: TextUnit = 10.sp
    val sm: TextUnit = 11.sp
    val base: TextUnit = 13.sp
    val lg: TextUnit = 15.sp
    val xl: TextUnit = 17.sp
    val xl2: TextUnit = 20.sp
    val xl3: TextUnit = 26.sp
    val xl4: TextUnit = 32.sp
    val xl5: TextUnit = 40.sp
}

/** core.weight — Android needs per-weight font files (see VelaFontFamily). */
object VelaFontWeight {
    val regular: FontWeight = FontWeight(400)
    val medium: FontWeight = FontWeight(500)
    val semibold: FontWeight = FontWeight(600)
    val bold: FontWeight = FontWeight(700)
}

/** core.leading — line-height multipliers. */
object VelaLeading {
    const val none: Float = 1f
    const val tight: Float = 1.2f
    const val normal: Float = 1.4f
    const val relaxed: Float = 1.6f
    const val amountHero: Float = 1.12f
}

/** core.letterSpacing. */
object VelaLetterSpacing {
    val sectionLabel: TextUnit = 0.6.sp
}

/**
 * font.sans/display/numeric = Plus Jakarta Sans (bundled, 4 weight files).
 * CJK falls through to the system font (spec DV-003). font.mono is not bundled (DV-004).
 */
val VelaFontFamily: FontFamily = FontFamily(
    Font(R.font.plus_jakarta_sans_regular, VelaFontWeight.regular),
    Font(R.font.plus_jakarta_sans_medium, VelaFontWeight.medium),
    Font(R.font.plus_jakarta_sans_semibold, VelaFontWeight.semibold),
    Font(R.font.plus_jakarta_sans_bold, VelaFontWeight.bold),
)
