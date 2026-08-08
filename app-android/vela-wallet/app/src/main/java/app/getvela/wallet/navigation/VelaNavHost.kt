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
import app.getvela.wallet.feature.onboarding.flow.CreatePanelState
import app.getvela.wallet.feature.onboarding.flow.FlowSheet
import app.getvela.wallet.feature.onboarding.flow.LoginPanelState
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
                // Spec 014 US2: the CTAs open the flow bottom sheet over Welcome
                // (visibility in the ViewModel, ThemeSettingsSheet pattern) instead
                // of navigating to the old placeholder screens. Re-taps are
                // idempotent — the sheet state is already set.
                onIntent = viewModel::recordIntent,
                onLongPressLogo = viewModel::showSettings,
            )
            if (viewModel.settingsSheetVisible) {
                ThemeSettingsSheet(
                    current = themePreference,
                    onSelect = onThemeSelected,
                    onDismiss = viewModel::hideSettings,
                )
            }
            // Initial states per contract §3: create → Form empty, login →
            // Waiting(null). System dismissal and close × restore Welcome
            // unchanged; all other action presses are no-op logs (FR-011).
            when (viewModel.flowSheetIntent) {
                OnboardingIntent.CreateWallet -> FlowSheet(
                    state = CreatePanelState.Form(),
                    onAction = viewModel::onFlowAction,
                    onDismiss = viewModel::hideFlowSheet,
                )
                OnboardingIntent.RecoverWallet -> FlowSheet(
                    state = LoginPanelState.Waiting(),
                    onAction = viewModel::onFlowAction,
                    onDismiss = viewModel::hideFlowSheet,
                )
                null -> Unit
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
