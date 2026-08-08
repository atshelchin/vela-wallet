package app.getvela.wallet.feature.wallet.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.wallet.NetworkPillModel

/**
 * Network filter pill (spec vocabulary #3): all-networks (three overlapping
 * chain dots + 全部网络) or single-chain (dot + name), both with a disclosure
 * chevron.
 */
@Composable
fun NetworkFilterPill(
    model: NetworkPillModel,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(VelaRadius.full))
            .background(colors.bgRaised)
            .clickable(onClick = onClick)
            .heightIn(min = VelaSizing.controlSm)
            .padding(horizontal = VelaSpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(VelaSpacing.md),
    ) {
        when (model) {
            is NetworkPillModel.All -> OverlappingDots(model.dots)
            is NetworkPillModel.Single -> ChainDot(color = model.dot, size = WalletMetrics.pillDotSize)
        }
        Text(
            text = when (model) {
                is NetworkPillModel.All -> model.label
                is NetworkPillModel.Single -> model.label
            },
            color = colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.medium,
            fontSize = VelaTextSize.base,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Icon(
            imageVector = VelaIcons.ChevronDown,
            contentDescription = null,
            tint = colors.fgMuted,
            modifier = Modifier.size(VelaIconSize.sm),
        )
    }
}

/** Three chain dots overlapped by space.sm, each ringed with the pill surface. */
@Composable
private fun OverlappingDots(dots: List<Color>) {
    val colors = VelaTheme.colors
    Row(horizontalArrangement = Arrangement.spacedBy(-VelaSpacing.sm)) {
        dots.forEach { dot ->
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .size(WalletMetrics.pillDotSize)
                    .border(VelaBorder.emphasis, colors.bgRaised, CircleShape)
                    .padding(VelaBorder.emphasis)
                    .background(dot, CircleShape),
            )
        }
    }
}
