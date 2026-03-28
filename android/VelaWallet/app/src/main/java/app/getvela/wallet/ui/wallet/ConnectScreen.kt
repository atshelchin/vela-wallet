package app.getvela.wallet.ui.wallet

import android.Manifest
import android.app.Activity
import android.util.Log
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.getvela.wallet.R
import app.getvela.wallet.model.Network
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

@Composable
fun ConnectScreen(
    wallet: WalletState,
    onAccountSwitcher: () -> Unit = {},
) {
    val context = LocalContext.current
    val ble = remember { BLEPeripheralService.shared }
    var pendingRequest by remember { mutableStateOf<BLEIncomingRequest?>(null) }
    var isSigning by remember { mutableStateOf(false) }
    var signError by remember { mutableStateOf<String?>(null) }
    var blePermissionDenied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // BLE permission launcher
    val blePermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) {
            startBle(context, wallet, ble)
        } else {
            blePermissionDenied = true
        }
    }

    fun startBleWithPermissionCheck() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val needed = arrayOf(
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
            ).filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
            if (needed.isNotEmpty()) { blePermissionLauncher.launch(needed.toTypedArray()); return }
        }
        startBle(context, wallet, ble)
    }

    // BLE callbacks
    LaunchedEffect(Unit) {
        ble.onRequest = { request -> pendingRequest = request }
        ble.onSwitchAccount = { address ->
            val idx = wallet.accounts.indexOfFirst { it.address.equals(address, ignoreCase = true) }
            if (idx >= 0) { wallet.activeAccountIndex = idx; wallet.address = wallet.accounts[idx].address }
        }
    }

    // Update BLE wallet info when account changes
    LaunchedEffect(wallet.address) {
        if (ble.isAdvertising || ble.isConnected) {
            ble.updateWalletInfo(wallet.address, wallet.activeAccount?.name ?: "Wallet", ble.currentChainId)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding(),
    ) {
        // Header with account switcher (matches iOS)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = VelaSpacing.screenH, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.connect_header), style = VelaTypography.title(17f), color = VelaColor.textPrimary)
            Spacer(Modifier.weight(1f))
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(VelaColor.bgWarm)
                    .clickable(onClick = onAccountSwitcher)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(wallet.activeAccount?.name ?: "Wallet", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary, maxLines = 1)
                Icon(Icons.Default.KeyboardArrowDown, null, Modifier.size(9.dp), tint = VelaColor.textTertiary)
            }
        }

        // Content
        when {
            pendingRequest != null -> RequestView(
                request = pendingRequest!!,
                wallet = wallet,
                chainId = ble.currentChainId,
                isSigning = isSigning,
                error = signError,
                onApprove = {
                    val req = pendingRequest ?: return@RequestView
                    isSigning = true; signError = null
                    scope.launch(NonCancellable) {
                        try {
                            val result = handleRequest(context as Activity, req, wallet, ble.currentChainId)
                            ble.sendResponse(req.id, result)
                            pendingRequest = null
                        } catch (e: Throwable) {
                            Log.e("VelaConnect", "Signing failed", e)
                            signError = e.message ?: "Unknown error"
                            try { ble.sendResponse(req.id, null, BLEError(4001, e.message ?: "Failed")) }
                            catch (_: Throwable) {}
                        } finally {
                            isSigning = false
                        }
                    }
                },
                onReject = {
                    ble.sendResponse(pendingRequest!!.id, null, BLEError(4001, "User rejected"))
                    pendingRequest = null; signError = null
                },
            )
            ble.isConnected -> ConnectedView(wallet, ble.currentChainId, onAccountSwitcher) { ble.stopAdvertising() }
            ble.isAdvertising -> AdvertisingView(wallet) { ble.stopAdvertising() }
            blePermissionDenied -> PermissionDeniedView()
            else -> IdleView(wallet, ::startBleWithPermissionCheck)
        }
    }
}

private fun startBle(context: android.content.Context, wallet: WalletState, ble: BLEPeripheralService) {
    ble.startAdvertising(context, wallet.address, wallet.activeAccount?.name ?: "Wallet", 1,
        wallet.accounts.map { Pair(it.name, it.address) })
}

// MARK: - Idle State (matches iOS idleState with steps)

