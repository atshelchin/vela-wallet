package app.getvela.wallet.ui.wallet

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.ui.draw.clip
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.model.formatBalance
import app.getvela.wallet.model.shortAddr
import app.getvela.wallet.service.*
import app.getvela.wallet.ui.components.*
import app.getvela.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.math.BigDecimal
import java.math.BigInteger

private enum class SendStep { SelectToken, EnterDetails, Confirm, Success }

@Composable
fun SendScreen(
    wallet: WalletState,
    preselectedToken: ApiToken? = null,
    onBack: () -> Unit,
) {
    var step by remember { mutableStateOf(if (preselectedToken != null) SendStep.EnterDetails else SendStep.SelectToken) }
    var tokens by remember { mutableStateOf<List<ApiToken>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var selectedToken by remember { mutableStateOf(preselectedToken) }
    var toAddress by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var txHash by remember { mutableStateOf<String?>(null) }
    var showScanner by remember { mutableStateOf(false) }
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()

    // Load tokens
    LaunchedEffect(Unit) {
        if (wallet.address.isEmpty()) return@LaunchedEffect
        isLoading = true
        val result = withContext(Dispatchers.IO) {
            WalletApiService().fetchTokens(wallet.address)
        }
        tokens = result.filter { it.balanceDouble > 0 }
        isLoading = false
    }

    // System back button handling
    BackHandler {
        when {
            showScanner -> showScanner = false
            step == SendStep.Confirm -> step = SendStep.EnterDetails
            step == SendStep.EnterDetails -> step = SendStep.SelectToken
            else -> onBack()
        }
    }

    // QR Scanner overlay
    if (showScanner) {
        app.getvela.wallet.ui.components.QRScannerScreen(
            onScanned = { value ->
                toAddress = if (value.startsWith("ethereum:")) value.removePrefix("ethereum:").take(42) else value
                showScanner = false
            },
            onClose = { showScanner = false },
        )
        return
    }

    when (step) {
        SendStep.SelectToken -> SelectTokenStep(
            tokens = tokens,
            isLoading = isLoading,
            onBack = onBack,
            onSelect = {
                selectedToken = it
                step = SendStep.EnterDetails
            },
        )
        SendStep.EnterDetails -> EnterDetailsStep(
            token = selectedToken,
            toAddress = toAddress,
            amount = amount,
            onToAddressChange = { toAddress = it },
            onAmountChange = { amount = it },
            onBack = { step = SendStep.SelectToken },
            onChangeToken = { step = SendStep.SelectToken },
            onReview = { step = SendStep.Confirm },
            onScan = { showScanner = true },
        )
        SendStep.Confirm -> ConfirmStep(
            token = selectedToken,
            toAddress = toAddress,
            amount = amount,
            isSending = isSending,
            errorMessage = errorMessage,
            onBack = { step = SendStep.EnterDetails },
            onConfirm = {
                isSending = true
                errorMessage = null
                scope.launch(kotlinx.coroutines.NonCancellable) {
                    try {
                        val token = selectedToken ?: throw Exception("No token selected")
                        val stored = LocalStorage.shared.findAccount(wallet.activeAccount?.id ?: "")
                        val publicKeyHex = stored?.publicKeyHex ?: throw Exception("Public key not found")
                        val txService = SafeTransactionService()

                        val amountWei = amountToWeiHex(amount, token.decimals)
                        val result = if (token.isNative) {
                            txService.sendNative(activity, wallet.address, toAddress, amountWei, token.chainId, publicKeyHex)
                        } else {
                            txService.sendERC20(activity, wallet.address, token.tokenAddress!!, toAddress, amountWei, token.chainId, publicKeyHex)
                        }
                        txHash = result.txHash
                        step = SendStep.Success
                    } catch (e: Exception) {
                        errorMessage = e.message ?: "Transaction failed"
                    }
                    isSending = false
                }
            },
        )
        SendStep.Success -> SuccessStep(
            amount = amount,
            symbol = selectedToken?.symbol ?: "",
            onDone = onBack,
        )
    }
}

// MARK: - Step 1: Select Token

@Composable
private fun SelectTokenStep(
    tokens: List<ApiToken>,
    isLoading: Boolean,
    onBack: () -> Unit,
    onSelect: (ApiToken) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.send_select_token), onBack = onBack)

        if (isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = VelaColor.textTertiary, strokeWidth = 2.dp)
            }
        } else if (tokens.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.send_no_tokens), style = VelaTypography.body(14f), color = VelaColor.textTertiary)
            }
        } else {
            LazyColumn(modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)) {
                items(tokens.sortedByDescending { it.usdValue }, key = { it.id }) { token ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(token) }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        app.getvela.wallet.ui.components.TokenLogo(token = token, size = 40.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(token.symbol, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary)
                            Text(token.chainName, fontSize = 12.sp, color = VelaColor.textTertiary)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(formatBalance(token.balanceDouble), style = VelaTypography.label(14f), color = VelaColor.textPrimary)
                            if (token.usdValue > 0) {
                                Text("$${String.format("%.2f", token.usdValue)}", fontSize = 12.sp, color = VelaColor.textTertiary)
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(12.dp), tint = VelaColor.textTertiary)
                    }
                }
            }
        }
    }
}

