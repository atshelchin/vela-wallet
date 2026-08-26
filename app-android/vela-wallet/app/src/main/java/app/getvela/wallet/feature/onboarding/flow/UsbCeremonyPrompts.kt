package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings
import uniffi.vela_core_uniffi.CtapCredentialChoice

/**
 * The dialogs the app-owned CTAP path draws itself.
 *
 * Every OTHER passkey route on this platform hands the ceremony to a system
 * sheet, which draws its own PIN entry, touch prompt and account picker. The
 * app-owned USB path has no such sheet — it IS the client — so it has to say
 * these three things on its own behalf, the way the desktop does. The copy is
 * the shared corpus (spec 019 §5); nothing here is hard-coded.
 */

/** The security key's PIN. `onSubmit(null)` / dismissal is a cancellation. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsbPinDialog(
    product: String,
    retries: Int,
    isRetry: Boolean,
    onSubmit: (String?) -> Unit,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    var pin by remember { mutableStateOf("") }
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(
        onDismissRequest = { onSubmit(null) },
        sheetState = sheetState,
        containerColor = colors.bgRaised,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VelaSpacing.xl2)
                .padding(bottom = VelaSpacing.xl2)
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(VelaSpacing.lg),
        ) {
            Text(
                text = strings.t(I18nKeys.Create.PIN_TITLE),
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl2,
            )
            Text(
                text = strings.t(I18nKeys.Create.PIN_BODY, mapOf("product" to product)),
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontSize = VelaTextSize.base,
            )
            OutlinedTextField(
                value = pin,
                onValueChange = { pin = it },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                label = { Text(strings.t(I18nKeys.Create.PIN_LABEL)) },
                modifier = Modifier.fillMaxWidth(),
            )
            if (isRetry) {
                Text(
                    text = strings.t(I18nKeys.Create.PIN_REJECTED),
                    color = colors.errorBase,
                    fontFamily = VelaFontFamily,
                    fontSize = VelaTextSize.sm,
                )
            }
            if (retries >= 0) {
                Text(
                    text = strings.t(
                        I18nKeys.Create.PIN_ATTEMPTS_LEFT,
                        mapOf("attempts" to retries.toString()),
                    ),
                    color = colors.fgSubtle,
                    fontFamily = VelaFontFamily,
                    fontSize = VelaTextSize.sm,
                )
            }
            VelaPrimaryButton(
                text = strings.t(I18nKeys.Create.CONFIRM_KEY_BTN),
                onClick = { onSubmit(pin) },
                enabled = pin.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** Which of several wallets on one key. `onPick(null)` / dismissal cancels. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsbWalletPicker(
    choices: List<CtapCredentialChoice>,
    onPick: (Int?) -> Unit,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors

    ModalBottomSheet(
        onDismissRequest = { onPick(null) },
        containerColor = colors.bgRaised,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VelaSpacing.xl2)
                .padding(bottom = VelaSpacing.xl2),
            verticalArrangement = Arrangement.spacedBy(VelaSpacing.md),
        ) {
            Text(
                text = strings.t(I18nKeys.Login.PICK_TITLE),
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl2,
            )
            val product = choices.firstOrNull()?.product ?: ""
            Text(
                text = strings.t(I18nKeys.Login.PICK_BODY, mapOf("product" to product)),
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontSize = VelaTextSize.base,
            )
            Spacer(modifier = Modifier.height(VelaSpacing.sm))
            choices.forEachIndexed { index, choice ->
                if (index > 0) HorizontalDivider(color = colors.borderBase)
                Text(
                    text = choice.name.ifEmpty { strings.t(I18nKeys.Login.PICK_UNNAMED) },
                    color = colors.fgBase,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.semibold,
                    fontSize = VelaTextSize.lg,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(index) }
                        .padding(vertical = VelaSpacing.lg),
                )
            }
        }
    }
}

/**
 * The key is blinking — "touch it now". Not dismissable: the person's next act
 * is a physical touch, not a tap on screen. It clears when the ceremony's next
 * step arrives (the ViewModel sets the state to null).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsbTouchIndicator(kind: String, product: String) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    val body = when (kind) {
        "fingerprint" -> strings.t(I18nKeys.Create.TOUCH_FINGERPRINT_BODY, mapOf("product" to product))
        "select" -> strings.t(I18nKeys.Create.TOUCH_SELECT_BODY)
        else -> strings.t(I18nKeys.Create.TOUCH_BODY, mapOf("product" to product))
    }

    ModalBottomSheet(
        // A blinking key is answered with a finger, not a swipe — but a sheet
        // that literally cannot be dismissed traps a person whose key went
        // away, so dismissal is allowed and simply lets the exchange time out.
        onDismissRequest = {},
        containerColor = colors.bgRaised,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VelaSpacing.xl2)
                .padding(bottom = VelaSpacing.xl3),
            verticalArrangement = Arrangement.spacedBy(VelaSpacing.md),
        ) {
            Text(
                text = strings.t(I18nKeys.Create.TOUCH_TITLE),
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl2,
            )
            Text(
                text = body,
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontSize = VelaTextSize.base,
            )
        }
    }
}