@Composable
private fun ColumnScope.IdleView(wallet: WalletState, onStart: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))

        // Bluetooth icon (compact)
        Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 36.dp)) {
            Box(Modifier.size(80.dp).background(VelaColor.blueSoft, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Bluetooth, null, Modifier.size(32.dp), tint = VelaColor.blue)
            }
        }

        Spacer(Modifier.height(20.dp))

        Text(stringResource(R.string.connect_heading), style = VelaTypography.heading(22f), color = VelaColor.textPrimary,
            modifier = Modifier.padding(horizontal = 36.dp))
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.connect_idle_desc), style = VelaTypography.body(14f), color = VelaColor.textSecondary,
            textAlign = TextAlign.Center, lineHeight = 20.sp, modifier = Modifier.padding(horizontal = 36.dp))

        Spacer(Modifier.height(20.dp))

        // Steps
        Column(modifier = Modifier.padding(horizontal = 28.dp)) {
            listOf(
                stringResource(R.string.connect_step1),
                stringResource(R.string.connect_step2),
                stringResource(R.string.connect_step3),
            ).forEachIndexed { index, text ->
                StepRow(number = index + 1, text = text)
                if (index < 2) Spacer(Modifier.height(10.dp))
            }
        }

        Spacer(Modifier.height(24.dp))
    }

    // Blue button at bottom — outside scrollable area so always visible
    Button(
        onClick = onStart,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp).padding(bottom = 24.dp).height(51.dp),
        shape = VelaButtonShape,
        colors = ButtonDefaults.buttonColors(containerColor = VelaColor.blue),
    ) {
        Icon(Icons.Default.Bluetooth, null, Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.connect_pair_button), style = VelaTypography.label(16f))
    }
}

@Composable
private fun StepRow(number: Int, text: String) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(VelaRadius.card))
            .background(VelaColor.bgCard)
            .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(24.dp).background(VelaColor.bgWarm, CircleShape), contentAlignment = Alignment.Center) {
            Text("$number", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = VelaColor.textSecondary)
        }
        Text(text, style = VelaTypography.body(14f), color = VelaColor.textPrimary, lineHeight = 20.sp)
    }
}

// MARK: - Advertising State

@Composable
private fun ColumnScope.AdvertisingView(wallet: WalletState, onStop: () -> Unit) {
    val pulse = rememberInfiniteTransition(label = "pulse")
    val alpha by pulse.animateFloat(0.3f, 1f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "a")

    Column(
        modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))

        Box(contentAlignment = Alignment.Center) {
            Box(Modifier.size(120.dp).border(1.5.dp, VelaColor.blue.copy(alpha = 0.1f), CircleShape))
            Box(Modifier.size(88.dp).background(VelaColor.blueSoft, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Bluetooth, null, Modifier.size(28.dp), tint = VelaColor.blue.copy(alpha = alpha))
            }
        }

        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.connect_waiting), style = VelaTypography.heading(20f), color = VelaColor.textPrimary)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.connect_waiting_desc), style = VelaTypography.body(13f), color = VelaColor.textSecondary, textAlign = TextAlign.Center, lineHeight = 18.sp)

        Spacer(Modifier.height(16.dp))

        // Current wallet card
        Row(
            modifier = Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.cardSmall))
                .background(VelaColor.bgWarm)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(32.dp).background(VelaColor.accentSoft, CircleShape), contentAlignment = Alignment.Center) {
                Text((wallet.activeAccount?.name?.take(1) ?: "V").uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = VelaColor.accent)
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(wallet.activeAccount?.name ?: "Wallet", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Text(wallet.shortAddress, style = VelaTypography.mono(11f), color = VelaColor.textTertiary)
            }
        }

        Spacer(Modifier.weight(1f))
    }

    // Stop button (accent outline, matches iOS DisconnectButtonStyle)
    OutlinedButton(
        onClick = onStop,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 24.dp).height(51.dp),
        shape = VelaButtonShape,
        border = androidx.compose.foundation.BorderStroke(1.5.dp, VelaColor.accent),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = VelaColor.accent),
    ) {
        Icon(Icons.Default.StopCircle, null, Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.connect_stop), style = VelaTypography.label(16f))
    }
}

// MARK: - Connected State

