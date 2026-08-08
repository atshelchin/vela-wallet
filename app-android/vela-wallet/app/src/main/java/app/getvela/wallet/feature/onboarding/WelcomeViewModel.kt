package app.getvela.wallet.feature.onboarding

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import app.getvela.wallet.feature.onboarding.flow.ActionId

/** Spec entity: the single typed sink both CTAs route through (FR-002). */
enum class OnboardingIntent {
    CreateWallet,
    RecoverWallet,
}

class WelcomeViewModel : ViewModel() {

    var settingsSheetVisible by mutableStateOf(false)
        private set

    /**
     * Which onboarding flow sheet is open over Welcome, if any (spec 014 US2,
     * ThemeSettingsSheet visibility pattern). Non-null presents [FlowSheet]
     * with the flow's initial state: create → Form empty, login → Waiting(null).
     */
    var flowSheetIntent by mutableStateOf<OnboardingIntent?>(null)
        private set

    fun showSettings() {
        settingsSheetVisible = true
    }

    fun hideSettings() {
        settingsSheetVisible = false
    }

    fun hideFlowSheet() {
        flowSheetIntent = null
    }

    /**
     * Single onboarding-intent sink (007 FR-010 analog): every CTA activation is
     * recorded here, then opens the flow sheet in place of the former placeholder
     * navigation (spec 014 T027); the future wiring feature swaps in the real
     * state machines without touching the Welcome screen.
     */
    fun recordIntent(intent: OnboardingIntent) {
        Log.i(TAG, "onboarding_intent=$intent")
        flowSheetIntent = intent
    }

    /**
     * Production action sink (spec 014 contract §2): every press is a no-op log;
     * only the back-flavoured ids also dismiss the sheet. No business behaviour
     * runs in this feature (FR-011).
     */
    fun onFlowAction(id: ActionId) {
        Log.i(TAG, "onboarding_flow_action=$id")
        when (id) {
            ActionId.Back, ActionId.Cancel, ActionId.Close, ActionId.NotNow -> hideFlowSheet()
            else -> Unit
        }
    }

    private companion object {
        const val TAG = "VelaOnboarding"
    }
}
