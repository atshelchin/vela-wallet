package app.getvela.wallet.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.getvela.wallet.core.data.ThemePreference
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.feature.onboarding.OnboardingIntent
import app.getvela.wallet.feature.onboarding.ThemeSettingsSheet
import app.getvela.wallet.feature.onboarding.WelcomeScreen
import app.getvela.wallet.feature.onboarding.WelcomeViewModel
import app.getvela.wallet.feature.onboarding.placeholder.CreatePlaceholderScreen
import app.getvela.wallet.feature.onboarding.placeholder.ImportPlaceholderScreen
import app.getvela.wallet.feature.wallet.WalletFixtures
import app.getvela.wallet.feature.wallet.WalletScreen
import app.getvela.wallet.feature.wallet.WalletScreenState
import app.getvela.wallet.feature.wallet.gallery.GalleryScreen

object VelaDestinations {
    const val WELCOME = "welcome"
    const val CREATE = "create"
    const val IMPORT = "import"

    // Spec 015: fixture-driven wallet home + preview gallery (research D4).
    const val WALLET = "wallet"
    const val GALLERY = "gallery"

    /** Routes the `vela.startDestination` intent extra may select. */
    val ALL = setOf(WELCOME, CREATE, IMPORT, WALLET, GALLERY)
}

@Composable
fun VelaNavHost(
    darkTheme: Boolean,
    themePreference: ThemePreference,
    onThemeSelected: (ThemePreference) -> Unit,
    startDestination: String = VelaDestinations.WELCOME,
) {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(VelaDestinations.WELCOME) {
            val viewModel: WelcomeViewModel = viewModel()
            WelcomeScreen(
                darkTheme = darkTheme,
                onIntent = { intent ->
                    viewModel.recordIntent(intent)
                    // Route-check + singleTop = rapid double-tap pushes exactly once.
                    if (navController.currentDestination?.route == VelaDestinations.WELCOME) {
                        val route = when (intent) {
                            OnboardingIntent.CreateWallet -> VelaDestinations.CREATE
                            OnboardingIntent.RecoverWallet -> VelaDestinations.IMPORT
                        }
                        navController.navigate(route) { launchSingleTop = true }
                    }
                },
                onLongPressLogo = viewModel::showSettings,
            )
            if (viewModel.settingsSheetVisible) {
                ThemeSettingsSheet(
                    current = themePreference,
                    onSelect = onThemeSelected,
                    onDismiss = viewModel::hideSettings,
                )
            }
        }
        composable(VelaDestinations.CREATE) {
            CreatePlaceholderScreen(
                darkTheme = darkTheme,
                onBack = { navController.popBackStack() },
            )
        }
        composable(VelaDestinations.IMPORT) {
            ImportPlaceholderScreen(
                darkTheme = darkTheme,
                onBack = { navController.popBackStack() },
            )
        }
        composable(VelaDestinations.WALLET) {
            val strings = LocalVelaStrings.current
            // Fixture-driven only (spec FR-005): default state H1; the network
            // pill opens the H8 chain sheet, still pure fixtures.
            var sheetOpen by rememberSaveable { mutableStateOf(false) }
            val model = remember(strings, sheetOpen) {
                WalletFixtures.buildMobileState(
                    if (sheetOpen) WalletScreenState.H8 else WalletScreenState.H1,
                    strings,
                )
            }
            WalletScreen(
                model = model,
                onPillClick = { sheetOpen = true },
                onSheetDismiss = { sheetOpen = false },
            )
        }
        composable(VelaDestinations.GALLERY) {
            GalleryScreen(systemDarkTheme = darkTheme)
        }
    }
}
