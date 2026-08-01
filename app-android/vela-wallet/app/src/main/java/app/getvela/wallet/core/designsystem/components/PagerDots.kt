package app.getvela.wallet.core.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing

private val DotSize = 8.dp
private val ActiveDotWidth = 20.dp

/**
 * Carousel page indicator at mock pitch: 8dp dots with 4dp gaps, active dot a
 * 20dp accent pill. The whole row is one 44dp-tall (`size.hitTarget`) tap target
 * (FR-010 "dots get expanded hit areas"): a tap maps to the nearest dot by
 * horizontal position, so the effective per-dot hit rects overlap and each
 * exceeds the 44dp floor vertically and the full row width horizontally.
 * State is exposed as a numeral-only description ("2/6") — generated,
 * locale-neutral (FR-003); page changes are also reachable by swiping the pager.
 */
@Composable
fun PagerDots(
    pageCount: Int,
    currentPage: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .height(VelaSizing.hitTarget)
            .semantics {
                stateDescription = "${currentPage + 1}/$pageCount"
            }
            .pointerInput(pageCount) {
                detectTapGestures { offset ->
                    val pitch = size.width.toFloat() / pageCount
                    val index = (offset.x / pitch).toInt().coerceIn(0, pageCount - 1)
                    onSelect(index)
                }
            },
        horizontalArrangement = Arrangement.spacedBy(VelaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(pageCount) { index ->
            val active = index == currentPage
            val width by animateDpAsState(
                targetValue = if (active) ActiveDotWidth else DotSize,
                label = "dotWidth",
            )
            val color by animateColorAsState(
                targetValue = if (active) {
                    VelaTheme.colors.accentBase
                } else {
                    VelaTheme.colors.borderStrong
                },
                label = "dotColor",
            )
            Box(
                modifier = Modifier
                    .size(width = width, height = DotSize)
                    .background(color, RoundedCornerShape(VelaRadius.full)),
            )
        }
    }
}