@Composable
private fun ColumnScope.ConnectedView(wallet: WalletState, chainId: Int, onAccountSwitcher: () -> Unit, onDisconnect: () -> Unit) {
    Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
        // Device card (blue border, matches iOS)
        Row(
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH).padding(top = 16.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.5.dp, Color(0xFFD4DDFF), RoundedCornerShape(VelaRadius.card))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).background(VelaColor.blueSoft, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.DesktopWindows, null, Modifier.size(20.dp), tint = VelaColor.blue)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text("Chrome — Vela Connect", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.size(6.dp).background(VelaColor.green, CircleShape))
                    Text(stringResource(R.string.connect_status_connected), fontSize = 12.sp, fontWeight = FontWeight.Medium, color = VelaColor.green)
                }
            }
        }

        // Current wallet with Change button
        Row(
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH, vertical = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.cardSmall))
                .background(VelaColor.bgWarm)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(36.dp).background(VelaColor.accentSoft, CircleShape), contentAlignment = Alignment.Center) {
                Text((wallet.activeAccount?.name?.take(1) ?: "V").uppercase(), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = VelaColor.accent)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(wallet.activeAccount?.name ?: "Wallet", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Text(wallet.shortAddress, style = VelaTypography.mono(12f), color = VelaColor.textTertiary)
            }
            Text(stringResource(R.string.send_change), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.accent,
                modifier = Modifier.clickable(onClick = onAccountSwitcher))
        }

        Spacer(Modifier.weight(1f))

        // Connected checkmark
        Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(64.dp).background(VelaColor.greenSoft, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Check, null, Modifier.size(26.dp), tint = VelaColor.green)
            }
            Spacer(Modifier.height(20.dp))
            Text(stringResource(R.string.connect_connected_title), style = VelaTypography.heading(22f), color = VelaColor.textPrimary)
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.connect_connected_desc), style = VelaTypography.body(14f), color = VelaColor.textSecondary, textAlign = TextAlign.Center, lineHeight = 20.sp,
                modifier = Modifier.padding(horizontal = 36.dp))
        }

        Spacer(Modifier.weight(1f))
    }

    // Disconnect button
    OutlinedButton(
        onClick = onDisconnect,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 24.dp).height(51.dp),
        shape = VelaButtonShape,
        border = androidx.compose.foundation.BorderStroke(1.5.dp, VelaColor.accent),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = VelaColor.accent),
    ) { Text(stringResource(R.string.connect_disconnect), style = VelaTypography.label(16f)) }
}

// MARK: - Permission Denied

@Composable
private fun ColumnScope.PermissionDeniedView() {
    Column(modifier = Modifier.weight(1f).padding(horizontal = 36.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(80.dp).background(VelaColor.accentSoft, CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.BluetoothDisabled, null, Modifier.size(36.dp), tint = VelaColor.accent)
        }
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.connect_permission_denied), style = VelaTypography.heading(18f), color = VelaColor.textPrimary, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.connect_permission_desc), style = VelaTypography.body(14f), color = VelaColor.textSecondary, textAlign = TextAlign.Center)
    }
}

// MARK: - Request View (matches iOS requestView with tx details)

@Composable
private fun ColumnScope.RequestView(
    request: BLEIncomingRequest, wallet: WalletState, chainId: Int,
    isSigning: Boolean, error: String?, onApprove: () -> Unit, onReject: () -> Unit,
) {
    Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
        // Origin + favicon
        Row(
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH).padding(top = 16.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(request.origin, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        }

        // Request card
        Column(
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH)
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
        ) {
            // Method + chain badge
            Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(methodDisplayName(request.method).uppercase(), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp, color = VelaColor.textTertiary)
                Spacer(Modifier.weight(1f))
                Text(Network.chainName(chainId), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.blue,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(VelaColor.blueSoft).padding(horizontal = 8.dp, vertical = 3.dp))
            }

            // Transaction details for eth_sendTransaction
            if (request.method == "eth_sendTransaction") {
                val rawTx = request.params.firstOrNull()
                @Suppress("UNCHECKED_CAST")
                val txDict: Map<String, Any>? = when (rawTx) {
                    is JSONObject -> rawTx.keys().asSequence().associateWith { rawTx.get(it) }
                    is Map<*, *> -> rawTx as? Map<String, Any>
                    else -> null
                }
                if (txDict != null) {
                    val toAddr = txDict["to"] as? String ?: "Unknown"
                    val valueHex = txDict["value"] as? String ?: "0x0"
                    val hasData = (txDict["data"] as? String ?: "0x") != "0x"
                    val valueWei = valueHex.removePrefix("0x").toLongOrNull(16) ?: 0
                    val valueEth = valueWei.toDouble() / 1e18

                    if (valueEth > 0) {
                        Text("${String.format("%.6f", valueEth)} ${Network.nativeSymbol(chainId)}",
                            fontSize = 24.sp, fontWeight = FontWeight.Bold, color = VelaColor.textPrimary,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                    }
                    if (hasData) {
                        Text("Contract Interaction", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = VelaColor.textSecondary,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                    }

                    HorizontalDivider(color = VelaColor.border)
                    TxDetailRow("To", shortAddr(toAddr))
                    TxDetailRow("From", shortAddr(wallet.address))
                    TxDetailRow("Network", Network.chainName(chainId))
                }
            } else {
                Text(methodDisplayName(request.method), style = VelaTypography.heading(20f), color = VelaColor.textPrimary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp))
            }
        }

        error?.let {
            Text(it, fontSize = 13.sp, color = VelaColor.accent, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = VelaSpacing.screenH, vertical = 12.dp))
        }
    }

    // Approve / Reject buttons
    Column(modifier = Modifier.padding(horizontal = VelaSpacing.screenH, vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
            onClick = onApprove, enabled = !isSigning,
            modifier = Modifier.fillMaxWidth().height(51.dp),
            shape = VelaButtonShape,
            colors = ButtonDefaults.buttonColors(containerColor = VelaColor.accent),
        ) {
            if (isSigning) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text("Signing...", style = VelaTypography.label(16f))
            } else {
                Text(stringResource(R.string.connect_approve_button), style = VelaTypography.label(16f))
            }
        }
        TextButton(onClick = onReject, modifier = Modifier.fillMaxWidth()) {
            Text("Reject", style = VelaTypography.label(14f), color = VelaColor.textSecondary)
        }
    }
}

