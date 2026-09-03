package app.getvela.wallet.feature.flows

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.times
import app.getvela.wallet.core.designsystem.components.VelaLogo
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaMonoFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaOnAccent
import app.getvela.wallet.core.designsystem.tokens.VelaOpacity
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.identicon.IdenticonImage
import app.getvela.wallet.feature.flows.components.QrCard

/**
 * R4 — what "Save image" produces (spec 021).
 *
 * Not a screen. It is a render product that ends up in someone's photo library
 * and then in a chat, so its colours are mode-invariant and it carries the
 * wordmark: away from the app, the card has to say what it is on its own.
 *
 * The identicon sits in the middle of the code (founder direction): a card
 * whose address was doctored would carry artwork that no longer matches the
 * characters printed under it.
 */
@Composable
fun ShareCardArtwork(model: ShareCardModel, modifier: Modifier = Modifier) {
    val colors = VelaTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            // Every colour here is fixed rather than themed. The image is saved
            // once and viewed anywhere — a card that rendered in dark mode and
            // was opened on a white chat background would be a different card.
            .background(colors.accentBase)
            .padding(VelaSpacing.xl3),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = model.headline,
            color = VelaOnAccent,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.bold,
            fontSize = VelaTextSize.xl3,
            lineHeight = VelaLeading.hero * VelaTextSize.xl3,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(vertical = VelaSpacing.xl),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(VelaOnAccent, RoundedCornerShape(VelaRadius.xl2))
                .padding(VelaSpacing.xl3),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            QrCard(label = model.headline) {
                IdenticonImage(seed = model.identiconSeed, size = VelaIconSize.xl3)
            }
            Spacer(modifier = Modifier.height(VelaSpacing.lg))
            Text(
                text = model.name,
                color = colors.fixed.shadowInk,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.lg,
            )
            Spacer(modifier = Modifier.height(VelaSpacing.sm))
            listOf(model.lines.first, model.lines.second)
                .filter { it.isNotEmpty() }
                .forEach { line ->
                    Text(
                        text = line,
                        color = colors.fixed.shadowInk.copy(alpha = VelaOpacity.dim),
                        fontFamily = VelaMonoFontFamily,
                        fontSize = VelaTextSize.sm,
                    )
                }
            Spacer(modifier = Modifier.height(VelaSpacing.lg))
            Row(
                modifier = Modifier
                    .border(VelaBorder.hairline, colors.borderBase, CircleShape)
                    .padding(
                        start = VelaSpacing.xs,
                        end = VelaSpacing.lg,
                        top = VelaSpacing.xs,
                        bottom = VelaSpacing.xs,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(VelaIconSize.xl)
                        .background(model.networkMark.badgeColor, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = model.networkMark.ticker,
                        color = VelaOnAccent,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.bold,
                        fontSize = VelaTextSize.xs,
                        maxLines = 1,
                    )
                }
                Spacer(modifier = Modifier.width(VelaSpacing.sm))
                Text(
                    text = model.networkNote,
                    color = colors.fixed.shadowInk,
                    fontFamily = VelaFontFamily,
                    fontSize = VelaTextSize.sm,
                )
            }
        }
        Row(
            modifier = Modifier.padding(vertical = VelaSpacing.xl3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // The card's field is the accent in both appearances, so the mark
            // always draws its on-dark hull — this artwork has no light mode.
            VelaLogo(darkTheme = true, modifier = Modifier.size(VelaSizing.brandMark))
            Spacer(modifier = Modifier.width(VelaSpacing.lg))
            Text(
                text = model.wordmark,
                color = VelaOnAccent,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl3,
                lineHeight = VelaLeading.tight * VelaTextSize.xl3,
            )
        }
    }
}
