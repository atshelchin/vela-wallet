package app.getvela.wallet.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing

/** One resolved outcome action: label already localized, press already bound. */
data class VelaStackAction(
    val label: String,
    val primary: Boolean,
    val onClick: () -> Unit,
)

/**
 * Outcome action stack (spec 014): 1 primary CTA on top, then up to 2
 * secondary actions as full-width dark solid rows — the mock's treatment,
 * deliberately NOT the outline welcome-secondary style. This component is the
 * single authority for that row styling (contract §5).
 */
@Composable
fun VelaActionStack(
    actions: List<VelaStackAction>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(VelaSpacing.md),
    ) {
        actions.forEach { action ->
            if (action.primary) {
                VelaPrimaryButton(text = action.label, onClick = action.onClick)
            } else {
                SecondaryActionRow(action)
            }
        }
    }
}

@Composable
private fun SecondaryActionRow(action: VelaStackAction) {
    val colors = VelaTheme.colors
    VelaButtonSurface(onClick = action.onClick, modifier = Modifier) { pressModifier ->
        Box(
            modifier = pressModifier
                .background(colors.bgSunken)
                .border(
                    width = VelaBorder.hairline,
                    color = colors.borderBase,
                    shape = RoundedCornerShape(VelaRadius.full),
                ),
            contentAlignment = Alignment.Center,
        ) {
            ButtonLabel(text = action.label, color = colors.fgBase)
        }
    }
}
