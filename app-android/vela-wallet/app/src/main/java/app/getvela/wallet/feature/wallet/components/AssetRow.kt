package app.getvela.wallet.feature.wallet.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.wallet.AssetFiatModel
import app.getvela.wallet.feature.wallet.AssetRowModel

/** Masked fiat line glyphs (presentation of the Masked variant, mock H5). */
private const val FIAT_MASK = "••••"

/**
 * Token icon (spec vocabulary #10): circular lettermark glyph on bg.sunken with
 * a bottom-trailing chain-dot badge.
 */
@Composable
fun TokenIcon(ticker: String, badgeColor: Color, modifier: Modifier = Modifier) {
    val colors = VelaTheme.colors
    Box(modifier = modifier, contentAlignment = Alignment.BottomEnd) {
        Box(
            modifier = Modifier
                .size(WalletMetrics.avatarSize)
                .background(colors.bgSunken, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = ticker.take(3).uppercase(),
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xs,
                maxLines = 1,
            )
        }
        ChainBadge(color = badgeColor)
    }
}

/**
 * Asset row (spec vocabulary #9): TokenIcon, ticker + chain name, trailing
 * balance + fiat line. Variants: no-price (orange 无价格, mock H4), masked
 * (both lines dotted, mock H5), long-value truncation (H7).
 */
@Composable
fun AssetRow(model: AssetRowModel, modifier: Modifier = Modifier) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = VelaSpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TokenIcon(ticker = model.ticker, badgeColor = model.badgeColor)
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = model.ticker,
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.semibold,
                fontSize = VelaTextSize.lg,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = model.chain,
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.base,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                text = model.balance,
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.semibold,
                fontSize = VelaTextSize.lg,
                maxLines = 1,
                textAlign = TextAlign.End,
            )
            when (val fiat = model.fiat) {
                is AssetFiatModel.Value -> Text(
                    text = fiat.text,
                    color = colors.fgSubtle,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.regular,
                    fontSize = VelaTextSize.base,
                    maxLines = 1,
                    textAlign = TextAlign.End,
                )
                is AssetFiatModel.NoPrice -> Text(
                    text = fiat.text,
                    color = colors.warningBase,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.medium,
                    fontSize = VelaTextSize.base,
                    maxLines = 1,
                    textAlign = TextAlign.End,
                )
                AssetFiatModel.Masked -> Text(
                    text = FIAT_MASK,
                    color = colors.fgSubtle,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.regular,
                    fontSize = VelaTextSize.base,
                    maxLines = 1,
                    textAlign = TextAlign.End,
                )
            }
        }
    }
}
