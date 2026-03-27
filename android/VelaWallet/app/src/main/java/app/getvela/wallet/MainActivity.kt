package app.getvela.wallet

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.getvela.wallet.model.Account
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.ui.onboarding.CreateWalletScreen
import app.getvela.wallet.ui.onboarding.WelcomeScreen
import app.getvela.wallet.ui.theme.VelaColor
import app.getvela.wallet.ui.theme.VelaWalletTheme
import app.getvela.wallet.ui.wallet.ConnectScreen
import app.getvela.wallet.ui.wallet.HomeScreen
import app.getvela.wallet.ui.wallet.SettingsScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val walletState = WalletState()
        // TODO: Restore accounts from local storage

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

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = VelaColor.bgCard,
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.GridView, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_wallet)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = VelaColor.accent,
                        selectedTextColor = VelaColor.accent,
                        indicatorColor = VelaColor.accentSoft,
                        unselectedIconColor = VelaColor.textTertiary,
                        unselectedTextColor = VelaColor.textTertiary,
                    ),
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Language, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_dapps)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = VelaColor.accent,
                        selectedTextColor = VelaColor.accent,
                        indicatorColor = VelaColor.accentSoft,
                        unselectedIconColor = VelaColor.textTertiary,
                        unselectedTextColor = VelaColor.textTertiary,
                    ),
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_settings)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = VelaColor.accent,
                        selectedTextColor = VelaColor.accent,
                        indicatorColor = VelaColor.accentSoft,
                        unselectedIconColor = VelaColor.textTertiary,
                        unselectedTextColor = VelaColor.textTertiary,
                    ),
                )
            }
        },
    ) { padding ->
        when (selectedTab) {
            0 -> HomeScreen(wallet)
            1 -> ConnectScreen(wallet)
            2 -> SettingsScreen(wallet, onLogout = {
                wallet.hasWallet = false
                wallet.accounts = emptyList()
                wallet.address = ""
            })
        }
    }
}
