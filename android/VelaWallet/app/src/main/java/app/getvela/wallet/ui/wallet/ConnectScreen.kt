package app.getvela.wallet.ui.wallet

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
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
import androidx.core.content.ContextCompat
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
import app.getvela.wallet.R
import app.getvela.wallet.model.Network
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import app.getvela.wallet.ui.components.VelaSecondaryButton
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ConnectScreen(wallet: WalletState) {
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
        val allGranted = permissions.values.all { it }
        if (allGranted) {
            ble.startAdvertising(
                context = context,
                walletAddress = wallet.address,
                accountName = wallet.activeAccount?.name ?: "Wallet",
                chainId = 1,
                allAccounts = wallet.accounts.map { Pair(it.name, it.address) },
            )
        } else {
            blePermissionDenied = true
        }
    }

    fun startBleWithPermissionCheck() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val needed = arrayOf(
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
            ).filter {
                ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
            }
            if (needed.isNotEmpty()) {
                blePermissionLauncher.launch(needed.toTypedArray())
                return
            }
        }
        ble.startAdvertising(
            context = context,
            walletAddress = wallet.address,
            accountName = wallet.activeAccount?.name ?: "Wallet",
            chainId = 1,
            allAccounts = wallet.accounts.map { Pair(it.name, it.address) },
        )
    }

    // Set up BLE callbacks
    LaunchedEffect(Unit) {
        ble.onRequest = { request -> pendingRequest = request }
        ble.onSwitchAccount = { address ->
            val idx = wallet.accounts.indexOfFirst { it.address.equals(address, ignoreCase = true) }
            if (idx >= 0) {
                wallet.activeAccountIndex = idx
                wallet.address = wallet.accounts[idx].address
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.tab_dapps))

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = VelaSpacing.screenH),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))

            if (blePermissionDenied) {
                // Permission denied state
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier.size(80.dp).background(VelaColor.accentSoft, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.BluetoothDisabled, null, Modifier.size(36.dp), tint = VelaColor.accent)
                    }
                    Spacer(Modifier.height(20.dp))
                    Text(stringResource(R.string.connect_permission_denied), style = VelaTypography.heading(18f), color = VelaColor.textPrimary, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.connect_permission_desc), style = VelaTypography.body(14f), color = VelaColor.textSecondary, textAlign = TextAlign.Center)
                }
            } else if (!ble.isAdvertising && !ble.isConnected) {
                // Disconnected state
                DisconnectedView(
                    wallet = wallet,
                    onStart = { startBleWithPermissionCheck() },
                )
            } else if (ble.isAdvertising && !ble.isConnected) {
                // Advertising / waiting state
                AdvertisingView(
                    wallet = wallet,
                    onStop = { ble.stopAdvertising() },
                )
            } else {
                // Connected state
                ConnectedView(
                    wallet = wallet,
                    chainId = ble.currentChainId,
                    onDisconnect = { ble.stopAdvertising() },
                )
            }

            Spacer(Modifier.height(24.dp))
        }
    }

    // Request approval modal
    if (pendingRequest != null) {
        RequestApprovalModal(
            request = pendingRequest!!,
            wallet = wallet,
            chainId = ble.currentChainId,
            isSigning = isSigning,
            error = signError,
            onApprove = {
                val req = pendingRequest ?: return@RequestApprovalModal
                isSigning = true
                signError = null
                scope.launch(kotlinx.coroutines.NonCancellable) {
                    try {
                        val result = handleRequest(context as Activity, req, wallet, ble.currentChainId)
                        ble.sendResponse(req.id, result)
                        pendingRequest = null
                    } catch (e: Exception) {
                        signError = e.message
                        ble.sendResponse(req.id, null, BLEError(4001, e.message ?: "Signing failed"))
                    }
                    isSigning = false
                }
            },
            onReject = {
                val req = pendingRequest ?: return@RequestApprovalModal
                ble.sendResponse(req.id, null, BLEError(4001, "User rejected"))
                pendingRequest = null
                signError = null
            },
        )
    }
}

