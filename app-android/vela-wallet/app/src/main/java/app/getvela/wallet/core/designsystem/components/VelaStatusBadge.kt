package app.getvela.wallet.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaSizing

/**
 * Outcome status badge variants (spec 014 data-model §3) — soft tinted disc +
 * base-colored glyph, 56dp ([VelaSizing.emptyStateCircle]).
 */
enum class BadgeVariant {
    /** Green ✓ — A11, B5. */
    Success,

    /** Amber ! — A12, A13, E8. */
    Warning,

    /** Dark disc ! — E4, E5, B6. */
    Neutral,

    /** Red × — E1, E2, E6, E7, E9, E10, B3, B4. */
    Error,

    /** Amber clock — E3. */
    Timeout,

    /** Blue ! — B2. */
    Info,
}

/** The single status-badge authority (decorative; outcomes carry the headline). */
@Composable
fun VelaStatusBadge(
    variant: BadgeVariant,
    modifier: Modifier = Modifier,
) {
    val colors = VelaTheme.colors
    val disc: Color
    val glyphTint: Color
    val glyph: ImageVector
    when (variant) {
        BadgeVariant.Success -> {
            disc = colors.successSoft
            glyphTint = colors.successBase
            glyph = VelaIcons.Check
        }
        BadgeVariant.Warning -> {
            disc = colors.warningSoft
            glyphTint = colors.warningBase
            glyph = VelaIcons.Exclamation
        }
        BadgeVariant.Neutral -> {
            disc = colors.bgSunken
            glyphTint = colors.fgBase
            glyph = VelaIcons.Exclamation
        }
        BadgeVariant.Error -> {
            disc = colors.errorSoft
            glyphTint = colors.errorBase
            glyph = VelaIcons.Close
        }
        BadgeVariant.Timeout -> {
            disc = colors.warningSoft
            glyphTint = colors.warningBase
            glyph = VelaIcons.Clock
        }
        BadgeVariant.Info -> {
            disc = colors.infoSoft
            glyphTint = colors.infoBase
            glyph = VelaIcons.Exclamation
        }
    }
    Box(
        modifier = modifier
            .size(VelaSizing.emptyStateCircle)
            .clip(CircleShape)
            .background(disc),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = glyph,
            contentDescription = null,
            tint = glyphTint,
            modifier = Modifier.size(VelaIconSize.xl),
        )
    }
}
