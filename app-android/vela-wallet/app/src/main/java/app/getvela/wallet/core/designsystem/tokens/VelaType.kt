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

    /**
     * The v2 Welcome headline (spec 019). The DTCG scale tops out at 40 and the
     * design asks for 46/38 — this is the compact one, which is what a phone
     * gets (web precedent: WEB_ADDITIONS `text-heroCompact`).
     */
    val hero: TextUnit = 38.sp

    /**
     * One rung further down (46/38/31, ~0.82 a step), for a locale whose
     * headline is too wide for [hero]. Which locales those are is not decided
     * here — the corpus says so in `onboarding.welcome.heroTitleFit`, because
     * the width is a property of the translation: measured at the shipped font
     * the widest authored line runs 6.9em (zh) to 10.9em (ru), and 31 is what
     * fits the widest of them in the 342dp a 390dp frame leaves between its
     * gutters. 390 is the contract, not the floor: a 360dp phone has less
     * column than the widest headline needs and is allowed to wrap (founder
     * direction 2026-08-26). Do not drop a locale a rung to serve it — that
     * shrinks the headline on every phone.
     */
    val heroLong: TextUnit = 31.sp
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

    /** The v2 Welcome headline's leading. */
    const val hero: Float = 1.25f
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

/**
 * font.mono projection. No mono face is bundled (DV-004), so this resolves to
 * the platform monospace family — enough for the fixed-width hex blocks the
 * spec-018 mocks render (contact-row addresses, the C2 地址 block). Declared in
 * the token layer so feature code never names a font itself.
 */
val VelaMonoFontFamily: FontFamily = FontFamily.Monospace
