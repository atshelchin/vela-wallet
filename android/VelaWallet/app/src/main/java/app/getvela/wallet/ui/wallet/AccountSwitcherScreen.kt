package app.getvela.wallet.ui.wallet

import android.app.Activity
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.Account
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import app.getvela.wallet.ui.components.VelaSecondaryButton
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AccountSwitcherScreen(
    wallet: WalletState,
    onBack: () -> Unit,
) {
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()
    var isCreating by remember { mutableStateOf(false) }
    var showNameInput by remember { mutableStateOf(false) }
    var newAccountName by remember { mutableStateOf("") }
    val passkeyService = remember { PasskeyService() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = stringResource(R.string.accounts_title), onBack = onBack)

        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp)) {
            // Existing accounts
            wallet.accounts.forEachIndexed { index, account ->
                val isActive = index == wallet.activeAccountIndex
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(VelaRadius.card))
                        .background(VelaColor.bgCard)
                        .border(
                            if (isActive) 1.5.dp else 1.dp,
                            if (isActive) VelaColor.accent else VelaColor.border,
                            RoundedCornerShape(VelaRadius.card),
                        )
                        .clickable {
                            wallet.activeAccountIndex = index
                            wallet.address = account.address
                            onBack()
                        }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(40.dp).background(VelaColor.accentSoft, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            account.name.take(1).uppercase(),
                            fontSize = 16.sp, fontWeight = FontWeight.Bold, color = VelaColor.accent,
                        )
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(account.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                        Text(account.shortAddress, style = VelaTypography.mono(12f), color = VelaColor.textTertiary)
                    }
                    if (isActive) {
                        Icon(Icons.Default.CheckCircle, null, Modifier.size(20.dp), tint = VelaColor.accent)
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            // Name input for new account
            if (showNameInput) {
                OutlinedTextField(
                    value = newAccountName,
                    onValueChange = { newAccountName = it },
                    placeholder = { Text(stringResource(R.string.create_name_placeholder), color = VelaColor.textTertiary) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = VelaCardShape,
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = VelaColor.accent,
                        unfocusedBorderColor = VelaColor.border,
                        focusedContainerColor = VelaColor.bgCard,
                        unfocusedContainerColor = VelaColor.bgCard,
                    ),
                )

                Spacer(Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    VelaSecondaryButton(
                        text = stringResource(R.string.accounts_cancel),
                        onClick = { showNameInput = false; newAccountName = "" },
                        modifier = Modifier.weight(1f),
                    )
                    VelaPrimaryButton(
                        text = stringResource(R.string.create_button),
                        onClick = {
                            isCreating = true
                            val name = newAccountName.trim()
                            scope.launch {
                                try {
                                    val result = passkeyService.register(activity, name)
                                    val credentialId = EthCrypto.bytesToHex(result.credentialId)
                                    val keyPair = result.attestationObject?.let { passkeyService.extractPublicKeyFromAttestation(it) }
                                    val publicKeyHex = if (keyPair != null) "04${EthCrypto.bytesToHex(keyPair.first)}${EthCrypto.bytesToHex(keyPair.second)}" else ""
                                    val address = if (publicKeyHex.isNotEmpty()) SafeAddressComputer.computeAddress(publicKeyHex) else "0x${credentialId.take(40)}"

                                    LocalStorage.shared.saveAccount(LocalStorage.StoredAccount(id = credentialId, name = name, publicKeyHex = publicKeyHex, address = address))
                                    val account = Account(id = credentialId, name = name, address = address)
                                    wallet.accounts = wallet.accounts + account
                                    wallet.activeAccountIndex = wallet.accounts.size - 1
                                    wallet.address = address
                                    isCreating = false
                                    onBack()
                                } catch (e: Exception) {
                                    isCreating = false
                                    Log.e("AccountSwitcher", "Create failed: ${e.message}")
                                }
                            }
                        },
                        isLoading = isCreating,
                        enabled = newAccountName.isNotBlank(),
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(Modifier.height(16.dp))
            }

            // Action buttons
            if (!showNameInput) {
                VelaPrimaryButton(
                    text = stringResource(R.string.accounts_create_new),
                    onClick = { showNameInput = true },
                )

                Spacer(Modifier.height(10.dp))

                VelaSecondaryButton(
                    text = stringResource(R.string.accounts_login),
                    onClick = {
                        isCreating = true
                        scope.launch {
                            try {
                                val result = passkeyService.authenticate(activity)
                                val credentialId = EthCrypto.bytesToHex(result.credentialId)

                                val existingIdx = wallet.accounts.indexOfFirst { it.id == credentialId }
                                if (existingIdx >= 0) {
                                    wallet.activeAccountIndex = existingIdx
                                    wallet.address = wallet.accounts[existingIdx].address
                                } else {
                                    val nameFromPasskey = result.userID?.let { PasskeyService.decodeUserName(it) }
                                    val stored = LocalStorage.shared.findAccount(credentialId)
                                    val name = nameFromPasskey ?: stored?.name ?: "Wallet"
                                    var address = stored?.address ?: ""

                                    if (address.isEmpty()) {
                                        try {
                                            val record = withContext(Dispatchers.IO) {
                                                PublicKeyIndexService().query(PasskeyService.RELYING_PARTY, credentialId)
                                            }
                                            address = SafeAddressComputer.computeAddress(record.publicKey)
                                            LocalStorage.shared.saveAccount(LocalStorage.StoredAccount(id = credentialId, name = name, publicKeyHex = record.publicKey, address = address))
                                        } catch (_: Exception) {}
                                    }

                                    if (address.isNotEmpty()) {
                                        wallet.accounts = wallet.accounts + Account(id = credentialId, name = name, address = address)
                                        wallet.activeAccountIndex = wallet.accounts.size - 1
                                        wallet.address = address
                                    }
                                }
                                isCreating = false
                                onBack()
                            } catch (e: Exception) {
                                isCreating = false
                                Log.e("AccountSwitcher", "Login failed: ${e.message}")
                            }
                        }
                    },
                    enabled = !isCreating,
                )
            }
        }
    }
}
