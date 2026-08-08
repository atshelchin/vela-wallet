package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings

/**
 * Mobile flow container (spec 014, contract §3): M3 ModalBottomSheet per the
 * ThemeSettingsSheet precedent — `containerColor = colors.bgRaised`, token
 * drag handle, scaffold header (state-driven title + close ×), hairline
 * divider, then the pattern content. Hugs content height per state.
 */
@Composable
fun FlowSheet(
    state: CreatePanelState,
    onAction: (ActionId) -> Unit,
    onDismiss: () -> Unit,
) {
    FlowSheetFrame(titleKey = state.scaffoldTitleKey(), onDismiss = onDismiss) {
        CreatePanel(state = state, onAction = onAction)
    }
}

@Composable
fun FlowSheet(
    state: LoginPanelState,
    onAction: (ActionId) -> Unit,
    onDismiss: () -> Unit,
) {
    FlowSheetFrame(titleKey = state.scaffoldTitleKey(), onDismiss = onDismiss) {
        LoginPanel(state = state, onAction = onAction)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FlowSheetFrame(
    titleKey: String,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = colors.bgRaised,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = VelaSpacing.lg)
                    .size(
                        width = VelaSizing.sheetHandleWidth,
                        height = VelaSizing.sheetHandleHeight,
                    )
                    .clip(RoundedCornerShape(VelaRadius.full))
                    .background(colors.borderStrong),
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = VelaSizing.screenPaddingX,
                        end = VelaSpacing.lg,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = strings.t(titleKey),
                    color = colors.fgBase,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.semibold,
                    fontSize = VelaTextSize.xl,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .size(VelaSizing.hitTarget)
                        .clip(RoundedCornerShape(VelaRadius.full))
                        .clickable(role = Role.Button, onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = VelaIcons.Close,
                        contentDescription = strings.t(I18nKeys.Flow.CLOSE),
                        tint = colors.fgMuted,
                        modifier = Modifier.size(VelaIconSize.lg),
                    )
                }
            }
            Spacer(modifier = Modifier.height(VelaSpacing.md))
            HorizontalDivider(color = colors.borderBase, thickness = VelaBorder.hairline)
            content()
        }
    }
}
