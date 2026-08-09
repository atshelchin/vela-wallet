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
import app.getvela.wallet.feature.onboarding.flow.CreatePanelState
import app.getvela.wallet.feature.onboarding.flow.FlowSheet
import app.getvela.wallet.feature.onboarding.flow.LoginPanelState
import app.getvela.wallet.feature.contacts.ContactsActions
import app.getvela.wallet.feature.contacts.ContactsFixtures
import app.getvela.wallet.feature.contacts.ContactsRoute
import app.getvela.wallet.feature.contacts.ContactsScreenState
import app.getvela.wallet.feature.contacts.gallery.ContactsGalleryScreen
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

    // Spec 018: fixture-driven contacts screens + their preview gallery (D1).
    const val CONTACTS = "contacts"
    const val CONTACTS_GALLERY = "contacts-gallery"

    /** Routes the `vela.startDestination` intent extra may select. */
    val ALL = setOf(WELCOME, CREATE, IMPORT, WALLET, GALLERY, CONTACTS, CONTACTS_GALLERY)
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
        composable(VelaDestinations.CONTACTS) {
            val strings = LocalVelaStrings.current
            // Fixture-driven only (spec 018 FR-005): default state C1; the
            // person-add button opens the C5 sheet, still pure fixtures.
            var menuOpen by rememberSaveable { mutableStateOf(false) }
            val model = remember(strings, menuOpen) {
                ContactsFixtures.buildMobileState(
                    if (menuOpen) ContactsScreenState.C5 else ContactsScreenState.C1,
                    strings,
                )
            }
            ContactsRoute(
                model = model,
                actions = ContactsActions(
                    onAction = { id -> if (id == "contacts.addContact") menuOpen = true },
                    onDismissMenu = { menuOpen = false },
                ),
            )
        }
        composable(VelaDestinations.CONTACTS_GALLERY) {
            ContactsGalleryScreen(systemDarkTheme = darkTheme)
        }
    }
}
