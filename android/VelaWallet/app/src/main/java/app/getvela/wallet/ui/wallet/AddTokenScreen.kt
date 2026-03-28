package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.Network
import app.getvela.wallet.service.EthCrypto
import app.getvela.wallet.service.LocalStorage
import app.getvela.wallet.service.RPCAdapter
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import androidx.compose.ui.graphics.Color
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun AddTokenScreen(onBack: () -> Unit) {
    var selectedNetwork by remember { mutableStateOf(Network.defaults[0]) }
    var contractAddress by remember { mutableStateOf("") }
    var tokenName by remember { mutableStateOf("") }
    var tokenSymbol by remember { mutableStateOf("") }
    var tokenDecimals by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var tokenFetched by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showScanner by remember { mutableStateOf(false) }
    var showNetworkPicker by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    if (showScanner) {
        app.getvela.wallet.ui.components.QRScannerScreen(
            onScanned = { value -> contractAddress = value; showScanner = false },
            onClose = { showScanner = false },
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = stringResource(R.string.add_token_title), onBack = onBack)

        Column(modifier = Modifier.padding(horizontal = VelaSpacing.screenH)) {
            // Network selector
            Text(
                stringResource(R.string.add_token_network),
                style = VelaTypography.caption().copy(letterSpacing = 1.sp),
                color = VelaColor.textTertiary,
                modifier = Modifier.padding(start = 4.dp, bottom = 8.dp, top = 16.dp),
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(VelaCardShape)
                    .background(VelaColor.bgCard)
                    .border(1.dp, VelaColor.border, VelaCardShape)
                    .clickable { showNetworkPicker = !showNetworkPicker }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(selectedNetwork.displayName, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary)
                Text(" · Chain ${selectedNetwork.chainId}", fontSize = 12.sp, color = VelaColor.textTertiary)
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.KeyboardArrowDown, null, Modifier.size(16.dp), tint = VelaColor.textTertiary)
            }

            // Network picker dropdown
            if (showNetworkPicker) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(VelaRadius.cardSmall))
                        .background(VelaColor.bgCard)
                        .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.cardSmall)),
                ) {
                    Network.defaults.forEach { network ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedNetwork = network
                                    showNetworkPicker = false
                                }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(network.displayName, fontSize = 14.sp, color = VelaColor.textPrimary, modifier = Modifier.weight(1f))
                            if (network == selectedNetwork) {
                                Icon(Icons.Default.Check, null, Modifier.size(16.dp), tint = VelaColor.accent)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            Spacer(Modifier.height(20.dp))

            // Contract address
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.add_token_contract), style = VelaTypography.caption().copy(letterSpacing = 1.sp), color = VelaColor.textTertiary, modifier = Modifier.padding(start = 4.dp))
                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { showScanner = true }.padding(horizontal = 4.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(Icons.Default.QrCodeScanner, null, Modifier.size(14.dp), tint = VelaColor.accent)
                    Text(stringResource(R.string.send_scan), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.accent)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = contractAddress,
                    onValueChange = { contractAddress = it; tokenFetched = false },
                    placeholder = { Text(stringResource(R.string.add_token_contract_placeholder), color = VelaColor.textTertiary) },
                    modifier = Modifier.weight(1f),
                    shape = VelaCardShape,
                    textStyle = VelaTypography.mono(13f),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = VelaColor.border,
                        unfocusedBorderColor = VelaColor.border,
                        focusedContainerColor = VelaColor.bgCard,
                        unfocusedContainerColor = VelaColor.bgCard,
                    ),
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        isLoading = true
                        errorMessage = null
                        scope.launch {
                            try {
                                val chainId = selectedNetwork.chainId
                                val addr = contractAddress.trim()
                                val (name, symbol, decimals) = withContext(Dispatchers.IO) {
                                    fetchTokenMetadata(addr, chainId)
                                }
                                tokenName = name
                                tokenSymbol = symbol
                                tokenDecimals = "$decimals"
                                tokenFetched = name.isNotEmpty()
                                if (!tokenFetched) errorMessage = "Failed to fetch token info"
                            } catch (e: Exception) {
                                errorMessage = e.message
                            }
                            isLoading = false
                        }
                    },
                    enabled = contractAddress.length >= 42 && !isLoading,
                    shape = VelaButtonShape,
                    colors = ButtonDefaults.buttonColors(containerColor = VelaColor.accent),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.add_token_fetch), color = Color.White)
                    }
                }
            }

            if (tokenFetched) {
                Spacer(Modifier.height(20.dp))

                // Token info fields
                TokenInfoField(stringResource(R.string.add_token_name), tokenName) { tokenName = it }
                Spacer(Modifier.height(12.dp))
                TokenInfoField(stringResource(R.string.add_token_symbol), tokenSymbol) { tokenSymbol = it }
                Spacer(Modifier.height(12.dp))
                TokenInfoField(stringResource(R.string.add_token_decimals), tokenDecimals) { tokenDecimals = it }
            }

            errorMessage?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, fontSize = 13.sp, color = VelaColor.accent)
            }

            Spacer(Modifier.height(24.dp))

            if (tokenFetched) {
                VelaPrimaryButton(
                    text = stringResource(R.string.add_token_add),
                    onClick = {
                        val token = LocalStorage.CustomToken(
                            id = "${selectedNetwork.chainId}_${contractAddress.trim()}",
                            chainId = selectedNetwork.chainId,
                            contractAddress = contractAddress.trim(),
                            symbol = tokenSymbol,
                            name = tokenName,
                            decimals = tokenDecimals.toIntOrNull() ?: 18,
                            networkName = selectedNetwork.displayName,
                        )
                        LocalStorage.shared.saveCustomToken(token)
                        onBack()
                    },
                    enabled = tokenSymbol.isNotBlank(),
                )
            }
        }
    }
}

@Composable
private fun TokenInfoField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        shape = VelaCardShape,
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = VelaColor.border,
            unfocusedBorderColor = VelaColor.border,
            focusedContainerColor = VelaColor.bgCard,
            unfocusedContainerColor = VelaColor.bgCard,
        ),
    )
}

private fun fetchTokenMetadata(contractAddress: String, chainId: Int): Triple<String, String, Int> {
    fun ethCall(data: String): String {
        val callObj = JSONObject().put("to", contractAddress).put("data", data)
        val params = JSONArray().put(callObj).put("latest")
        val response = RPCAdapter.call("eth_call", params, chainId)
        return JSONObject(response).optString("result", "0x")
    }

    fun decodeString(hex: String): String {
        val clean = hex.removePrefix("0x")
        if (clean.length < 128) return ""
        val offset = clean.substring(0, 64).toLong(16).toInt() * 2
        val length = clean.substring(offset, offset + 64).toLong(16).toInt()
        val start = offset + 64
        val end = minOf(start + length * 2, clean.length)
        val bytes = EthCrypto.hexToBytes(clean.substring(start, end))
        return String(bytes).trim()
    }

    fun decodeUint(hex: String): Int {
        val clean = hex.removePrefix("0x")
        if (clean.length < 64) return 18
        return clean.substring(0, 64).trimStart('0').ifEmpty { "0" }.toLong(16).toInt()
    }

    val nameHex = ethCall("0x06fdde03")
    val symbolHex = ethCall("0x95d89b41")
    val decimalsHex = ethCall("0x313ce567")

    return Triple(decodeString(nameHex), decodeString(symbolHex), decodeUint(decimalsHex))
}

