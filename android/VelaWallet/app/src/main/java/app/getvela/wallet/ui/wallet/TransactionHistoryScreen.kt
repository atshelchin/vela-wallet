package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.Transaction
import app.getvela.wallet.service.TransactionHistoryService
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionHistoryScreen(
    wallet: WalletState,
    onBack: () -> Unit,
) {
    var transactions by remember { mutableStateOf<List<Transaction>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var selectedTx by remember { mutableStateOf<Transaction?>(null) }

    LaunchedEffect(wallet.address) {
        if (wallet.address.isEmpty()) return@LaunchedEffect
        isLoading = transactions.isEmpty()
        transactions = TransactionHistoryService().fetchTransactions(wallet.address)
        isLoading = false
        isRefreshing = false
    }

    // Detail bottom sheet
    if (selectedTx != null) {
        TransactionDetailSheet(tx = selectedTx!!, onDismiss = { selectedTx = null })
        return
    }

    Column(
        modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.tx_history_title), onBack = onBack)

        when {
            isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), color = VelaColor.textTertiary, strokeWidth = 2.dp)
            }
            transactions.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(64.dp).background(VelaColor.bgWarm, CircleShape), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Receipt, null, Modifier.size(28.dp), tint = VelaColor.textTertiary)
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.tx_history_empty), style = VelaTypography.body(14f), color = VelaColor.textTertiary)
                }
            }
            else -> PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = {
                    isRefreshing = true
                    // Will trigger LaunchedEffect
                },
            ) {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    items(transactions, key = { "${it.hash}_${it.category}" }) { tx ->
                        TransactionRow(tx = tx, userAddress = wallet.address, onClick = { selectedTx = tx })
                    }
                }
            }
        }
    }
}

@Composable
private fun TransactionRow(tx: Transaction, userAddress: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Direction icon
        Box(
            modifier = Modifier.size(40.dp).background(
                when (tx.category) {
                    "send" -> VelaColor.accentSoft
                    "receive" -> VelaColor.greenSoft
                    else -> VelaColor.bgWarm
                }, CircleShape
            ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                when (tx.category) {
                    "send" -> Icons.Default.ArrowUpward
                    "receive" -> Icons.Default.ArrowDownward
                    "approve" -> Icons.Default.CheckCircle
                    else -> Icons.Default.SwapHoriz
                },
                null, Modifier.size(18.dp),
                tint = when (tx.category) {
                    "send" -> VelaColor.accent
                    "receive" -> VelaColor.green
                    else -> VelaColor.textSecondary
                },
            )
        }

        Spacer(Modifier.width(12.dp))

        // Info
        Column(Modifier.weight(1f)) {
            Text(
                when (tx.category) {
                    "send" -> "Sent ${tx.symbol}"
                    "receive" -> "Received ${tx.symbol}"
                    "approve" -> "Approved ${tx.symbol}"
                    else -> "Contract Call"
                },
                fontSize = 15.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary, maxLines = 1,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(tx.chainName, fontSize = 12.sp, color = VelaColor.textTertiary)
                Text("·", fontSize = 12.sp, color = VelaColor.textTertiary)
                Text(tx.timeAgo, fontSize = 12.sp, color = VelaColor.textTertiary)
            }
        }

        // Value
        if (tx.displayValue.isNotEmpty()) {
            Text(
                "${if (tx.isSend) "-" else "+"}${tx.displayValue}",
                fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                color = if (tx.isSend) VelaColor.accent else VelaColor.green,
            )
        }
    }
}

// MARK: - Transaction Detail

@Composable
private fun TransactionDetailSheet(tx: Transaction, onDismiss: () -> Unit) {
    val clipboard = LocalClipboardManager.current

    Column(
        modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.tx_detail_title), onBack = onDismiss)

        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(16.dp))

            // Direction icon
            Box(
                modifier = Modifier.size(56.dp).background(
                    if (tx.isSend) VelaColor.accentSoft else VelaColor.greenSoft, CircleShape
                ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (tx.isSend) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                    null, Modifier.size(24.dp),
                    tint = if (tx.isSend) VelaColor.accent else VelaColor.green,
                )
            }

            Spacer(Modifier.height(12.dp))

            // Value
            if (tx.displayValue.isNotEmpty()) {
                Text(
                    "${if (tx.isSend) "-" else "+"}${tx.displayValue} ${tx.symbol}",
                    fontSize = 28.sp, fontWeight = FontWeight.Bold, color = VelaColor.textPrimary,
                )
            }

            Text(
                when (tx.category) { "send" -> "Sent"; "receive" -> "Received"; "approve" -> "Approved"; else -> "Contract Call" },
                fontSize = 14.sp, color = VelaColor.textSecondary,
            )

            Spacer(Modifier.height(24.dp))

            // Detail rows
            Column(
                modifier = Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(VelaRadius.card))
                    .background(VelaColor.bgCard)
                    .padding(vertical = 4.dp),
            ) {
                DetailRow(stringResource(R.string.tx_detail_status), if (tx.status == "confirmed") "✅ Confirmed" else "❌ Failed")
                HorizontalDivider(color = VelaColor.border)
                DetailRow(stringResource(R.string.tx_detail_network), tx.chainName)
                HorizontalDivider(color = VelaColor.border)
                DetailRow(stringResource(R.string.tx_detail_from), shortAddr(tx.from),
                    onCopy = { clipboard.setText(AnnotatedString(tx.from)) })
                HorizontalDivider(color = VelaColor.border)
                DetailRow(stringResource(R.string.tx_detail_to), shortAddr(tx.to),
                    onCopy = { clipboard.setText(AnnotatedString(tx.to)) })
                HorizontalDivider(color = VelaColor.border)
                DetailRow(stringResource(R.string.tx_detail_hash), shortAddr(tx.hash),
                    onCopy = { clipboard.setText(AnnotatedString(tx.hash)) })
                if (tx.tokenAddress != null) {
                    HorizontalDivider(color = VelaColor.border)
                    DetailRow(stringResource(R.string.token_contract), shortAddr(tx.tokenAddress),
                        onCopy = { clipboard.setText(AnnotatedString(tx.tokenAddress)) })
                }
                if (tx.tokenId != null) {
                    HorizontalDivider(color = VelaColor.border)
                    DetailRow("Token ID", tx.tokenId)
                }
                HorizontalDivider(color = VelaColor.border)
                DetailRow(stringResource(R.string.tx_detail_time), tx.timeAgo)
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String, onCopy: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (onCopy != null) Modifier.clickable { onCopy() } else Modifier)
            .padding(horizontal = 18.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 13.sp, color = VelaColor.textTertiary)
        Spacer(Modifier.weight(1f))
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary)
        if (onCopy != null) {
            Spacer(Modifier.width(4.dp))
            Icon(Icons.Default.ContentCopy, null, Modifier.size(10.dp), tint = VelaColor.textTertiary)
        }
    }
}
