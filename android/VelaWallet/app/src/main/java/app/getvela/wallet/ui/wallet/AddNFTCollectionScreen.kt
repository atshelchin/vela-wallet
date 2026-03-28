package app.getvela.wallet.ui.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.Network
import app.getvela.wallet.service.EthCrypto
import app.getvela.wallet.service.LocalStorage
import app.getvela.wallet.service.RPCAdapter
import app.getvela.wallet.ui.components.VelaNavBar
import app.getvela.wallet.ui.components.VelaPrimaryButton
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight

@Composable
fun AddNFTCollectionScreen(onBack: () -> Unit) {
    var selectedNetwork by remember { mutableStateOf(Network.defaults[0]) }
    var contractAddress by remember { mutableStateOf("") }
    var collectionName by remember { mutableStateOf("") }
    var tokenType by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var fetched by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showNetworkPicker by remember { mutableStateOf(false) }
    var showScanner by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    if (showScanner) {
        app.getvela.wallet.ui.components.QRScannerScreen(
            onScanned = { value -> contractAddress = value; showScanner = false },
            onClose = { showScanner = false },
        )
        return
    }

    Column(
        modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        VelaNavBar(title = stringResource(R.string.nft_add_collection_title), onBack = onBack)

        Column(modifier = Modifier.padding(horizontal = VelaSpacing.screenH)) {
            // Network selector
            Text(stringResource(R.string.add_token_network),
                style = VelaTypography.caption().copy(letterSpacing = 1.sp),
                color = VelaColor.textTertiary,
                modifier = Modifier.padding(start = 4.dp, bottom = 8.dp, top = 16.dp))

            Row(
                modifier = Modifier.fillMaxWidth()
                    .clip(VelaCardShape).background(VelaColor.bgCard)
                    .border(1.dp, VelaColor.border, VelaCardShape)
                    .clickable { showNetworkPicker = !showNetworkPicker }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(selectedNetwork.displayName, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = VelaColor.textPrimary)
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.KeyboardArrowDown, null, Modifier.size(16.dp), tint = VelaColor.textTertiary)
            }

            if (showNetworkPicker) {
                Column(
                    modifier = Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(VelaRadius.cardSmall))
                        .background(VelaColor.bgCard)
                        .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.cardSmall)),
                ) {
                    Network.defaults.forEach { network ->
                        Row(
                            modifier = Modifier.fillMaxWidth()
                                .clickable { selectedNetwork = network; showNetworkPicker = false }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(network.displayName, fontSize = 14.sp, color = VelaColor.textPrimary, modifier = Modifier.weight(1f))
                            if (network == selectedNetwork) Icon(Icons.Default.Check, null, Modifier.size(16.dp), tint = VelaColor.accent)
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
                    onValueChange = { contractAddress = it; fetched = false },
                    placeholder = { Text("0x…", color = VelaColor.textTertiary) },
                    modifier = Modifier.weight(1f),
                    shape = VelaCardShape,
                    textStyle = VelaTypography.mono(13f),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = VelaColor.border, unfocusedBorderColor = VelaColor.border,
                        focusedContainerColor = VelaColor.bgCard, unfocusedContainerColor = VelaColor.bgCard,
                    ),
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        isLoading = true; errorMessage = null
                        scope.launch {
                            try {
                                val (name, type) = withContext(Dispatchers.IO) {
                                    fetchNFTCollectionInfo(contractAddress.trim(), selectedNetwork.chainId)
                                }
                                collectionName = name
                                tokenType = type
                                fetched = name.isNotEmpty()
                                if (!fetched) errorMessage = "Could not fetch collection info"
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
                    if (isLoading) CircularProgressIndicator(Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    else Text(stringResource(R.string.add_token_fetch), color = Color.White)
                }
            }

            if (fetched) {
                Spacer(Modifier.height(20.dp))
                OutlinedTextField(
                    value = collectionName, onValueChange = { collectionName = it },
                    label = { Text("Collection Name") },
                    modifier = Modifier.fillMaxWidth(), shape = VelaCardShape, singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = VelaColor.border, unfocusedBorderColor = VelaColor.border,
                        focusedContainerColor = VelaColor.bgCard, unfocusedContainerColor = VelaColor.bgCard,
                    ),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = tokenType, onValueChange = { tokenType = it },
                    label = { Text("Token Type") },
                    modifier = Modifier.fillMaxWidth(), shape = VelaCardShape, singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = VelaColor.border, unfocusedBorderColor = VelaColor.border,
                        focusedContainerColor = VelaColor.bgCard, unfocusedContainerColor = VelaColor.bgCard,
                    ),
                )
            }

            errorMessage?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, fontSize = 13.sp, color = VelaColor.accent)
            }

            Spacer(Modifier.height(24.dp))

            if (fetched) {
                VelaPrimaryButton(
                    text = stringResource(R.string.nft_add_collection_title),
                    onClick = {
                        // Save to local storage as a watched collection
                        LocalStorage.shared.saveCustomToken(
                            LocalStorage.CustomToken(
                                id = "${selectedNetwork.chainId}_${contractAddress.trim()}_nft",
                                chainId = selectedNetwork.chainId,
                                contractAddress = contractAddress.trim(),
                                symbol = "NFT",
                                name = collectionName,
                                decimals = 0,
                                networkName = selectedNetwork.displayName,
                            )
                        )
                        onBack()
                    },
                    enabled = collectionName.isNotBlank(),
                )
            }
        }
    }
}

private fun fetchNFTCollectionInfo(contractAddress: String, chainId: Int): Pair<String, String> {
    fun ethCall(data: String): String {
        val callObj = JSONObject().put("to", contractAddress).put("data", data)
        val params = JSONArray().put(callObj).put("latest")
        return try {
            val response = RPCAdapter.call("eth_call", params, chainId)
            JSONObject(response).optString("result", "0x")
        } catch (_: Exception) { "0x" }
    }

    fun decodeString(hex: String): String {
        val clean = hex.removePrefix("0x")
        if (clean.length < 128) return ""
        val offset = clean.substring(0, 64).toLong(16).toInt() * 2
        val length = clean.substring(offset, offset + 64).toLong(16).toInt()
        val start = offset + 64
        val end = minOf(start + length * 2, clean.length)
        return String(EthCrypto.hexToBytes(clean.substring(start, end))).trim()
    }

    // name() = 0x06fdde03
    val nameHex = ethCall("0x06fdde03")
    val name = decodeString(nameHex)

    // Try supportsInterface(0x80ac58cd) for ERC721
    val erc721Check = ethCall("0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000")
    val isERC721 = erc721Check.removePrefix("0x").trimStart('0').let {
        it == "1" || it.endsWith("1")
    }

    val type = if (isERC721) "ERC721" else "ERC1155"
    return Pair(name.ifEmpty { "Unknown Collection" }, type)
}
