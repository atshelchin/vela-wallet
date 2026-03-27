package app.getvela.wallet.ui.wallet

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.Network
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.NetworkDot
import app.getvela.wallet.ui.components.TokenIcon
import app.getvela.wallet.ui.theme.*
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.delay

@Composable
fun ReceiveScreen(
    wallet: WalletState,
    onBack: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    val qrBitmap = remember(wallet.address) { generateQR(wallet.address) }

    LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = stringResource(R.string.receive_title), onBack = onBack)

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .padding(top = 8.dp, bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // QR Code
            Box(
                modifier = Modifier
                    .size(240.dp)
                    .shadow(4.dp, RoundedCornerShape(24.dp))
                    .clip(RoundedCornerShape(24.dp))
                    .background(VelaColor.bgCard)
                    .border(1.dp, VelaColor.border, RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center,
            ) {
                qrBitmap?.let { bmp ->
                    Image(
                        bitmap = bmp.asImageBitmap(),
                        contentDescription = "QR Code",
                        modifier = Modifier
                            .size(200.dp)
                            .padding(20.dp),
                        contentScale = ContentScale.Fit,
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // Address + copy
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(VelaRadius.card))
                    .background(VelaColor.bgWarm)
                    .clickable {
                        clipboard.setText(AnnotatedString(wallet.address))
                        copied = true
                    }
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = wallet.address,
                    style = VelaTypography.mono(12f),
                    color = VelaColor.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(10.dp))
                Icon(
                    imageVector = if (copied) Icons.Default.Done else Icons.Default.ContentCopy,
                    contentDescription = "Copy",
                    modifier = Modifier.size(13.dp),
                    tint = if (copied) VelaColor.green else VelaColor.textTertiary,
                )
            }

            Spacer(Modifier.height(20.dp))

            // Supported networks
            Text(
                text = stringResource(R.string.receive_supported_networks),
                style = VelaTypography.caption().copy(letterSpacing = 1.5.sp),
                color = VelaColor.textTertiary,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Network.defaults.forEach { network ->
                    TokenIcon(
                        label = network.iconLabel,
                        color = network.iconColor,
                        bg = network.iconBg,
                        size = 30.dp,
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // Listening indicator
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                NetworkDot(color = VelaColor.green, size = 7.dp)
                Text(
                    text = stringResource(R.string.receive_listening),
                    fontSize = 13.sp,
                    color = VelaColor.textTertiary,
                )
            }

            Spacer(Modifier.height(16.dp))

            // Warning
            Text(
                text = stringResource(R.string.receive_warning),
                fontSize = 12.sp,
                color = VelaColor.textTertiary,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp,
                modifier = Modifier.padding(horizontal = 8.dp),
            )

            Spacer(Modifier.height(16.dp))

            // Share button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(VelaRadius.cardSmall))
                    .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.cardSmall))
                    .background(VelaColor.bgCard)
                    .clickable { /* TODO: share intent */ }
                    .padding(vertical = 13.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.Share, null, Modifier.size(14.dp), tint = VelaColor.textPrimary)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.receive_share), style = VelaTypography.label(14f), color = VelaColor.textPrimary)
            }
        }
    }
}

private fun generateQR(content: String): Bitmap? {
    return try {
        val size = 512
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) AndroidColor.BLACK else AndroidColor.WHITE)
            }
        }
        bitmap
    } catch (_: Exception) {
        null
    }
}
