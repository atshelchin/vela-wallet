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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.formatBalance
import app.getvela.wallet.service.ApiNft
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
    onNftClick: (ApiNft) -> Unit = {},
    onSendClick: () -> Unit = {},
    onReceiveClick: () -> Unit = {},
    onAddTokenClick: () -> Unit = {},
) {
    var tokens by remember { mutableStateOf<List<ApiToken>>(emptyList()) }
    var nfts by remember { mutableStateOf<List<ApiNft>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var activeTab by remember { mutableIntStateOf(0) } // 0=tokens, 1=nfts
    val clipboard = LocalClipboardManager.current

    val totalUSD by remember(tokens) {
        derivedStateOf { tokens.sumOf { it.usdValue } }
    }
    val sortedTokens by remember(tokens) {
        derivedStateOf { tokens.sortedByDescending { it.usdValue } }
    }

    // Load data + auto refresh every 30s
    LaunchedEffect(wallet.address) {
        if (wallet.address.isEmpty()) return@LaunchedEffect
        val api = WalletApiService()
        while (isActive) {
            isLoading = tokens.isEmpty()
            val (fetchedTokens, fetchedNfts) = withContext(Dispatchers.IO) {
                Pair(api.fetchTokens(wallet.address), api.fetchNFTs(wallet.address))
            }
            tokens = fetchedTokens
            nfts = fetchedNfts
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

            // Tab picker (Tokens / NFTs)
            item {
                Row(
                    modifier = Modifier
                        .padding(horizontal = VelaSpacing.screenH)
                        .padding(bottom = 12.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(VelaRadius.cardSmall))
                        .background(VelaColor.bgWarm)
                        .padding(3.dp),
                ) {
                    listOf(stringResource(R.string.home_tokens) to 0, stringResource(R.string.home_nfts) to 1).forEach { (label, tab) ->
                        Text(
                            text = label,
                            style = VelaTypography.label(13f),
                            color = if (activeTab == tab) VelaColor.textPrimary else VelaColor.textTertiary,
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (activeTab == tab) VelaColor.bgCard else Color.Transparent)
                                .clickable { activeTab = tab }
                                .padding(vertical = 10.dp),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            // Add token button (only in tokens tab)
            if (activeTab == 0) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = VelaSpacing.screenH)
                            .padding(bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Spacer(Modifier.weight(1f))
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(VelaColor.accentSoft)
                                .clickable(onClick = onAddTokenClick)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(Icons.Default.Add, null, Modifier.size(12.dp), tint = VelaColor.accent)
                            Text("Add Token", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.accent)
                        }
                    }
                }
            }

            // Content based on active tab
            if (activeTab == 1) {
                // NFT grid
                if (nfts.isEmpty()) {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("🖼", fontSize = 32.sp)
                            Spacer(Modifier.height(12.dp))
                            Text(stringResource(R.string.home_no_nfts), style = VelaTypography.body(14f), color = VelaColor.textTertiary)
                        }
                    }
                } else {
                    // 2-column grid via chunked pairs
                    val rows = nfts.chunked(2)
                    items(rows.size) { rowIndex ->
                        val row = rows[rowIndex]
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            row.forEach { nft ->
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(VelaRadius.card))
                                        .background(VelaColor.bgCard)
                                        .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
                                        .clickable { onNftClick(nft) },
                                ) {
                                    Box(
                                        modifier = Modifier.fillMaxWidth().height(160.dp).background(VelaColor.bgWarm),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text("🖼", fontSize = 24.sp)
                                    }
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        Text(nft.displayName, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary, maxLines = 1)
                                        Text(nft.collectionName ?: nft.chainName, fontSize = 11.sp, color = VelaColor.textTertiary, maxLines = 1)
                                    }
                                }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }

            // Token list (only when tokens tab active)
            if (activeTab == 0 && isLoading && tokens.isEmpty()) {
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
            } else if (activeTab == 0 && tokens.isEmpty()) {
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
            } else if (activeTab == 0) {
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
