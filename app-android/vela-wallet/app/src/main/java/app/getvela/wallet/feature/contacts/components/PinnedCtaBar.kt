package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.times
import androidx.compose.ui.text.style.TextAlign
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize

/**
 * Bottom-pinned CTA (spec vocabulary #17, mock C4): the accent 群发转账 button
 * with its caption line underneath. Disabled when the group has no members
 * (spec edge case — the caption still renders the fixture's count).
 */
@Composable
fun PinnedCtaBar(
    label: String,
    caption: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit = {},
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        VelaPrimaryButton(text = label, onClick = onClick, enabled = enabled)
        Spacer(modifier = Modifier.height(VelaSpacing.lg))
        Text(
            text = caption,
            color = VelaTheme.colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.regular,
            fontSize = VelaTextSize.base,
            lineHeight = VelaLeading.normal * VelaTextSize.base,
            textAlign = TextAlign.Center,
        )
    }
}
