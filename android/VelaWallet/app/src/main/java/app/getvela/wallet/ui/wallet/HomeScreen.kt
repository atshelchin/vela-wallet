package app.getvela.wallet.ui.wallet

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.formatBalance
import app.getvela.wallet.service.ApiToken
import app.getvela.wallet.service.WalletApiService
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    wallet: WalletState,
    onTokenClick: (ApiToken) -> Unit = {},
    onSendClick: () -> Unit = {},
    onReceiveClick: () -> Unit = {},
) {
    var tokens by remember { mutableStateOf<List<ApiToken>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current

    val totalUSD by remember(tokens) {
        derivedStateOf { tokens.sumOf { it.usdValue } }
    }
    val sortedTokens by remember(tokens) {
        derivedStateOf { tokens.sortedByDescending { it.usdValue } }
    }

    // Load data + auto refresh
    LaunchedEffect(wallet.address) {
        if (wallet.address.isEmpty()) return@LaunchedEffect
        val api = WalletApiService()
        while (isActive) {
            isLoading = tokens.isEmpty()
            val result = withContext(Dispatchers.IO) {
                api.fetchTokens(wallet.address)
            }
            tokens = result
            isLoading = false
            delay(30_000)
        }
    }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            isRefreshing = true
            // Trigger reload via coroutine
        },
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(VelaColor.bg)
                .systemBarsPadding(),
        ) {
            // Balance section
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Account name
                    wallet.activeAccount?.let { account ->
                        Text(
                            text = account.name,
                            style = VelaTypography.label(15f),
                            color = VelaColor.textPrimary,
                        )
                        Spacer(Modifier.height(6.dp))
                    }

                    // Address chip
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(VelaColor.bgWarm)
                            .clickable { clipboard.setText(AnnotatedString(wallet.address)) }
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = wallet.shortAddress,
                            style = VelaTypography.mono(13f),
                            color = VelaColor.textSecondary,
                        )
                        Icon(
                            imageVector = Icons.Default.ContentCopy,
                            contentDescription = "Copy",
                            modifier = Modifier.size(12.dp),
                            tint = VelaColor.textSecondary,
                        )
                    }

                    Spacer(Modifier.height(8.dp))

                    // Total balance
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = "$${String.format("%,d", totalUSD.toLong())}",
                            fontSize = 44.sp,
                            fontWeight = FontWeight.Bold,
                            color = VelaColor.textPrimary,
                            letterSpacing = (-2).sp,
                        )
                        Text(
                            text = ".${String.format("%02d", (totalUSD * 100).toLong() % 100)}",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Medium,
                            color = VelaColor.textTertiary,
                            modifier = Modifier.padding(bottom = 2.dp),
                        )
                    }
                }
            }

            // Action buttons
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = VelaSpacing.screenH)
                        .padding(bottom = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    HomeActionButton(
                        icon = Icons.Default.ArrowUpward,
                        title = stringResource(R.string.home_send),
                        isPrimary = true,
                        onClick = onSendClick,
                        modifier = Modifier.weight(1f),
                    )
                    HomeActionButton(
                        icon = Icons.Default.ArrowDownward,
                        title = stringResource(R.string.home_receive),
                        isPrimary = false,
                        onClick = onReceiveClick,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Section header
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = VelaSpacing.screenH)
                        .padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.home_tokens),
                        style = VelaTypography.caption().copy(letterSpacing = 1.5.sp),
                        color = VelaColor.textTertiary,
                    )
                }
            }

            // Loading / Empty / Token list
            if (isLoading && tokens.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 40.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = VelaColor.textTertiary,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.height(16.dp))
                        Text("Loading...", style = VelaTypography.body(14f), color = VelaColor.textTertiary)
                    }
                }
            } else if (tokens.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .background(VelaColor.bgWarm, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("📭", fontSize = 22.sp)
                        }
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.home_no_activity),
                            style = VelaTypography.body(14f),
                            color = VelaColor.textTertiary,
                        )
                    }
                }
            } else {
                items(sortedTokens, key = { it.id }) { token ->
                    TokenRow(
                        token = token,
                        onClick = { onTokenClick(token) },
                    )
                }
            }

            // Bottom padding
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

// MARK: - Action Button (matches iOS ActionButton)

@Composable
private fun HomeActionButton(
    icon: ImageVector,
    title: String,
    isPrimary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bg = if (isPrimary) VelaColor.textPrimary else VelaColor.bgCard
    val fg = if (isPrimary) Color.White else VelaColor.textPrimary

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(VelaRadius.card))
            .then(
                if (!isPrimary) Modifier.border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
                else Modifier
            )
            .background(bg)
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(15.dp),
            tint = fg,
        )
        Spacer(Modifier.width(8.dp))
        Text(text = title, style = VelaTypography.label(14f), color = fg)
    }
}

// MARK: - Token Row (matches iOS TokenRow)

@Composable
private fun TokenRow(
    token: ApiToken,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 28.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Token icon placeholder
        Box(
            modifier = Modifier
                .size(42.dp)
                .background(VelaColor.ethBg, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = token.symbol.take(3),
                style = VelaTypography.label(14f),
                color = VelaColor.textSecondary,
            )
        }

        Spacer(Modifier.width(VelaSpacing.itemGap))

        // Name / chain
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = token.symbol,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = VelaColor.textPrimary,
            )
            Text(
                text = token.chainName,
                fontSize = 12.sp,
                color = VelaColor.textTertiary,
            )
        }

        // Balance / USD
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = formatBalance(token.balanceDouble),
                style = VelaTypography.label(15f),
                color = VelaColor.textPrimary,
            )
            if (token.usdValue > 0) {
                Text(
                    text = "$${String.format("%.2f", token.usdValue)}",
                    fontSize = 12.sp,
                    color = VelaColor.textTertiary,
                )
            }
        }
    }
}
