package app.getvela.wallet.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.getvela.wallet.core.data.ThemePreference
import app.getvela.wallet.feature.onboarding.OnboardingIntent
import app.getvela.wallet.feature.onboarding.ThemeSettingsSheet
import app.getvela.wallet.feature.onboarding.WelcomeScreen
import app.getvela.wallet.feature.onboarding.WelcomeViewModel
import app.getvela.wallet.feature.onboarding.placeholder.CreatePlaceholderScreen
import app.getvela.wallet.feature.onboarding.placeholder.ImportPlaceholderScreen

object VelaDestinations {
    const val WELCOME = "welcome"
    const val CREATE = "create"
    const val IMPORT = "import"
}

@Composable
fun VelaNavHost(
    darkTheme: Boolean,
    themePreference: ThemePreference,
    onThemeSelected: (ThemePreference) -> Unit,
) {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = VelaDestinations.WELCOME,
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
    }
}
