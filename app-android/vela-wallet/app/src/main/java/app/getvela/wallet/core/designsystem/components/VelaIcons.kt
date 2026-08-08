package app.getvela.wallet.core.designsystem.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Hand-built Lucide-geometry icons (24×24 viewport, stroke 2 = icon.stroke.base) —
 * the design system mandates Lucide iconography; no icon dependency is bundled
 * for the handful of icons the shipped slices need.
 */
object VelaIcons {

    /** lucide arrow-left. Tint via Icon(tint=…); paths carry currentColor black. */
    val ArrowLeft: ImageVector by lazy {
        builder("VelaArrowLeft").apply {
            strokePath {
                moveTo(19f, 12f)
                lineTo(5f, 12f)
            }
            strokePath {
                moveTo(12f, 19f)
                lineTo(5f, 12f)
                lineTo(12f, 5f)
            }
        }.build()
    }

    /** lucide x — sheet close, error badge glyph (spec 014). */
    val Close: ImageVector by lazy {
        builder("VelaClose").apply {
            strokePath {
                moveTo(18f, 6f)
                lineTo(6f, 18f)
            }
            strokePath {
                moveTo(6f, 6f)
                lineTo(18f, 18f)
            }
        }.build()
    }

    /** lucide check — success badge, checked ack box, copied feedback (spec 014). */
    val Check: ImageVector by lazy {
        builder("VelaCheck").apply {
            strokePath {
                moveTo(20f, 6f)
                lineTo(9f, 17f)
                lineTo(4f, 12f)
            }
        }.build()
    }

    /** lucide chevron-down — 技术详情 disclosure (spec 014). */
    val ChevronDown: ImageVector by lazy {
        builder("VelaChevronDown").apply {
            strokePath {
                moveTo(6f, 9f)
                lineTo(12f, 15f)
                lineTo(18f, 9f)
            }
        }.build()
    }

    /** lucide copy — address strip copy affordance (spec 014). */
    val Copy: ImageVector by lazy {
        builder("VelaCopy").apply {
            // rect x=8 y=8 w=14 h=14 rx=2
            strokePath {
                moveTo(10f, 8f)
                lineTo(20f, 8f)
                arcTo(2f, 2f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 22f, y1 = 10f)
                lineTo(22f, 20f)
                arcTo(2f, 2f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 20f, y1 = 22f)
                lineTo(10f, 22f)
                arcTo(2f, 2f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 8f, y1 = 20f)
                lineTo(8f, 10f)
                arcTo(2f, 2f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 10f, y1 = 8f)
                close()
            }
            // M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2
            strokePath {
                moveTo(4f, 16f)
                curveToRelative(-1.1f, 0f, -2f, -0.9f, -2f, -2f)
                lineTo(2f, 4f)
                curveToRelative(0f, -1.1f, 0.9f, -2f, 2f, -2f)
                lineTo(14f, 2f)
                curveToRelative(1.1f, 0f, 2f, 0.9f, 2f, 2f)
            }
        }.build()
    }

    /** lucide clock — timeout badge glyph (spec 014). */
    val Clock: ImageVector by lazy {
        builder("VelaClock").apply {
            // circle cx=12 cy=12 r=10 as two half arcs
            strokePath {
                moveTo(22f, 12f)
                arcTo(10f, 10f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 2f, y1 = 12f)
                arcTo(10f, 10f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 22f, y1 = 12f)
                close()
            }
            strokePath {
                moveTo(12f, 6f)
                lineTo(12f, 12f)
                lineTo(16f, 14f)
            }
        }.build()
    }

    /**
     * Standalone exclamation mark for the warning/neutral/info status badges
     * (spec 014). Lucide alert-circle geometry minus the circle — the badge
     * supplies its own tinted disc, and rendered text glyphs are banned in
     * components (no string literals).
     */
    val Exclamation: ImageVector by lazy {
        builder("VelaExclamation").apply {
            strokePath {
                moveTo(12f, 5f)
                lineTo(12f, 14f)
            }
            strokePath {
                moveTo(12f, 19f)
                lineTo(12.01f, 19f)
            }
        }.build()
    }

    private fun builder(name: String) = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    )

    private inline fun ImageVector.Builder.strokePath(
        crossinline pathBuilder: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit,
    ) = path(
        fill = null,
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 2f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ) { pathBuilder() }
}
