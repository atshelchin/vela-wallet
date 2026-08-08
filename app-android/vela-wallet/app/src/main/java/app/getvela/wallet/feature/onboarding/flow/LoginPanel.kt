package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.getvela.wallet.core.i18n.I18nKeys

/**
 * Login-flow panel (spec 014): renders any [LoginPanelState] via the shared
 * pattern authorities — the single-bar progress mode of [WorkingContent] for
 * B1/B1c and the shared [OutcomePane] for every outcome (US3: no duplicated
 * pattern layout).
 */
@Composable
fun LoginPanel(
    state: LoginPanelState,
    onAction: (ActionId) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        is LoginPanelState.Waiting -> WorkingContent(
            headlineKey = I18nKeys.Login.STATUS_AWAITING_PASSKEY,
            hintKey = I18nKeys.Login.STATUS_AWAITING_PASSKEY_HINT,
            elapsedSecs = state.elapsedSecs,
            step = null,
            modifier = modifier,
        )
        is LoginPanelState.Outcome -> OutcomePane(state.spec, onAction, modifier)
    }
}
