package app.getvela.wallet.feature.onboarding

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

/** Spec entity: the single typed sink both CTAs route through (FR-002). */
enum class OnboardingIntent {
    CreateWallet,
    RecoverWallet,

    /** Sign in on a security key specifically — the app-owned CTAP path, even
     *  when a platform passkey is also present. */
    RecoverWithSecurityKey,
}

/**
 * Welcome's own small state: the theme sheet, and nothing else.
 *
 * Spec 014 routed the CTAs into a flow SHEET whose state lived here. Since spec
 * 019 the create journey is a full screen the navigation host owns, and sign-in
 * is the login machine driven by [OnboardingViewModel] — so both CTAs leave
 * this class rather than being absorbed by it. What remains is the long-press
 * settings affordance, which belongs to the screen and to nothing else.
 */
class WelcomeViewModel : ViewModel() {

    var settingsSheetVisible by mutableStateOf(false)
        private set

    fun showSettings() {
        settingsSheetVisible = true
    }

    fun hideSettings() {
        settingsSheetVisible = false
    }
}
