package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Done
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.ApiNft
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun NFTDetailScreen(
    nft: ApiNft,
    onBack: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    LaunchedEffect(copied) { if (copied) { delay(2000); copied = false } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = nft.displayName, onBack = onBack)

        // NFT image placeholder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(360.dp)
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgWarm),
            contentAlignment = Alignment.Center,
        ) {
            // TODO: AsyncImage with Coil for actual NFT image loading
            Text("🖼", fontSize = 48.sp)
        }

        Spacer(Modifier.height(16.dp))

        // Title
        Text(
            nft.displayName,
            style = VelaTypography.heading(22f),
            color = VelaColor.textPrimary,
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH),
        )

        nft.collectionName?.let {
            Text(
                it,
                style = VelaTypography.body(14f),
                color = VelaColor.textTertiary,
                modifier = Modifier.padding(horizontal = VelaSpacing.screenH, vertical = 4.dp),
            )
        }

        nft.description?.let {
            if (it.isNotBlank()) {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = VelaColor.textSecondary,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(horizontal = VelaSpacing.screenH, vertical = 8.dp),
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        // Details card
        Column(
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
        ) {
            NFTInfoRow(stringResource(R.string.nft_network), nft.chainName)
            HorizontalDivider(color = VelaColor.border)
            NFTInfoRow(stringResource(R.string.nft_type), nft.tokenType)
            HorizontalDivider(color = VelaColor.border)
            NFTInfoRow(
                stringResource(R.string.nft_token_id),
                if (nft.tokenId.length > 12) "${nft.tokenId.take(8)}..." else nft.tokenId,
            )
            HorizontalDivider(color = VelaColor.border)

            // Contract address (copyable)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        clipboard.setText(AnnotatedString(nft.contractAddress))
                        copied = true
                    }
                    .padding(horizontal = 18.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.nft_contract), fontSize = 13.sp, color = VelaColor.textTertiary)
                Spacer(Modifier.weight(1f))
                Text(shortAddr(nft.contractAddress), style = VelaTypography.mono(12f), color = VelaColor.textPrimary)
                Spacer(Modifier.width(4.dp))
                Icon(
                    if (copied) Icons.Default.Done else Icons.Default.ContentCopy,
                    null, Modifier.size(10.dp), tint = VelaColor.textTertiary,
                )
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun NFTInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 13.sp, color = VelaColor.textTertiary)
        Spacer(Modifier.weight(1f))
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary)
    }
}
