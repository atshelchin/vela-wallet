package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.core.i18n.VelaStrings

/**
 * Preview-only translation fake (never shipped): the tooling process cannot
 * load the native engine (WelcomePreviews precedent). Sample copy mirrors
 * locales/en; unknown keys echo their leaf so previews stay legible while the
 * spec-014 corpus batch lands.
 */
private object PreviewStrings : VelaStrings {
    private val sample = mapOf(
        I18nKeys.Create.HEADER to "Create Wallet",
        I18nKeys.Create.ACCOUNT_NAME_LABEL to "Account Name",
        I18nKeys.Create.ACCOUNT_NAME_PLACEHOLDER to "Enter a name for your account",
        I18nKeys.Create.ACCOUNT_NAME_HINT to
            "This name is stored with your public key on-chain for cross-device sign-in.",
        I18nKeys.Create.NAME_TOO_LONG to
            "This name is too long to fit in a passkey — please shorten it.",
        I18nKeys.Create.ACK0 to
            "This is a self-custodial wallet. Your passkey private key is managed by your " +
            "device's password manager. Vela Wallet cannot access or recover it.",
        I18nKeys.Create.ACK1 to
            "If you lose your device, you can restore your wallet on a new device through " +
            "your iCloud or Google account.",
        I18nKeys.Create.ACK3 to "I agree to the ",
        I18nKeys.Create.ACK3_PRIVACY_POLICY to "Privacy Policy",
        I18nKeys.Create.ACK3_AND to " and ",
        I18nKeys.Create.ACK3_TERMS to "Terms of Service",
        I18nKeys.Create.ACK3_PERIOD to ".",
        I18nKeys.Create.CREATE_WALLET_BTN to "Create Wallet",
        I18nKeys.Create.STATUS_SETTING_UP_IDENTITY to "Setting up secure identity...",
        I18nKeys.Create.SUCCESS_TITLE to "Your wallet is ready!",
        I18nKeys.Create.SUCCESS_MESSAGE to "Your address works on all {{count}} supported networks.",
        I18nKeys.Create.VERIFY_HINT to
            "Your passkey is verified and your key is synced — you're all set.",
        I18nKeys.Create.ENTER_WALLET_BTN to "Enter Wallet",
        I18nKeys.Create.TECHNICAL_DETAILS to "Technical details",
        I18nKeys.Flow.STEP_COUNTER to "Step {{current}} of {{total}}",
        I18nKeys.Flow.CONFIRM_IN_PROMPT to "Confirm in the system prompt.",
        I18nKeys.Flow.WAITED_SECONDS to "Waited {{seconds}} seconds",
        I18nKeys.Flow.SERVER_TITLE to "Service temporarily unavailable",
        I18nKeys.Flow.SERVER_BODY to
            "The passkey index service is unreachable — both creating and signing in need it.",
        I18nKeys.Flow.RETRY to "Retry",
        I18nKeys.Flow.EDIT_INDEX_ENDPOINT to "Change index service address",
        I18nKeys.Flow.REPORT_ERROR to "Report this error",
        I18nKeys.Flow.COPY_ADDRESS to "Copy address",
        I18nKeys.Flow.COPIED to "Copied",
        I18nKeys.Flow.CLOSE to "Close",
        I18nKeys.Login.HEADER to "Sign In",
        I18nKeys.Login.STATUS_AWAITING_PASSKEY to "Waiting for your passkey",
        I18nKeys.Login.STATUS_AWAITING_PASSKEY_HINT to
            "Confirm with Face ID or your fingerprint in the system prompt.",
        I18nKeys.Login.RECOVER_OFFER_TITLE to "Recover Your Wallet",
        I18nKeys.Login.RECOVER_OFFER_BODY to
            "The key server has no record of this passkey yet. Confirm one more signature " +
            "to rebuild your wallet address on this device.",
        I18nKeys.Login.RECOVER_CONFIRM to "Recover Now",
        I18nKeys.Login.RECOVER_CANCEL to "Not Now",
    )

    override fun t(key: String): String = sample[key] ?: key.substringAfterLast('.')

    override fun t(key: String, vars: Map<String, String>): String =
        vars.entries.fold(t(key)) { acc, (name, value) ->
            acc.replace("{{$name}}", value)
        }
}

@Composable
private fun FlowPreviewSurface(darkTheme: Boolean, content: @Composable () -> Unit) {
    VelaTheme(darkTheme = darkTheme) {
        CompositionLocalProvider(LocalVelaStrings provides PreviewStrings) {
            // Panels preview on the sheet surface color they ship on.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(VelaTheme.colors.bgRaised),
            ) {
                content()
            }
        }
    }
}

@Preview(name = "Create form · incomplete — dark (A1)")
@Composable
private fun CreateFormPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        CreatePanel(state = FlowFixtures.byCode("A1").createState(), onAction = {})
    }
}

@Preview(name = "Create form · incomplete — light (A1)")
@Composable
private fun CreateFormPreviewLight() {
    FlowPreviewSurface(darkTheme = false) {
        CreatePanel(state = FlowFixtures.byCode("A1").createState(), onAction = {})
    }
}

@Preview(name = "Create form · ready — dark (A2)")
@Composable
private fun CreateFormReadyPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        CreatePanel(state = FlowFixtures.byCode("A2").createState(), onAction = {})
    }
}

@Preview(name = "Create progress · step 1 waiting — dark (A4c)")
@Composable
private fun CreateProgressRingPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        CreatePanel(state = FlowFixtures.byCode("A4c").createState(), onAction = {})
    }
}

@Preview(name = "Create success — dark (A11)")
@Composable
private fun CreateSuccessPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        CreatePanel(state = FlowFixtures.byCode("A11").createState(), onAction = {})
    }
}

@Preview(name = "Server error · details expanded — dark (E2x)")
@Composable
private fun ServerErrorExpandedPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        CreatePanel(state = FlowFixtures.byCode("E2x").createState(), onAction = {})
    }
}

@Preview(name = "Login waiting · ring — dark (B1c)")
@Composable
private fun LoginWaitingPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        LoginPanel(state = FlowFixtures.byCode("B1c").loginState(), onAction = {})
    }
}

@Preview(name = "Login recover offer — dark (B2)")
@Composable
private fun LoginRecoverOfferPreviewDark() {
    FlowPreviewSurface(darkTheme = true) {
        LoginPanel(state = FlowFixtures.byCode("B2").loginState(), onAction = {})
    }
}

private fun StateFixture.createState(): CreatePanelState =
    (panel as FixturePanel.Create).state

private fun StateFixture.loginState(): LoginPanelState =
    (panel as FixturePanel.Login).state
