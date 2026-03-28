package app.getvela.wallet

import android.app.Activity
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.activity.compose.BackHandler
import app.getvela.wallet.model.Account
import app.getvela.wallet.model.WalletState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.service.*
import app.getvela.wallet.service.ApiNft
import app.getvela.wallet.ui.onboarding.CreateWalletScreen
import app.getvela.wallet.ui.onboarding.WelcomeScreen
import app.getvela.wallet.ui.theme.VelaColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import app.getvela.wallet.ui.theme.VelaWalletTheme
import app.getvela.wallet.ui.wallet.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        LocalStorage.init(this)

        val walletState = WalletState()
        // Restore accounts from local storage
        val stored = LocalStorage.shared.loadAccounts()
        if (stored.isNotEmpty()) {
            walletState.hasWallet = true
            walletState.accounts = stored.map {
                Account(id = it.id, name = it.name, address = it.address, createdAt = it.createdAt)
            }
            walletState.activeAccountIndex = 0
            walletState.address = stored[0].address
        }

        setContent {
            VelaWalletTheme {
                VelaApp(walletState)
            }
        }
    }
}

@Composable
private fun VelaApp(wallet: WalletState) {
    if (wallet.hasWallet) {
        MainTabs(wallet)
    } else {
        OnboardingFlow(wallet)
    }
}

// MARK: - Onboarding (matches iOS OnboardingFlow)

@Composable
private fun OnboardingFlow(wallet: WalletState) {
    var step by remember { mutableStateOf(OnboardingStep.Welcome) }
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()

    when (step) {
        OnboardingStep.Welcome -> WelcomeScreen(
            onCreateWallet = { step = OnboardingStep.Create },
            onLogin = {
                scope.launch {
                    try {
                        val passkeyService = PasskeyService()
                        val result = passkeyService.authenticate(activity)
                        val credentialId = EthCrypto.bytesToHex(result.credentialId)

                        // Check if already in memory
                        val existingIndex = wallet.accounts.indexOfFirst { it.id == credentialId }
                        if (existingIndex >= 0) {
                            wallet.activeAccountIndex = existingIndex
                            wallet.address = wallet.accounts[existingIndex].address
                        } else {
                            val nameFromPasskey = result.userID?.let { PasskeyService.decodeUserName(it) }
                            val stored = LocalStorage.shared.findAccount(credentialId)
                            val name = nameFromPasskey ?: stored?.name ?: "Wallet"

                            var address = stored?.address ?: ""
                            if (address.isEmpty()) {
                                // Try server lookup
                                try {
                                    val record = withContext(Dispatchers.IO) {
                                        PublicKeyIndexService().query(PasskeyService.RELYING_PARTY, credentialId)
                                    }
                                    address = SafeAddressComputer.computeAddress(record.publicKey)
                                    LocalStorage.shared.saveAccount(
                                        LocalStorage.StoredAccount(
                                            id = credentialId, name = name,
                                            publicKeyHex = record.publicKey, address = address,
                                        )
                                    )
                                } catch (_: Exception) {}
                            }

                            if (address.isEmpty()) {
                                Log.w("Login", "Cannot determine Safe address")
                                return@launch
                            }

                            val account = Account(id = credentialId, name = name, address = address)
                            wallet.accounts = wallet.accounts + account
                            wallet.activeAccountIndex = wallet.accounts.size - 1
                            wallet.address = address
                        }
                        wallet.hasWallet = true
                    } catch (e: Exception) {
                        Log.e("Login", "Failed: ${e.message}")
                    }
                }
            },
        )
        OnboardingStep.Create -> CreateWalletScreen(
            onBack = { step = OnboardingStep.Welcome },
            onCreated = { credentialId, address, name ->
                val account = Account(
                    id = credentialId.ifEmpty { java.util.UUID.randomUUID().toString() },
                    name = name,
                    address = address,
                )
                wallet.accounts = listOf(account)
                wallet.activeAccountIndex = 0
                wallet.address = address
                wallet.hasWallet = true
            },
        )
    }
}

private enum class OnboardingStep { Welcome, Create }

// MARK: - Main Tabs (matches iOS MainTabView)

