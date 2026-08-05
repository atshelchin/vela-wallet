package app.getvela.wallet

import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import app.getvela.wallet.core.data.ThemePreference
import app.getvela.wallet.core.designsystem.components.VelaLaunchAnimation
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

    /**
     * Deterministic disable for instrumented tests (FR-029).
     *
     * An intent extra rather than a build flag: existing tests must be able to
     * skip the animation without a separate build, and a sleep long enough to
     * outlast it is exactly the flaky waiting this replaces.
     *
     *   adb shell am start -n app.getvela.wallet/.MainActivity --ez vela.skipLaunchAnimation true
     */
    private fun launchAnimationDisabled(): Boolean =
        intent?.getBooleanExtra("vela.skipLaunchAnimation", false) == true

    /**
     * The system's reduce-motion setting (FR-019). Read here rather than inside
     * the component so tests can drive both paths without touching Settings.
     */
    private fun reduceMotion(): Boolean =
        Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        // A fresh process, not a configuration change or a restored activity.
        val coldStart = savedInstanceState == null && !launchAnimationDisabled()
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
                val colors = VelaTheme.colors

                // Spec 012. `coldStart` is true only for a fresh process — a
                // configuration change or a restored activity must not replay it
                // (FR-008). This runs AFTER the existing splash gate releases, so
                // the animation never competes with i18n/theme readiness.
                var launching by rememberSaveable { mutableStateOf(coldStart) }
                var pageAlpha by remember { mutableFloatStateOf(if (coldStart) 0f else 1f) }

                CompositionLocalProvider(
                    LocalVelaStrings provides strings,
                    LocalLayoutDirection provides layoutDirection,
                ) {
                    // One continuous surface. Both the launch screen and Welcome
                    // sit on this exact colour, which is what lets them
                    // cross-dissolve without a washed-out middle (FR-012).
                    Box(modifier = Modifier.fillMaxSize().background(colors.bgBase)) {
                        // Welcome is composed from the first frame, hidden by the
                        // opaque overlay, so the hand-off has nothing left to
                        // build (FR-013a).
                        Box(modifier = Modifier.alpha(pageAlpha)) {
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

                        if (launching) {
                            VelaLaunchAnimation(
                                darkTheme = darkTheme,
                                reduceMotion = reduceMotion(),
                                backgroundColor = colors.bgBase,
                                onProgress = { pageAlpha = it },
                                onFinished = {
                                    pageAlpha = 1f
                                    launching = false
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Identity-per-language wrapper; delegates every lookup to the live runtime. */
private class LanguageSnapshot(delegate: VelaStrings) : VelaStrings by delegate
