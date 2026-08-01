package app.getvela.wallet.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaRadius

/**
 * Raised surface per the design system: bg.raised + radius.xl + shadow.sm.
 * The card carries no internal padding — children own it (VelaCard contract).
 */
@Composable
fun VelaCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(VelaRadius.xl)
    Box(
        modifier = modifier
            .shadow(
                elevation = 1.dp,
                shape = shape,
                ambientColor = VelaTheme.colors.fixed.shadowInk,
                spotColor = VelaTheme.colors.fixed.shadowInk,
            )
            .clip(shape)
            .background(VelaTheme.colors.bgRaised),
    ) {
        content()
    }
}
