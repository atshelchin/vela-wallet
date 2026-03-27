package app.getvela.wallet.ui.wallet

import android.app.Activity
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.VelaAccentButton
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Full-screen overlay shown on app start if there are pending public key uploads.
 * Matches iOS PendingUploadOverlay in ContentView.swift.
 */
@Composable
fun PendingUploadOverlay(onDismiss: () -> Unit) {
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()
    var pendings by remember { mutableStateOf(LocalStorage.shared.loadPendingUploads()) }
    var isRetrying by remember { mutableStateOf(false) }
    var currentIndex by remember { mutableIntStateOf(0) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var statusIsError by remember { mutableStateOf(false) }
    val passkeyService = remember { PasskeyService() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(VelaColor.bg)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Header icon
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(VelaColor.accentSoft, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.CloudUpload, null, Modifier.size(26.dp), tint = VelaColor.accent)
            }

            Spacer(Modifier.height(16.dp))

            Text("Public Key Upload Required", style = VelaTypography.heading(20f), color = VelaColor.textPrimary)
            Spacer(Modifier.height(8.dp))
            Text(
                "Your passkey was created but the public key hasn't been uploaded yet. This is required to deploy your wallet on-chain.",
                style = VelaTypography.body(13f),
                color = VelaColor.textSecondary,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp,
            )

            Spacer(Modifier.height(20.dp))

            // Pending accounts list
            pendings.forEachIndexed { index, pending ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(VelaRadius.cardSmall))
                        .background(if (isRetrying && currentIndex == index) VelaColor.accentSoft else VelaColor.bgCard)
                        .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.cardSmall))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(36.dp).background(VelaColor.accentSoft, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            pending.name.take(1).uppercase(),
                            fontSize = 14.sp, fontWeight = FontWeight.Bold, color = VelaColor.accent,
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(pending.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                        Text(
                            "${pending.id.take(10)}...${pending.id.takeLast(6)}",
                            style = VelaTypography.mono(11f),
                            color = VelaColor.textTertiary,
                        )
                    }
                    if (isRetrying && currentIndex == index) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = VelaColor.accent, strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.Upload, null, Modifier.size(18.dp), tint = VelaColor.accent)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            // Status message
            statusMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    it,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (statusIsError) VelaColor.accent else VelaColor.green,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(16.dp))

            // Retry button
            VelaAccentButton(
                text = "Retry Upload",
                onClick = {
                    isRetrying = true
                    statusMessage = null
                    scope.launch {
                        val failedNames = mutableListOf<String>()
                        for (i in pendings.indices) {
                            currentIndex = i
                            val pending = pendings[i]
                            try {
                                val indexService = PublicKeyIndexService()
                                val challenge = withContext(Dispatchers.IO) { indexService.getChallenge() }
                                val assertion = passkeyService.sign(activity, challenge.toByteArray())
                                val rawSig = assertion.signature?.let { passkeyService.derSignatureToRaw(it) }

                                if (rawSig != null) {
                                    val req = PublicKeyIndexService.CreateRequest(
                                        rpId = PasskeyService.RELYING_PARTY,
                                        credentialId = pending.id,
                                        publicKey = pending.publicKeyHex,
                                        challenge = challenge,
                                        signature = EthCrypto.bytesToHex(rawSig),
                                        authenticatorData = android.util.Base64.encodeToString(
                                            assertion.authenticatorData ?: ByteArray(0),
                                            android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP,
                                        ),
                                        clientDataJSON = android.util.Base64.encodeToString(
                                            assertion.clientDataJSON ?: ByteArray(0),
                                            android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP,
                                        ),
                                        name = pending.name,
                                    )
                                    withContext(Dispatchers.IO) { indexService.create(req) }
                                    LocalStorage.shared.removePendingUpload(pending.id)
                                } else {
                                    failedNames.add(pending.name)
                                }
                            } catch (e: Exception) {
                                failedNames.add(pending.name)
                                Log.w("PendingUpload", "${pending.name} failed: ${e.message}")
                            }
                        }

                        isRetrying = false
                        pendings = LocalStorage.shared.loadPendingUploads()

                        if (failedNames.isEmpty()) {
                            statusMessage = "All public keys uploaded successfully"
                            statusIsError = false
                            kotlinx.coroutines.delay(1200)
                            onDismiss()
                        } else {
                            statusMessage = "Upload failed for: ${failedNames.joinToString(", ")}"
                            statusIsError = true
                        }
                    }
                },
                isLoading = isRetrying,
                enabled = !isRetrying,
            )

            Spacer(Modifier.height(10.dp))

            // Skip button
            TextButton(onClick = onDismiss, enabled = !isRetrying) {
                Text("Skip for Now", style = VelaTypography.label(14f), color = VelaColor.textSecondary)
            }
        }
    }
}
