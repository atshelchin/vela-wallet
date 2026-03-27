package app.getvela.wallet.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.service.ApiToken
import coil3.compose.SubcomposeAsyncImage

/**
 * Displays a token logo with remote image and text fallback.
 * Matches iOS TokenLogo component.
 */
@Composable
fun TokenLogo(
    token: ApiToken,
    size: Dp = 42.dp,
) {
    val logoUrl = token.logoUrl

    if (logoUrl != null) {
        SubcomposeAsyncImage(
            model = logoUrl,
            contentDescription = token.symbol,
            modifier = Modifier.size(size).clip(CircleShape),
            contentScale = ContentScale.Crop,
            error = { TokenLogoFallback(token.symbol, size) },
            loading = { TokenLogoFallback(token.symbol, size) },
        )
    } else {
        TokenLogoFallback(token.symbol, size)
    }
}

/**
 * Fallback: first letter of symbol in a colored circle.
 */
@Composable
private fun TokenLogoFallback(symbol: String, size: Dp) {
    val color = colorForSymbol(symbol)
    Box(
        modifier = Modifier
            .size(size)
            .background(color, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = symbol.take(1),
            fontSize = (size.value * 0.38f).sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
    }
}

/**
 * Displays a chain logo with remote image and text fallback.
 * Matches iOS ChainLogo component.
 */
@Composable
fun ChainLogo(
    chainId: Int,
    fallbackLabel: String,
    fallbackColor: Color,
    fallbackBg: Color,
    size: Dp = 32.dp,
) {
    val logoUrl = "https://ethereum-data.awesometools.dev/chainlogos/eip155-$chainId.png"
    val cornerRadius = size.value * 0.25f

    SubcomposeAsyncImage(
        model = logoUrl,
        contentDescription = fallbackLabel,
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius.dp)),
        contentScale = ContentScale.Crop,
        error = {
            Box(
                modifier = Modifier
                    .size(size)
                    .background(fallbackBg, RoundedCornerShape(cornerRadius.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = fallbackLabel,
                    fontSize = (size.value * 0.32f).sp,
                    fontWeight = FontWeight.Bold,
                    color = fallbackColor,
                )
            }
        },
        loading = {
            Box(
                modifier = Modifier
                    .size(size)
                    .background(fallbackBg, RoundedCornerShape(cornerRadius.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = fallbackLabel,
                    fontSize = (size.value * 0.32f).sp,
                    fontWeight = FontWeight.Bold,
                    color = fallbackColor,
                )
            }
        },
    )
}

/** Generate a deterministic color from a symbol string. */
private fun colorForSymbol(symbol: String): Color {
    val hash = symbol.sumOf { it.code }
    val colors = listOf(
        Color(0xFF627EEA), Color(0xFF2775CA), Color(0xFFF5AC37), Color(0xFF8247E5),
        Color(0xFF28A0F0), Color(0xFFE84142), Color(0xFF2D8E5F), Color(0xFFF0B90B),
    )
    return colors[kotlin.math.abs(hash) % colors.size]
}
