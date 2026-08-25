package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.times
import app.getvela.wallet.core.designsystem.components.VelaAckRow
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.components.VelaTextField
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings

/**
 * Name the wallet, and accept the two gates.
 *
 * Two checkboxes, matching the core's `ACK_COUNT` (data-model §2, 4 → 2). The
 * recovery line between them is an ASSURANCE — a fact about what the founding
 * key set buys you — not a third gate, so it renders with a filled tick and
 * nothing to tap. Making it tappable would invite a person to agree to something
 * that changes nothing.
 *
 * Row order follows the design: what the wallet is, what it gives you, what you
 * agree to. Legal assent goes LAST because it is the only line that is about the
 * company rather than about the wallet.
 */
@Composable
fun ColumnScope.NameScreen(
    name: String,
    nameEditable: Boolean,
    nameTooLong: Boolean,
    acks: List<Boolean>,
    canSubmit: Boolean,
    busy: Boolean,
    submitLabel: String,
    statusText: String?,
    showStartOver: Boolean,
    onName: (String) -> Unit,
    onToggleAck: (Int) -> Unit,
    onSubmit: () -> Unit,
    onStartOver: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenTerms: () -> Unit,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors

    Column(
        modifier = Modifier
            .weight(1f)
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = strings.t(I18nKeys.Create.NAME_TITLE),
            color = colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.bold,
            fontSize = VelaTextSize.xl3,
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl3))

        VelaTextField(
            value = name,
            onValueChange = { if (nameEditable) onName(it) },
            label = strings.t(I18nKeys.Create.ACCOUNT_NAME_LABEL),
            placeholder = strings.t(I18nKeys.Create.ACCOUNT_NAME_PLACEHOLDER),
            errorText = if (nameTooLong) strings.t(I18nKeys.Create.NAME_TOO_LONG) else null,
            helperText = strings.t(I18nKeys.Create.ACCOUNT_NAME_HINT),
        )

        Spacer(modifier = Modifier.height(VelaSpacing.xl4))

        Column(verticalArrangement = Arrangement.spacedBy(VelaSpacing.md)) {
            VelaAckRow(
                checked = acks.getOrElse(0) { false },
                onCheckedChange = { onToggleAck(0) },
                text = AnnotatedString(strings.t(I18nKeys.Create.ACK0)),
            )

            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = VelaIcons.Check,
                    contentDescription = null,
                    tint = colors.successBase,
                    modifier = Modifier.size(VelaIconSize.base),
                )
                Spacer(modifier = Modifier.size(VelaSpacing.md))
                Text(
                    text = strings.t(I18nKeys.Create.ASSURANCE_RECOVERY),
                    color = colors.fgMuted,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.regular,
                    fontSize = VelaTextSize.base,
                    lineHeight = VelaLeading.normal * VelaTextSize.base,
                )
            }

            VelaAckRow(
                checked = acks.getOrElse(1) { false },
                onCheckedChange = { onToggleAck(1) },
                text = legalLine(
                    lead = strings.t(I18nKeys.Create.ACK1),
                    privacy = strings.t(I18nKeys.Create.ACK1_PRIVACY_POLICY),
                    conjunction = strings.t(I18nKeys.Create.ACK1_AND),
                    terms = strings.t(I18nKeys.Create.ACK1_TERMS),
                    period = strings.t(I18nKeys.Create.ACK1_PERIOD),
                    linkColor = colors.accentBase,
                ),
            )

            // The two policy documents open outside the app. They are rendered
            // as separate tappable rows rather than as inline links inside the
            // checkbox: the row IS the checkbox's touch target, and a link
            // inside it either steals the tap or is too small to hit — the
            // spec-011 lesson this component already carries.
            Row(horizontalArrangement = Arrangement.spacedBy(VelaSpacing.xl)) {
                PolicyLink(strings.t(I18nKeys.Create.ACK1_PRIVACY_POLICY), onOpenPrivacy)
                PolicyLink(strings.t(I18nKeys.Create.ACK1_TERMS), onOpenTerms)
            }
        }

        if (statusText != null) {
            Spacer(modifier = Modifier.height(VelaSpacing.xl))
            Text(
                text = statusText,
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.base,
            )
        }

        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
    }

    VelaPrimaryButton(
        text = submitLabel,
        onClick = onSubmit,
        enabled = canSubmit && !busy,
        modifier = Modifier.fillMaxWidth(),
    )

    if (showStartOver) {
        Spacer(modifier = Modifier.height(VelaSpacing.lg))
        Text(
            text = strings.t(I18nKeys.Create.START_OVER_BTN),
            color = colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.medium,
            fontSize = VelaTextSize.base,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .clickable(onClick = onStartOver)
                .padding(VelaSpacing.md),
        )
    }
    Spacer(modifier = Modifier.height(VelaSpacing.xl))
}

@Composable
private fun PolicyLink(label: String, onClick: () -> Unit) {
    Text(
        text = label,
        color = VelaTheme.colors.accentBase,
        fontFamily = VelaFontFamily,
        fontWeight = VelaFontWeight.medium,
        fontSize = VelaTextSize.base,
        textDecoration = TextDecoration.Underline,
        modifier = Modifier.clickable(onClick = onClick).padding(vertical = VelaSpacing.sm),
    )
}

/**
 * The legal line, assembled from its five corpus fragments.
 *
 * Five keys rather than one interpolated sentence because the two link phrases
 * have to be styleable, and the conjunction and the full stop are grammar that
 * differs per locale — Chinese uses a different period character, and some
 * locales put the conjunction elsewhere entirely.
 */
private fun legalLine(
    lead: String,
    privacy: String,
    conjunction: String,
    terms: String,
    period: String,
    linkColor: androidx.compose.ui.graphics.Color,
): AnnotatedString = buildAnnotatedString {
    append(lead)
    withStyle(SpanStyle(color = linkColor)) { append(privacy) }
    append(conjunction)
    withStyle(SpanStyle(color = linkColor)) { append(terms) }
    append(period)
}
