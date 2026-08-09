package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.wallet.components.WalletMetrics

/**
 * Ghost add row (spec vocabulary #16, mock C4): dashed muted circle with a
 * plus, then a muted label (添加成员). Never raised — it reads as an outline
 * placeholder in the member list.
 */
@Composable
fun GhostAddRow(
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = VelaSizing.hitTarget)
            .padding(vertical = VelaSpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(WalletMetrics.avatarSize),
            contentAlignment = Alignment.Center,
        ) {
            val strokeColor = colors.borderStrong
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(
                    color = strokeColor,
                    radius = size.minDimension / 2f - VelaBorder.hairline.toPx(),
                    style = Stroke(
                        width = VelaBorder.hairline.toPx(),
                        pathEffect = PathEffect.dashPathEffect(
                            floatArrayOf(
                                VelaSpacing.sm.toPx(),
                                VelaSpacing.sm.toPx(),
                            ),
                        ),
                    ),
                )
            }
            Icon(
                imageVector = VelaIcons.Plus,
                contentDescription = null,
                tint = colors.fgSubtle,
                modifier = Modifier.size(VelaIconSize.base),
            )
        }
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
        Text(
            text = label,
            color = colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.medium,
            fontSize = VelaTextSize.lg,
            maxLines = 1,
        )
    }
}