@Composable
private fun MainTabs(wallet: WalletState) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var selectedToken by remember { mutableStateOf<ApiToken?>(null) }
    var selectedNft by remember { mutableStateOf<ApiNft?>(null) }
    var showReceive by remember { mutableStateOf(false) }
    var showSend by remember { mutableStateOf(false) }
    var showAddToken by remember { mutableStateOf(false) }
    var showAccountSwitcher by remember { mutableStateOf(false) }
    var showNetworkEditor by remember { mutableStateOf(false) }
    var sendPreselectedToken by remember { mutableStateOf<ApiToken?>(null) }
    var nftToSend by remember { mutableStateOf<ApiNft?>(null) }
    var showPendingUploads by remember { mutableStateOf(LocalStorage.shared.hasPendingUploads()) }

    // Pending upload overlay (matches iOS PendingUploadOverlay)
    if (showPendingUploads) {
        PendingUploadOverlay(onDismiss = { showPendingUploads = false })
        return
    }

    // Overlay screens — each with BackHandler for system back button
    when {
        showAccountSwitcher -> {
            BackHandler { showAccountSwitcher = false }
            AccountSwitcherScreen(wallet = wallet, onBack = { showAccountSwitcher = false })
        }
        showNetworkEditor -> {
            BackHandler { showNetworkEditor = false }
            NetworkEditorScreen(onBack = { showNetworkEditor = false })
        }
        showAddToken -> {
            BackHandler { showAddToken = false }
            AddTokenScreen(onBack = { showAddToken = false })
        }
        nftToSend != null -> {
            BackHandler { nftToSend = null }
            NFTSendScreen(nft = nftToSend!!, wallet = wallet, onBack = { nftToSend = null })
        }
        selectedNft != null -> {
            BackHandler { selectedNft = null }
            NFTDetailScreen(
                nft = selectedNft!!,
                onBack = { selectedNft = null },
                onSend = { nft -> selectedNft = null; nftToSend = nft },
            )
        }
        showSend -> {
            BackHandler { showSend = false; sendPreselectedToken = null }
            SendScreen(
                wallet = wallet,
                preselectedToken = sendPreselectedToken,
                onBack = { showSend = false; sendPreselectedToken = null },
            )
        }
        selectedToken != null -> {
            BackHandler { selectedToken = null }
            TokenDetailScreen(
                token = selectedToken!!,
                onBack = { selectedToken = null },
                onSend = {
                    sendPreselectedToken = selectedToken
                    selectedToken = null
                    showSend = true
                },
                onReceive = { selectedToken = null; showReceive = true },
            )
        }
        showReceive -> {
            BackHandler { showReceive = false }
            ReceiveScreen(
                wallet = wallet,
                onBack = { showReceive = false },
            )
        }
        else -> Scaffold(
            bottomBar = {
                VelaTabBar(
                    selectedTab = selectedTab,
                    onTabSelected = { selectedTab = it },
                )
            },
        ) { innerPadding ->
            Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> HomeScreen(
                    wallet = wallet,
                    onTokenClick = { selectedToken = it },
                    onSendClick = { showSend = true },
                    onReceiveClick = { showReceive = true },
                    onAddTokenClick = { showAddToken = true },
                )
                1 -> NFTGalleryScreen(
                    wallet = wallet,
                    onNftClick = { selectedNft = it },
                    useMockData = true, // TODO: remove when real data is available
                )
                2 -> ConnectScreen(wallet, onAccountSwitcher = { showAccountSwitcher = true })
                3 -> SettingsScreen(
                    wallet = wallet,
                    onLogout = {
                        wallet.hasWallet = false
                        wallet.accounts = emptyList()
                        wallet.address = ""
                    },
                    onAccountSwitcher = { showAccountSwitcher = true },
                    onNetworkEditor = { showNetworkEditor = true },
                )
            }
            }
        }
    }
}

@Composable
private fun VelaTabBar(selectedTab: Int, onTabSelected: (Int) -> Unit) {
    val tabs = listOf(
        Triple(Icons.Default.GridView, R.string.tab_wallet, 0),
        Triple(Icons.Default.Star, R.string.tab_nfts, 1),
        Triple(Icons.Default.Language, R.string.tab_dapps, 2),
        Triple(Icons.Default.Settings, R.string.tab_settings, 3),
    )

    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(VelaColor.bgCard)
            .padding(horizontal = 8.dp, vertical = 8.dp)
            .navigationBarsPadding(),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        tabs.forEach { (icon, labelRes, index) ->
            val selected = selectedTab == index
            androidx.compose.foundation.layout.Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                    .background(if (selected) VelaColor.accentSoft else Color.Transparent)
                    .clickable { onTabSelected(index) }
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(22.dp),
                    tint = if (selected) VelaColor.accent else VelaColor.textTertiary,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(labelRes),
                    fontSize = 11.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (selected) VelaColor.accent else VelaColor.textTertiary,
                )
            }
        }
    }
}
