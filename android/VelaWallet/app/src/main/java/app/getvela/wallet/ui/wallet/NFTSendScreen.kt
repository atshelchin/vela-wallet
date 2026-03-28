package app.getvela.wallet.ui.wallet

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import app.getvela.wallet.ui.theme.*
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Send an NFT to another address via safeTransferFrom(from, to, tokenId).
 */
@Composable
fun NFTSendScreen(
    nft: ApiNft,
    wallet: WalletState,
    onBack: () -> Unit,
) {
    var toAddress by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var txHash by remember { mutableStateOf<String?>(null) }
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()

    BackHandler { if (txHash == null) onBack() }

    if (txHash != null) {
        // Success
        Column(
            modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Default.CheckCircle, null, Modifier.size(64.dp), tint = VelaColor.green)
            Spacer(Modifier.height(20.dp))
            Text(stringResource(R.string.nft_sent), style = VelaTypography.heading(24f), color = VelaColor.textPrimary)
            Spacer(Modifier.height(8.dp))
            Text(nft.displayName, style = VelaTypography.label(16f), color = VelaColor.textSecondary)
            Spacer(Modifier.height(4.dp))
            Text(shortAddr(txHash!!), style = VelaTypography.mono(12f), color = VelaColor.textTertiary)
            Spacer(Modifier.height(40.dp))
            VelaPrimaryButton(text = stringResource(R.string.confirm_done), onClick = onBack, modifier = Modifier.padding(horizontal = 28.dp))
        }
        return
    }

    Column(
        modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.nft_send), onBack = onBack)

        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = VelaSpacing.screenH),
        ) {
            Spacer(Modifier.height(8.dp))

            // NFT preview card
            Row(
                modifier = Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(VelaRadius.card))
                    .background(VelaColor.bgCard)
                    .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (nft.imageUrl != null) {
                    SubcomposeAsyncImage(
                        model = nft.imageUrl,
                        contentDescription = nft.displayName,
                        modifier = Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Crop,
                        error = { Box(Modifier.size(56.dp).background(VelaColor.bgWarm, RoundedCornerShape(8.dp))) },
                    )
                } else {
                    Box(Modifier.size(56.dp).background(VelaColor.bgWarm, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                        Text("🖼", fontSize = 20.sp)
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(nft.displayName, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                    Text(nft.collectionName ?: nft.chainName, fontSize = 12.sp, color = VelaColor.textTertiary)
                    Text("Token ID: ${nft.tokenId}", style = VelaTypography.mono(11f), color = VelaColor.textTertiary)
                }
            }

            Spacer(Modifier.height(24.dp))

            // To address
            Text(stringResource(R.string.send_to), style = VelaTypography.caption().copy(letterSpacing = 1.sp), color = VelaColor.textTertiary,
                modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
            OutlinedTextField(
                value = toAddress,
                onValueChange = { toAddress = it },
                placeholder = { Text(stringResource(R.string.send_to_placeholder), color = VelaColor.textTertiary) },
                modifier = Modifier.fillMaxWidth(),
                shape = VelaCardShape,
                textStyle = VelaTypography.mono(14f),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = VelaColor.border,
                    unfocusedBorderColor = VelaColor.border,
                    focusedContainerColor = VelaColor.bgCard,
                    unfocusedContainerColor = VelaColor.bgCard,
                ),
            )

            errorMessage?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, fontSize = 13.sp, color = VelaColor.accent, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }

        // Send button
        VelaPrimaryButton(
            text = stringResource(R.string.nft_send),
            onClick = {
                isSending = true
                errorMessage = null
                scope.launch(NonCancellable) {
                    try {
                        val credentialId = wallet.activeAccount?.id ?: ""
                        val stored = LocalStorage.shared.findAccount(credentialId)
                        val publicKeyHex = stored?.publicKeyHex ?: throw Exception("Public key not found")

                        // Build safeTransferFrom(from, to, tokenId) calldata
                        val selector = EthCrypto.functionSelector("safeTransferFrom(address,address,uint256)")
                        val fromEncoded = EthCrypto.abiEncodeAddress(wallet.address)
                        val toEncoded = EthCrypto.abiEncodeAddress(toAddress.trim())
                        val tokenIdEncoded = EthCrypto.abiEncodeUint256(nft.tokenId.toLongOrNull() ?: 0)
                        val calldata = selector + fromEncoded + toEncoded + tokenIdEncoded

                        val txService = SafeTransactionService()
                        val result = txService.sendContractCall(
                            activity, wallet.address, nft.contractAddress,
                            "0x0", calldata, nft.chainId, publicKeyHex,
                        )
                        txHash = result.txHash
                    } catch (e: Exception) {
                        errorMessage = e.message ?: "Transfer failed"
                    }
                    isSending = false
                }
            },
            isLoading = isSending,
            enabled = toAddress.isNotBlank() && toAddress.length >= 42,
            modifier = Modifier.padding(horizontal = 28.dp, vertical = 24.dp),
        )
    }
}

// Extension to get chainId from ApiNft
private val ApiNft.chainId: Int get() = when (network) {
    "eth-mainnet" -> 1; "arb-mainnet" -> 42161; "base-mainnet" -> 8453
    "opt-mainnet" -> 10; "matic-mainnet" -> 137; "bnb-mainnet" -> 56
    "avax-mainnet" -> 43114; else -> 1
}