// MARK: - Step 2: Enter Details

@Composable
private fun EnterDetailsStep(
    token: ApiToken?,
    toAddress: String,
    amount: String,
    onToAddressChange: (String) -> Unit,
    onAmountChange: (String) -> Unit,
    onBack: () -> Unit,
    onChangeToken: () -> Unit,
    onReview: () -> Unit,
    onScan: () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.send_title), onBack = onBack)

        // Token banner
        token?.let { t ->
            Row(
                modifier = Modifier
                    .padding(horizontal = VelaSpacing.screenH)
                    .padding(bottom = 12.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(VelaRadius.cardSmall))
                    .background(VelaColor.bgWarm)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(t.symbol, style = VelaTypography.label(14f), color = VelaColor.textPrimary)
                Spacer(Modifier.width(4.dp))
                Text("on ${t.chainName}", fontSize = 12.sp, color = VelaColor.textTertiary)
                Spacer(Modifier.weight(1f))
                Text(
                    stringResource(R.string.send_change),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = VelaColor.accent,
                    modifier = Modifier.clickable(onClick = onChangeToken),
                )
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = VelaSpacing.screenH)
                .verticalScroll(rememberScrollState()),
        ) {
            // To field
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.send_to),
                    style = VelaTypography.caption().copy(letterSpacing = 1.sp),
                    color = VelaColor.textTertiary,
                    modifier = Modifier.padding(start = 4.dp),
                )
                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .clickable(onClick = onScan)
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(Icons.Default.QrCodeScanner, null, Modifier.size(14.dp), tint = VelaColor.accent)
                    Text(stringResource(R.string.send_scan), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.accent)
                }
            }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = toAddress,
                onValueChange = onToAddressChange,
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
                    cursorColor = VelaColor.textPrimary,
                ),
            )

            Spacer(Modifier.height(20.dp))

            // Amount field
            Text(
                stringResource(R.string.send_amount),
                style = VelaTypography.caption().copy(letterSpacing = 1.sp),
                color = VelaColor.textTertiary,
                modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
            )
            Box {
                OutlinedTextField(
                    value = amount,
                    onValueChange = onAmountChange,
                    placeholder = { Text("0", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = VelaColor.textTertiary, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = VelaCardShape,
                    textStyle = VelaTypography.heading(32f).copy(textAlign = TextAlign.Center),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = VelaColor.border,
                        unfocusedBorderColor = VelaColor.border,
                        focusedContainerColor = VelaColor.bgCard,
                        unfocusedContainerColor = VelaColor.bgCard,
                        cursorColor = VelaColor.textPrimary,
                    ),
                )
                // Symbol chip
                token?.let {
                    Text(
                        it.symbol,
                        style = VelaTypography.label(14f),
                        color = VelaColor.textSecondary,
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .padding(end = 16.dp)
                            .clip(RoundedCornerShape(50))
                            .background(VelaColor.bgWarm)
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }

            // Balance hint + MAX
            token?.let { t ->
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Balance: ${formatBalance(t.balanceDouble)} ${t.symbol}",
                        fontSize = 13.sp,
                        color = VelaColor.textTertiary,
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        "MAX",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = VelaColor.accent,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(VelaColor.accentSoft)
                            .clickable { onAmountChange("${t.balanceDouble}") }
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }
        }

        // Review button
        VelaPrimaryButton(
            text = stringResource(R.string.send_review),
            onClick = onReview,
            enabled = toAddress.isNotBlank() && amount.isNotBlank(),
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH).padding(bottom = 24.dp),
        )
    }
}