// MARK: - Disconnected State

@Composable
private fun DisconnectedView(wallet: WalletState, onStart: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(VelaColor.bgWarm, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.BluetoothSearching, null, Modifier.size(36.dp), tint = VelaColor.textTertiary)
        }

        Spacer(Modifier.height(20.dp))

        Text(stringResource(R.string.connect_title), style = VelaTypography.heading(20f), color = VelaColor.textPrimary)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.connect_description),
            style = VelaTypography.body(14f),
            color = VelaColor.textSecondary,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp,
        )

        Spacer(Modifier.height(24.dp))

        // Wallet info
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(36.dp).background(VelaColor.accentSoft, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    (wallet.activeAccount?.name?.take(1) ?: "W").uppercase(),
                    style = VelaTypography.label(14f), color = VelaColor.accent,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(wallet.activeAccount?.name ?: "Wallet", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Text(wallet.shortAddress, style = VelaTypography.mono(12f), color = VelaColor.textTertiary)
            }
        }

        Spacer(Modifier.height(20.dp))

        VelaPrimaryButton(text = stringResource(R.string.connect_start), onClick = onStart)
    }
}

// MARK: - Advertising State

@Composable
private fun AdvertisingView(wallet: WalletState, onStop: () -> Unit) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
        label = "pulse",
    )

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(VelaColor.blueSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.BluetoothSearching, null, Modifier.size(36.dp), tint = VelaColor.blue.copy(alpha = alpha))
        }

        Spacer(Modifier.height(20.dp))

        Text(stringResource(R.string.connect_waiting), style = VelaTypography.heading(18f), color = VelaColor.textPrimary)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.connect_waiting_desc), style = VelaTypography.body(14f), color = VelaColor.textSecondary, textAlign = TextAlign.Center)

        Spacer(Modifier.height(24.dp))

        VelaSecondaryButton(text = stringResource(R.string.connect_stop), onClick = onStop)
    }
}

// MARK: - Connected State

@Composable
private fun ConnectedView(wallet: WalletState, chainId: Int, onDisconnect: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // Status card
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.greenSoft)
                .border(1.dp, VelaColor.green.copy(alpha = 0.3f), RoundedCornerShape(VelaRadius.card))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).background(VelaColor.green, CircleShape))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Chrome — Vela Connect", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Text(stringResource(R.string.connect_connected), fontSize = 12.sp, color = VelaColor.green)
            }
            // Chain badge
            Text(
                Network.chainName(chainId),
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                color = VelaColor.blue,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(VelaColor.blueSoft)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }

        Spacer(Modifier.height(16.dp))

        // Wallet info
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(VelaRadius.card))
                .background(VelaColor.bgCard)
                .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(36.dp).background(VelaColor.accentSoft, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    (wallet.activeAccount?.name?.take(1) ?: "W").uppercase(),
                    style = VelaTypography.label(14f), color = VelaColor.accent,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(wallet.activeAccount?.name ?: "Wallet", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                Text(wallet.shortAddress, style = VelaTypography.mono(12f), color = VelaColor.textTertiary)
            }
        }

        Spacer(Modifier.height(20.dp))

        VelaSecondaryButton(text = stringResource(R.string.connect_disconnect), onClick = onDisconnect)
    }
}

// MARK: - Request Approval Modal

