package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import app.getvela.wallet.core.designsystem.components.VelaAddressStrip
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.core.identicon.IdenticonImage
import app.getvela.wallet.feature.onboarding.core.CreateKeyRow

/**
 * The wallet exists.
 *
 * This is the first moment an address is shown, and that ordering is a rule
 * rather than a layout choice: the core withholds `address` until the group has
 * landed and the account is saved, because an address shown earlier is an
 * address someone can fund before the wallet is reachable.
 *
 * The identicon is rendered from the address by the same core that derived it,
 * so what the person memorises here is what every other client draws.
 */
@Composable
fun ColumnScope.DoneScreen(
    address: String,
    walletName: String,
    keys: List<CreateKeyRow>,
    onEnter: () -> Unit,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors

    Column(
        modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = VelaIcons.Check,
                contentDescription = null,
                tint = colors.successBase,
                modifier = Modifier.size(VelaIconSize.xl),
            )
            Spacer(modifier = Modifier.size(VelaSpacing.md))
            Text(
                text = strings.t(I18nKeys.Create.SUCCESS_TITLE),
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl3,
            )
        }
        Spacer(modifier = Modifier.height(VelaSpacing.md))
        Text(
            text = strings.t(
                I18nKeys.Create.SUCCESS_MESSAGE,
                mapOf("count" to keys.size.toString()),
            ),
            color = colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontSize = VelaTextSize.lg,
        )

        Spacer(modifier = Modifier.height(VelaSpacing.xl4))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.xl))
                .background(colors.bgRaised)
                .padding(VelaSpacing.xl2),
            verticalArrangement = Arrangement.spacedBy(VelaSpacing.xl),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IdenticonImage(seed = address, size = VelaSizing.emptyStateCircle)
                Spacer(modifier = Modifier.size(VelaSpacing.lg))
                Column {
                    Text(
                        text = walletName,
                        color = colors.fgBase,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.semibold,
                        fontSize = VelaTextSize.xl,
                    )
                    Text(
                        text = strings.t(I18nKeys.Create.IDENTICON_HINT),
                        color = colors.fgMuted,
                        fontFamily = VelaFontFamily,
                        fontSize = VelaTextSize.sm,
                    )
                }
            }

            Column {
                Text(
                    text = strings.t(I18nKeys.Create.WALLET_ADDRESS_LABEL),
                    color = colors.fgMuted,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.semibold,
                    fontSize = VelaTextSize.sm,
                )
                Spacer(modifier = Modifier.height(VelaSpacing.md))
                VelaAddressStrip(
                    address = address,
                    copyLabel = strings.t(I18nKeys.Flow.COPY_ADDRESS),
                    copiedLabel = strings.t(I18nKeys.Flow.COPIED),
                )
            }
        }

        Spacer(modifier = Modifier.height(VelaSpacing.xl3))

        keys.forEach { key ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = VelaSpacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = key.name,
                    color = colors.fgBase,
                    fontFamily = VelaFontFamily,
                    fontSize = VelaTextSize.base,
                )
                Text(
                    text = strings.t(
                        if (key.synced) {
                            I18nKeys.Create.KEY_SYNCED_BADGE
                        } else {
                            I18nKeys.Create.KEY_DEVICE_ONLY_BADGE
                        },
                    ),
                    color = if (key.synced) colors.successBase else colors.fgMuted,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.medium,
                    fontSize = VelaTextSize.xs,
                )
            }
        }

        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
        Text(
            text = strings.t(I18nKeys.Create.VERIFY_HINT),
            color = colors.fgSubtle,
            fontFamily = VelaFontFamily,
            fontSize = VelaTextSize.base,
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
    }

    VelaPrimaryButton(
        text = strings.t(I18nKeys.Create.ENTER_WALLET_BTN),
        onClick = onEnter,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(modifier = Modifier.height(VelaSpacing.xl))
}