// MARK: - Step 3: Confirm

@Composable
private fun ConfirmStep(
    token: ApiToken?,
    toAddress: String,
    amount: String,
    isSending: Boolean,
    errorMessage: String?,
    onBack: () -> Unit,
    onConfirm: () -> Unit,
) {
    val symbol = token?.symbol ?: ""
    val usdValue = token?.priceUsd?.let { price ->
        amount.toDoubleOrNull()?.let { amt -> String.format("$%.2f", amt * price) }
    } ?: ""

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
    ) {
        VelaNavBar(title = stringResource(R.string.confirm_title), onBack = onBack)

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = VelaSpacing.screenH)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(Modifier.height(8.dp))

            // Amount card
            VelaCard(
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        stringResource(R.string.confirm_sending),
                        style = VelaTypography.caption().copy(letterSpacing = 1.sp),
                        color = VelaColor.textTertiary,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "$amount $symbol",
                        fontSize = 36.sp,
                        fontWeight = FontWeight.Bold,
                        color = VelaColor.textPrimary,
                        letterSpacing = (-1.5).sp,
                    )
                    if (usdValue.isNotEmpty()) {
                        Text("≈ $usdValue", style = VelaTypography.body(14f), color = VelaColor.textTertiary)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Details card
            VelaCard(modifier = Modifier.fillMaxWidth()) {
                ConfirmRow(stringResource(R.string.confirm_address), shortAddr(toAddress))
                HorizontalDivider(color = VelaColor.border, thickness = 1.dp)
                token?.chainName?.let {
                    ConfirmRow(stringResource(R.string.confirm_network), it)
                    HorizontalDivider(color = VelaColor.border, thickness = 1.dp)
                }
                ConfirmRow(stringResource(R.string.confirm_fee), "...", isLast = true)
            }

            errorMessage?.let { err ->
                Spacer(Modifier.height(12.dp))
                Text(err, fontSize = 13.sp, color = VelaColor.accent, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }

        // Confirm button
        VelaPrimaryButton(
            text = stringResource(R.string.confirm_send),
            onClick = onConfirm,
            isLoading = isSending,
            modifier = Modifier.padding(horizontal = VelaSpacing.screenH).padding(bottom = 24.dp),
        )
    }
}

@Composable
private fun ConfirmRow(label: String, value: String, isLast: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 13.sp, color = VelaColor.textTertiary)
        Spacer(Modifier.weight(1f))
        Text(value, style = VelaTypography.label(13f), color = VelaColor.textPrimary)
    }
}

// MARK: - Step 4: Success

@Composable
private fun SuccessStep(
    amount: String,
    symbol: String,
    onDone: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(VelaColor.bg)
            .systemBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Default.CheckCircle,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = VelaColor.green,
        )
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.confirm_sent), style = VelaTypography.heading(24f), color = VelaColor.textPrimary)
        Spacer(Modifier.height(8.dp))
        Text("$amount $symbol", style = VelaTypography.label(16f), color = VelaColor.textSecondary)

        Spacer(Modifier.height(40.dp))

        VelaPrimaryButton(
            text = stringResource(R.string.confirm_done),
            onClick = onDone,
            modifier = Modifier.padding(horizontal = 28.dp),
        )
    }
}

// MARK: - Amount to Wei Hex

private fun amountToWeiHex(amount: String, decimals: Int): String {
    val decimal = BigDecimal(amount)
    var multiplier = BigDecimal.ONE
    repeat(decimals) { multiplier = multiplier.multiply(BigDecimal.TEN) }
    val wei = decimal.multiply(multiplier).toBigInteger()
    return "0x${wei.toString(16)}"
}
