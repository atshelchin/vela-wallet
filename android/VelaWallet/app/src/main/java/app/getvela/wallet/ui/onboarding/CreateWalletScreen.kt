package app.getvela.wallet.ui.onboarding

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.VelaAccentButton
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import app.getvela.wallet.ui.components.VelaSecondaryButton
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun CreateWalletScreen(
    onBack: () -> Unit,
    onCreated: (address: String, name: String) -> Unit,
) {
    var accountName by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var uploadFailed by remember { mutableStateOf(false) }
    var pendingAddress by remember { mutableStateOf<String?>(null) }
    var pendingName by remember { mutableStateOf<String?>(null) }
    val focusRequester = remember { FocusRequester() }
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()
    val passkeyService = remember { PasskeyService() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = "", onBack = onBack)

        Spacer(Modifier.weight(1f))

        // Content
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .background(VelaColor.bgWarm, RoundedCornerShape(28.dp))
                    .border(1.dp, VelaColor.border, RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (uploadFailed) Icons.Default.Refresh else Icons.Default.Key,
                    contentDescription = null,
                    modifier = Modifier.size(36.dp),
                    tint = VelaColor.accent,
                )
            }

            Spacer(Modifier.height(28.dp))

            if (uploadFailed) {
                // Upload failed state
                Text(
                    text = stringResource(R.string.create_upload_failed_title),
                    style = VelaTypography.heading(24f),
                    color = VelaColor.textPrimary,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.create_upload_failed_desc),
                    style = VelaTypography.body(15f),
                    color = VelaColor.textSecondary,
                    textAlign = TextAlign.Center,
                    lineHeight = 22.sp,
                )
            } else {
                // Normal create state
                Text(
                    text = stringResource(R.string.create_title),
                    style = VelaTypography.heading(28f),
                    color = VelaColor.textPrimary,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.create_description),
                    style = VelaTypography.body(15f),
                    color = VelaColor.textSecondary,
                    textAlign = TextAlign.Center,
                    lineHeight = 22.sp,
                )

                Spacer(Modifier.height(28.dp))

                // Name input
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.create_name_label),
                        style = VelaTypography.caption().copy(
                            letterSpacing = 1.sp,
                        ),
                        color = VelaColor.textTertiary,
                        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
                    )

                    OutlinedTextField(
                        value = accountName,
                        onValueChange = { accountName = it },
                        placeholder = {
                            Text(
                                stringResource(R.string.create_name_placeholder),
                                color = VelaColor.textTertiary,
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester),
                        textStyle = VelaTypography.body(16f).copy(fontWeight = FontWeight.Medium),
                        shape = VelaCardShape,
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = VelaColor.border,
                            unfocusedBorderColor = VelaColor.border,
                            focusedContainerColor = VelaColor.bgCard,
                            unfocusedContainerColor = VelaColor.bgCard,
                            cursorColor = VelaColor.textPrimary,
                        ),
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Security note
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(VelaColor.greenSoft, RoundedCornerShape(VelaRadius.cardSmall))
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = VelaColor.green,
                    )
                    Text(
                        text = stringResource(R.string.create_security_note),
                        style = VelaTypography.label(13f),
                        color = VelaColor.green,
                    )
                }
            }

            // Error message
            errorMessage?.let { error ->
                Spacer(Modifier.height(12.dp))
                Text(
                    text = error,
                    style = VelaTypography.body(13f),
                    color = VelaColor.accent,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Spacer(Modifier.weight(1f))

        // Bottom buttons
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (uploadFailed) {
                VelaPrimaryButton(
                    text = stringResource(R.string.create_retry_upload),
                    onClick = {
                        // TODO: retry public key upload to server
                        isLoading = true
                        errorMessage = null
                        scope.launch {
                            // For now, just proceed — upload retry requires server integration
                            isLoading = false
                            val addr = pendingAddress ?: return@launch
                            val name = pendingName ?: return@launch
                            onCreated(addr, name)
                        }
                    },
                    isLoading = isLoading,
                    enabled = !isLoading,
                )
                VelaSecondaryButton(
                    text = stringResource(R.string.create_skip),
                    onClick = {
                        val addr = pendingAddress ?: return@VelaSecondaryButton
                        val name = pendingName ?: return@VelaSecondaryButton
                        onCreated(addr, name)
                    },
                    enabled = !isLoading,
                )
            } else {
                VelaPrimaryButton(
                    text = stringResource(R.string.create_button),
                    onClick = {
                        isLoading = true
                        errorMessage = null
                        val name = accountName.trim()
                        scope.launch {
                            try {
                                val result = passkeyService.register(activity, name)
                                val credentialId = EthCrypto.bytesToHex(result.credentialId)

                                // Extract P256 public key from attestation
                                val attestation = result.attestationObject
                                val keyPair = attestation?.let { passkeyService.extractPublicKeyFromAttestation(it) }
                                val publicKeyHex = if (keyPair != null) {
                                    "04" + EthCrypto.bytesToHex(keyPair.first) + EthCrypto.bytesToHex(keyPair.second)
                                } else ""

                                // Compute Safe address
                                val address = if (publicKeyHex.isNotEmpty()) {
                                    SafeAddressComputer.computeAddress(publicKeyHex)
                                } else {
                                    "0x" + credentialId.take(40)
                                }

                                // Save locally
                                LocalStorage.shared.saveAccount(
                                    LocalStorage.StoredAccount(
                                        id = credentialId,
                                        name = name,
                                        publicKeyHex = publicKeyHex,
                                        address = address,
                                    )
                                )

                                // Save pending upload in case server upload fails
                                LocalStorage.shared.savePendingUpload(
                                    LocalStorage.PendingUpload(
                                        id = credentialId,
                                        name = name,
                                        publicKeyHex = publicKeyHex,
                                        attestationObjectHex = attestation?.let { EthCrypto.bytesToHex(it) } ?: "",
                                    )
                                )

                                pendingAddress = address
                                pendingName = name

                                // Upload public key to server
                                try {
                                    val indexService = PublicKeyIndexService()
                                    val challenge = withContext(Dispatchers.IO) { indexService.getChallenge() }
                                    val assertion = passkeyService.sign(activity, challenge.toByteArray())
                                    val derSig = assertion.signature
                                    val rawSig = derSig?.let { passkeyService.derSignatureToRaw(it) }

                                    if (rawSig != null) {
                                        val createReq = PublicKeyIndexService.CreateRequest(
                                            rpId = PasskeyService.RELYING_PARTY,
                                            credentialId = credentialId,
                                            publicKey = publicKeyHex,
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
                                            name = name,
                                        )
                                        withContext(Dispatchers.IO) { indexService.create(createReq) }
                                        // Upload succeeded — remove pending
                                        LocalStorage.shared.removePendingUpload(credentialId)
                                    }
                                } catch (uploadErr: Exception) {
                                    // Upload failed — pending upload saved for retry
                                    android.util.Log.w("CreateWallet", "Public key upload failed: ${uploadErr.message}")
                                    uploadFailed = true
                                    errorMessage = uploadErr.message
                                    isLoading = false
                                    return@launch
                                }

                                isLoading = false
                                onCreated(address, name)
                            } catch (e: Exception) {
                                isLoading = false
                                if (e.message?.contains("cancel", ignoreCase = true) == true) return@launch
                                errorMessage = e.message ?: "Passkey creation failed"
                            }
                        }
                    },
                    isLoading = isLoading,
                    enabled = accountName.isNotBlank(),
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun CreateWalletScreenPreview() {
    VelaWalletTheme {
        CreateWalletScreen(onBack = {}, onCreated = { _, _ -> })
    }
}
