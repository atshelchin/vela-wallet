package app.getvela.wallet

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import app.getvela.wallet.core.data.ThemePreference
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.theme.isDarkEffective
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.core.i18n.VelaStrings
import app.getvela.wallet.navigation.VelaNavHost
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val container = (application as VelaWalletApplication).container
        container.applySystemLocale()

        // Null until the persisted preference is actually read — the splash stays up,
        // so the first frame can never render the wrong palette (data-model MainUiState).
        val themePreferenceState: StateFlow<ThemePreference?> = container.themeRepository
            .themePreference
            .map { preference -> preference as ThemePreference? }
            .stateIn(lifecycleScope, SharingStarted.Eagerly, null)

        splash.setKeepOnScreenCondition {
            !container.i18nRuntime.state.value.ready || themePreferenceState.value == null
        }

        setContent {
            val i18nState by container.i18nRuntime.state.collectAsStateWithLifecycle()
            val themePreference by themePreferenceState.collectAsStateWithLifecycle()

            val preference = themePreference
            if (!i18nState.ready || preference == null) return@setContent

            val darkTheme = preference.isDarkEffective()

            // enableEdgeToEdge's defaults key bar-icon appearance off the SYSTEM uiMode
            // only; the FR-006 override must re-style the bars for the EFFECTIVE theme.
            DisposableEffect(darkTheme) {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { darkTheme },
                    navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { darkTheme },
                )
                onDispose {}
            }

            // New provider identity per resolved language: every t() reader recomposes,
            // but no state (nav back stack, pager page) is discarded — unlike key().
            val strings = remember(i18nState.language) {
                LanguageSnapshot(container.i18nRuntime)
            }
            // Engine dir() drives layout direction so a future RTL locale cannot
            // silently render LTR (spec edge case).
            val layoutDirection =
                if (i18nState.direction == "rtl") LayoutDirection.Rtl else LayoutDirection.Ltr

            VelaTheme(darkTheme = darkTheme) {
                CompositionLocalProvider(
                    LocalVelaStrings provides strings,
                    LocalLayoutDirection provides layoutDirection,
                ) {
                    VelaNavHost(
                        darkTheme = darkTheme,
                        themePreference = preference,
                        onThemeSelected = { selected ->
                            lifecycleScope.launch {
                                container.themeRepository.setThemePreference(selected)
                            }
                        },
                    )
                }
            }
        }
    }
}

/** Identity-per-language wrapper; delegates every lookup to the live runtime. */
private class LanguageSnapshot(delegate: VelaStrings) : VelaStrings by delegate
