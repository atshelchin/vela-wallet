package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Done
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.formatBalance
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.ApiToken
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun TokenDetailScreen(
    token: ApiToken,
    onBack: () -> Unit,
    onSend: () -> Unit = {},
    onReceive: () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = token.symbol, onBack = onBack)

        // Token header
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VelaSpacing.screenH),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(8.dp))

            // Token icon
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(VelaColor.ethBg, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = token.symbol.take(3),
                    style = VelaTypography.label(20f),
                    color = VelaColor.textSecondary,
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(text = token.name, style = VelaTypography.heading(22f), color = VelaColor.textPrimary)
            Spacer(Modifier.height(4.dp))
            Text(text = token.chainName, style = VelaTypography.body(14f), color = VelaColor.textTertiary)

            Spacer(Modifier.height(16.dp))

            // Balance
            Text(
                text = "${formatBalance(token.balanceDouble)} ${token.symbol}",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = VelaColor.textPrimary,
                letterSpacing = (-1).sp,
            )
            if (token.usdValue > 0) {
                Text(
                    text = "$${String.format("%.2f", token.usdValue)}",
                    style = VelaTypography.body(16f),
                    color = VelaColor.textTertiary,
                )
            }

            Spacer(Modifier.height(16.dp))

            // Action buttons
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SmallActionButton(
                    icon = Icons.Default.ArrowUpward,
                    label = stringResource(R.string.home_send),
                    isPrimary = true,
                    onClick = onSend,
                    modifier = Modifier.weight(1f),
                )
                SmallActionButton(
                    icon = Icons.Default.ArrowDownward,
                    label = stringResource(R.string.home_receive),
                    isPrimary = false,
                    onClick = onReceive,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        // Token Info section
        Text(
            text = stringResource(R.string.token_info),
            style = VelaTypography.caption().copy(letterSpacing = 1.5.sp),
            color = VelaColor.textTertiary,
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH, vertical = 8.dp),
        )

        Column(
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
        ) {
            InfoRow(label = stringResource(R.string.token_name), value = token.name)
            InfoRow(label = stringResource(R.string.token_symbol), value = token.symbol)
            InfoRow(label = stringResource(R.string.token_network), value = token.chainName)
            InfoRow(label = stringResource(R.string.token_decimals), value = "${token.decimals}")

            if (token.tokenAddress != null) {
                InfoRow(
                    label = stringResource(R.string.token_contract),
                    value = token.tokenAddress,
                    isMono = true,
                    copyable = true,
                )
            } else {
                InfoRow(label = stringResource(R.string.token_type), value = "Native")
            }

            token.priceUsd?.let { price ->
                InfoRow(
                    label = stringResource(R.string.token_price),
                    value = "$${String.format("%.4f", price)}",
                    isLast = true,
                )
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun SmallActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isPrimary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bg = if (isPrimary) VelaColor.textPrimary else VelaColor.bgCard
    val fg = if (isPrimary) Color.White else VelaColor.textPrimary

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(VelaRadius.cardSmall))
            .then(
                if (!isPrimary) Modifier.border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.cardSmall))
                else Modifier
            )
            .background(bg)
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(14.dp), tint = fg)
        Spacer(Modifier.width(6.dp))
        Text(label, style = VelaTypography.label(14f), color = fg)
    }
}

@Composable
private fun InfoRow(
    label: String,
    value: String,
    isMono: Boolean = false,
    copyable: Boolean = false,
    isLast: Boolean = false,
) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (copyable) Modifier.clickable {
                    clipboard.setText(AnnotatedString(value))
                    copied = true
                } else Modifier
            )
            .padding(horizontal = 18.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, fontSize = 13.sp, color = VelaColor.textTertiary)
        Spacer(Modifier.weight(1f))

        if (copyable) {
            Text(
                text = shortAddr(value),
                style = if (isMono) VelaTypography.mono(12f) else VelaTypography.body(13f),
                color = VelaColor.textPrimary,
            )
            Spacer(Modifier.width(4.dp))
            Icon(
                imageVector = if (copied) Icons.Default.Done else Icons.Default.ContentCopy,
                contentDescription = null,
                modifier = Modifier.size(10.dp),
                tint = VelaColor.textTertiary,
            )
        } else {
            Text(
                text = value,
                style = if (isMono) VelaTypography.mono(13f) else VelaTypography.label(13f),
                color = VelaColor.textPrimary,
            )
        }
    }

    if (!isLast) {
        HorizontalDivider(color = VelaColor.border, thickness = 1.dp)
    }
}
