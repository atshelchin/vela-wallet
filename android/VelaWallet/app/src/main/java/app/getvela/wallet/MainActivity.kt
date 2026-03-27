package app.getvela.wallet

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.res.stringResource
import app.getvela.wallet.model.Account
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.service.ApiToken
import app.getvela.wallet.service.LocalStorage
import app.getvela.wallet.ui.onboarding.CreateWalletScreen
import app.getvela.wallet.ui.onboarding.WelcomeScreen
import app.getvela.wallet.ui.theme.VelaColor
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

    when (step) {
        OnboardingStep.Welcome -> WelcomeScreen(
            onCreateWallet = { step = OnboardingStep.Create },
            onLogin = {
                // TODO: Passkey authentication via CredentialManager
            },
        )
        OnboardingStep.Create -> CreateWalletScreen(
            onBack = { step = OnboardingStep.Welcome },
            onCreated = { address, name ->
                val account = Account(
                    id = java.util.UUID.randomUUID().toString(),
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
    var showReceive by remember { mutableStateOf(false) }
    var showSend by remember { mutableStateOf(false) }
    var sendPreselectedToken by remember { mutableStateOf<ApiToken?>(null) }

    // Overlay screens (token detail, receive, send)
    when {
        showSend -> SendScreen(
            wallet = wallet,
            preselectedToken = sendPreselectedToken,
            onBack = { showSend = false; sendPreselectedToken = null },
        )
        selectedToken != null -> TokenDetailScreen(
            token = selectedToken!!,
            onBack = { selectedToken = null },
            onSend = {
                sendPreselectedToken = selectedToken
                selectedToken = null
                showSend = true
            },
            onReceive = { selectedToken = null; showReceive = true },
        )
        showReceive -> ReceiveScreen(
            wallet = wallet,
            onBack = { showReceive = false },
        )
        else -> Scaffold(
            bottomBar = {
                NavigationBar(containerColor = VelaColor.bgCard) {
                    NavigationBarItem(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        icon = { Icon(Icons.Default.GridView, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_wallet)) },
                        colors = navBarItemColors(),
                    )
                    NavigationBarItem(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        icon = { Icon(Icons.Default.Language, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_dapps)) },
                        colors = navBarItemColors(),
                    )
                    NavigationBarItem(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                        label = { Text(stringResource(R.string.tab_settings)) },
                        colors = navBarItemColors(),
                    )
                }
            },
        ) { _ ->
            when (selectedTab) {
                0 -> HomeScreen(
                    wallet = wallet,
                    onTokenClick = { selectedToken = it },
                    onSendClick = { showSend = true },
                    onReceiveClick = { showReceive = true },
                )
                1 -> ConnectScreen(wallet)
                2 -> SettingsScreen(wallet, onLogout = {
                    wallet.hasWallet = false
                    wallet.accounts = emptyList()
                    wallet.address = ""
                })
            }
        }
    }
}

@Composable
private fun navBarItemColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = VelaColor.accent,
    selectedTextColor = VelaColor.accent,
    indicatorColor = VelaColor.accentSoft,
    unselectedIconColor = VelaColor.textTertiary,
    unselectedTextColor = VelaColor.textTertiary,
)