@Composable
private fun RequestApprovalModal(
    request: BLEIncomingRequest,
    wallet: WalletState,
    chainId: Int,
    isSigning: Boolean,
    error: String?,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(VelaColor.bg)
                .padding(24.dp),
        ) {
            // Origin + method
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(request.origin, fontSize = 13.sp, color = VelaColor.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        methodDisplayName(request.method).uppercase(),
                        fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
                        color = VelaColor.textTertiary,
                    )
                }
                Text(
                    Network.chainName(chainId),
                    fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.blue,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(VelaColor.blueSoft)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }

            Spacer(Modifier.height(16.dp))

            // Request details
            if (request.method == "eth_sendTransaction") {
                val params = request.params.firstOrNull()
                if (params is Map<*, *>) {
                    val to = params["to"] as? String ?: ""
                    val value = params["value"] as? String ?: "0x0"
                    Text("To: ${shortAddr(to)}", style = VelaTypography.mono(13f), color = VelaColor.textPrimary)
                    Text("Value: $value", style = VelaTypography.mono(13f), color = VelaColor.textSecondary)
                }
            } else {
                Text(
                    methodDisplayName(request.method),
                    style = VelaTypography.heading(20f),
                    color = VelaColor.textPrimary,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.connect_approve_desc),
                    style = VelaTypography.body(14f),
                    color = VelaColor.textSecondary,
                )
            }

            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, fontSize = 13.sp, color = VelaColor.accent, textAlign = TextAlign.Center)
            }

            Spacer(Modifier.height(20.dp))

            // Buttons
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                VelaSecondaryButton(
                    text = stringResource(R.string.connect_reject),
                    onClick = onReject,
                    enabled = !isSigning,
                    modifier = Modifier.weight(1f),
                )
                VelaPrimaryButton(
                    text = stringResource(R.string.connect_approve),
                    onClick = onApprove,
                    isLoading = isSigning,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// MARK: - Request Handling

private suspend fun handleRequest(
    activity: Activity,
    request: BLEIncomingRequest,
    wallet: WalletState,
    chainId: Int,
): Any? {
    return when (request.method) {
        "eth_requestAccounts", "eth_accounts" -> listOf(wallet.address)
        "eth_chainId" -> "0x${chainId.toString(16)}"
        "eth_sendTransaction" -> {
            @Suppress("UNCHECKED_CAST")
            val params = request.params.firstOrNull() as? Map<String, Any> ?: throw Exception("Invalid params")
            val to = params["to"] as? String ?: throw Exception("Missing 'to'")
            val value = params["value"] as? String ?: "0x0"
            val data = params["data"] as? String ?: "0x"

            val stored = LocalStorage.shared.findAccount(wallet.activeAccount?.id ?: "")
            val publicKeyHex = stored?.publicKeyHex ?: throw Exception("Public key not found")

            val txService = SafeTransactionService()
            val dataBytes = if (data.length > 2) EthCrypto.hexToBytes(data.removePrefix("0x")) else ByteArray(0)

            val result = if (dataBytes.isEmpty() && value != "0x0") {
                txService.sendNative(activity, wallet.address, to, value, chainId, publicKeyHex)
            } else {
                txService.sendContractCall(activity, wallet.address, to, value, dataBytes, chainId, publicKeyHex)
            }
            result.txHash
        }
        "personal_sign" -> {
            val message = request.params.firstOrNull() as? String ?: throw Exception("No message")
            // Decode message: hex-encoded (0x...) or plain text
            val messageBytes = if (message.startsWith("0x") && message.length > 2 && message.drop(2).all { it in "0123456789abcdefABCDEF" }) {
                EthCrypto.hexToBytes(message.removePrefix("0x"))
            } else {
                message.toByteArray()
            }
            val prefix = "\u0019Ethereum Signed Message:\n${messageBytes.size}".toByteArray()
            val hash = EthCrypto.keccak256(prefix + messageBytes)

            val passkeyService = PasskeyService()
            val assertion = passkeyService.sign(activity, hash)
            "0x${EthCrypto.bytesToHex(assertion.signature ?: ByteArray(0))}"
        }
        else -> throw Exception("Unsupported method: ${request.method}")
    }
}

private fun methodDisplayName(method: String): String = when (method) {
    "eth_sendTransaction" -> "Send Transaction"
    "personal_sign" -> "Sign Message"
    "eth_signTypedData_v4" -> "Sign Typed Data"
    "eth_requestAccounts" -> "Connect"
    "eth_accounts" -> "Accounts"
    "eth_chainId" -> "Chain ID"
    else -> method
}