@Composable
private fun TxDetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(label, fontSize = 12.sp, color = VelaColor.textTertiary)
        Spacer(Modifier.weight(1f))
        Text(value, style = VelaTypography.mono(12f), color = VelaColor.textPrimary)
    }
    HorizontalDivider(color = VelaColor.border)
}

// MARK: - Request Handling (matches iOS approveRequest with all methods)

private suspend fun handleRequest(activity: Activity, request: BLEIncomingRequest, wallet: WalletState, chainId: Int): Any? {
    return when (request.method) {
        "eth_requestAccounts", "eth_accounts" -> listOf(wallet.address)
        "eth_chainId" -> "0x${chainId.toString(16)}"

        "eth_sendTransaction" -> {
            val rawParam = request.params.firstOrNull() ?: throw Exception("Invalid params")
            // BLE parseJsonArray returns JSONObject, not Map — convert it
            @Suppress("UNCHECKED_CAST")
            val params: Map<String, Any> = when (rawParam) {
                is JSONObject -> rawParam.keys().asSequence().associateWith { rawParam.get(it) }
                is Map<*, *> -> rawParam as Map<String, Any>
                else -> throw Exception("Invalid params")
            }
            val to = params["to"] as? String ?: throw Exception("Missing 'to'")
            val valueHex = params["value"] as? String ?: "0x0"
            val dataHex = params["data"] as? String ?: "0x"
            val valueClean = valueHex.removePrefix("0x").ifEmpty { "0" }

            val credentialId = wallet.activeAccount?.id
                ?: throw Exception("No active account. Please create or import a wallet first.")
            var publicKeyHex = LocalStorage.shared.findAccount(credentialId)?.publicKeyHex ?: ""

            // Server fallback if public key not found locally
            if (publicKeyHex.isEmpty()) {
                try {
                    val record = withContext(Dispatchers.IO) {
                        PublicKeyIndexService().query(PasskeyService.RELYING_PARTY, credentialId)
                    }
                    publicKeyHex = record.publicKey
                    LocalStorage.shared.saveAccount(LocalStorage.StoredAccount(
                        id = credentialId, name = wallet.activeAccount?.name ?: "Wallet",
                        publicKeyHex = publicKeyHex, address = wallet.address,
                    ))
                } catch (_: Exception) {}
            }
            if (publicKeyHex.isEmpty()) throw Exception("Public key not found")

            val txService = SafeTransactionService()
            val dataBytes = if (dataHex.length > 2) EthCrypto.hexToBytes(dataHex.removePrefix("0x")) else ByteArray(0)

            val result = if (dataBytes.isEmpty() && dataHex == "0x") {
                txService.sendNative(activity, wallet.address, to, valueClean, chainId, publicKeyHex)
            } else {
                txService.sendContractCall(activity, wallet.address, to, valueClean, dataBytes, chainId, publicKeyHex)
            }
            result.txHash
        }

        "personal_sign" -> {
            val message = request.params.firstOrNull() as? String ?: throw Exception("No message")
            val messageBytes = if (message.startsWith("0x") && message.length > 2 && message.drop(2).all { it in "0123456789abcdefABCDEF" }) {
                EthCrypto.hexToBytes(message.removePrefix("0x"))
            } else {
                message.toByteArray()
            }
            val prefix = "\u0019Ethereum Signed Message:\n${messageBytes.size}".toByteArray()
            val hash = EthCrypto.keccak256(prefix + messageBytes)

            val passkeyService = PasskeyService()
            val assertion = passkeyService.sign(activity, hash)
            val rawSig = assertion.signature?.let { passkeyService.derSignatureToRaw(it) }
                ?: throw Exception("Signing was cancelled or failed. Please try again.")
            "0x${EthCrypto.bytesToHex(rawSig)}00"
        }

        else -> {
            // Generic sign: hash params with keccak256
            val paramsJson = request.params.toString().toByteArray()
            val hash = EthCrypto.keccak256(paramsJson)
            val assertion = PasskeyService().sign(activity, hash)
            val sig = assertion.signature ?: throw Exception("No signature")
            "0x${EthCrypto.bytesToHex(sig)}"
        }
    }
}

private fun methodDisplayName(method: String): String = when (method) {
    "eth_sendTransaction" -> "Transaction"
    "personal_sign" -> "Sign Message"
    "eth_signTypedData_v4" -> "Sign Typed Data"
    "eth_requestAccounts" -> "Connect"
    else -> method
}
