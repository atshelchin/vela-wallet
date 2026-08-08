package app.getvela.wallet.feature.wallet.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.wallet.NetworkPillModel
import app.getvela.wallet.feature.wallet.WalletHeaderModel

/**
 * Wallet header (spec vocabulary #2): IdenticonAvatar + truncating name +
 * disclosure chevron + middle-truncated address, trailing NetworkFilterPill.
 * The name truncates rather than pushing the pill off-screen (H7 edge case).
 */
@Composable
fun WalletHeaderRow(
    header: WalletHeaderModel,
    pill: NetworkPillModel,
    modifier: Modifier = Modifier,
    onPillClick: () -> Unit = {},
) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IdenticonAvatar(seed = header.identiconSeed, contentDescription = header.name)
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = header.name,
                    color = colors.fgBase,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.semibold,
                    fontSize = VelaTextSize.xl,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Spacer(modifier = Modifier.width(VelaSpacing.sm))
                Icon(
                    imageVector = VelaIcons.ChevronDown,
                    contentDescription = null,
                    tint = colors.fgMuted,
                    modifier = Modifier.size(VelaIconSize.sm),
                )
            }
            Text(
                text = header.addressDisplay,
                color = colors.fgSubtle,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.sm,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(modifier = Modifier.width(VelaSpacing.md))
        NetworkFilterPill(model = pill, onClick = onPillClick)
    }
}
