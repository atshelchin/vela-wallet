package app.getvela.wallet.feature.onboarding

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

/** Spec entity: the single typed sink both CTAs route through (FR-002). */
enum class OnboardingIntent {
    CreateWallet,
    RecoverWallet,
}

class WelcomeViewModel : ViewModel() {

    var settingsSheetVisible by mutableStateOf(false)
        private set

    fun showSettings() {
        settingsSheetVisible = true
    }

    fun hideSettings() {
        settingsSheetVisible = false
    }

    /**
     * Single onboarding-intent sink (007 FR-010 analog): every CTA activation is
     * recorded here before navigation; the future create/import flows replace the
     * navigation target without touching the Welcome screen.
     */
    fun recordIntent(intent: OnboardingIntent) {
        Log.i(TAG, "onboarding_intent=$intent")
    }

    private companion object {
        const val TAG = "VelaOnboarding"
    }
}
