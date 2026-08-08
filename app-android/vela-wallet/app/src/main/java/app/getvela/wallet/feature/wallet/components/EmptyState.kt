package app.getvela.wallet.feature.wallet.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.wallet.EmptyStateModel

/**
 * In-section empty state (spec vocabulary #11): 56dp sunken circle with an
 * outline icon, title, caption (mock H2).
 */
@Composable
fun EmptyState(
    icon: ImageVector,
    model: EmptyStateModel,
    modifier: Modifier = Modifier,
) {
    val colors = VelaTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = VelaSpacing.xl3),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(VelaSizing.emptyStateCircle)
                .background(colors.bgSunken, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = colors.fgMuted,
                modifier = Modifier.size(VelaIconSize.xl),
            )
        }
        Spacer(modifier = Modifier.height(VelaSpacing.xl))
        Text(
            text = model.title,
            color = colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.semibold,
            fontSize = VelaTextSize.lg,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(VelaSpacing.sm))
        Text(
            text = model.caption,
            color = colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.regular,
            fontSize = VelaTextSize.base,
            textAlign = TextAlign.Center,
        )
    }
}
