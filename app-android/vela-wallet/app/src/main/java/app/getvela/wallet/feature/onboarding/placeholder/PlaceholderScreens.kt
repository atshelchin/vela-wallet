package app.getvela.wallet.feature.onboarding.placeholder

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.components.VelaLogo
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaOpacity
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings

/**
 * Deliberate placeholder destinations (spec scope / FR-002, 006/007 precedent):
 * the real create/import flows are future specs. Existing corpus keys only
 * (research D11) — no new copy was minted for these.
 */
@Composable
fun CreatePlaceholderScreen(darkTheme: Boolean, onBack: () -> Unit) {
    PlaceholderScaffold(
        titleKey = I18nKeys.Create.HEADER,
        darkTheme = darkTheme,
        onBack = onBack,
    )
}

@Composable
fun ImportPlaceholderScreen(darkTheme: Boolean, onBack: () -> Unit) {
    PlaceholderScaffold(
        titleKey = I18nKeys.Welcome.ALREADY_HAVE_WALLET,
        darkTheme = darkTheme,
        onBack = onBack,
    )
}

@Composable
private fun PlaceholderScaffold(
    titleKey: String,
    darkTheme: Boolean,
    onBack: () -> Unit,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bgBase)
            .safeDrawingPadding(),
    ) {
        // Nav bar: [back icon] [centered title] per the design-system top-bar spec.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(VelaSizing.emptyStateCircle),
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = VelaSpacing.md)
                    .size(VelaSizing.hitTarget),
            ) {
                Icon(
                    imageVector = VelaIcons.ArrowLeft,
                    contentDescription = strings.t(I18nKeys.Common.CANCEL),
                    tint = colors.fgBase,
                )
            }
            Text(
                text = strings.t(titleKey),
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl,
                modifier = Modifier.align(Alignment.Center),
            )
        }
        VelaLogo(
            darkTheme = darkTheme,
            contentDescription = null,
            modifier = Modifier
                .align(Alignment.Center)
                .size(VelaSizing.emptyStateCircle)
                .alpha(VelaOpacity.dim),
        )
    }
}
