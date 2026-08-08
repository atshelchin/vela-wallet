package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.times
import app.getvela.wallet.core.designsystem.components.BadgeVariant
import app.getvela.wallet.core.designsystem.components.VelaAckRow
import app.getvela.wallet.core.designsystem.components.VelaActionStack
import app.getvela.wallet.core.designsystem.components.VelaAddressStrip
import app.getvela.wallet.core.designsystem.components.VelaElapsedRing
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.components.VelaStackAction
import app.getvela.wallet.core.designsystem.components.VelaStatusBadge
import app.getvela.wallet.core.designsystem.components.VelaStepProgress
import app.getvela.wallet.core.designsystem.components.VelaTechDetails
import app.getvela.wallet.core.designsystem.components.VelaTextField
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings

/**
 * Create-flow panel (spec 014): renders any [CreatePanelState] by composing
 * the pattern components — never re-implementing their layout inline
 * (FR-006). All interaction is local visual state or an [ActionId] emitted to
 * the host-provided sink; no business behaviour (FR-011).
 */
@Composable
fun CreatePanel(
    state: CreatePanelState,
    onAction: (ActionId) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        is CreatePanelState.Form -> FormContent(state, onAction, modifier)
        is CreatePanelState.Working -> WorkingContent(
            headlineKey = state.status.headlineKey,
            hintKey = if (state.showHint) I18nKeys.Flow.CONFIRM_IN_PROMPT else null,
            elapsedSecs = state.elapsedSecs,
            step = state.step,
            modifier = modifier,
        )
        is CreatePanelState.Outcome -> OutcomePane(state.spec, onAction, modifier)
    }
}

@Composable
private fun FormContent(
    state: CreatePanelState.Form,
    onAction: (ActionId) -> Unit,
    modifier: Modifier = Modifier,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors

    // Local visual state only (FR-011): typing and toggling re-derive the
    // over-length hint and CTA enablement; the fixture seeds the initial values.
    var name by remember(state) { mutableStateOf(state.name) }
    var acks by remember(state) { mutableStateOf(state.acks) }
    val nameTooLong = nameTooLongVisual(name)
    val canSubmit = name.trim().isNotEmpty() && !nameTooLong && acks.all { it }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = VelaSizing.screenPaddingX),
    ) {
        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
        VelaTextField(
            value = name,
            onValueChange = { name = it },
            label = strings.t(I18nKeys.Create.ACCOUNT_NAME_LABEL),
            placeholder = strings.t(I18nKeys.Create.ACCOUNT_NAME_PLACEHOLDER),
            errorText = if (nameTooLong) strings.t(I18nKeys.Create.NAME_TOO_LONG) else null,
            helperText = strings.t(I18nKeys.Create.ACCOUNT_NAME_HINT),
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
        VelaAckRow(
            checked = acks[0],
            onCheckedChange = { checked -> acks = acks.replaceAt(0, checked) },
            text = AnnotatedString(strings.t(I18nKeys.Create.ACK0)),
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl2))
        VelaAckRow(
            checked = acks[1],
            onCheckedChange = { checked -> acks = acks.replaceAt(1, checked) },
            text = AnnotatedString(strings.t(I18nKeys.Create.ACK1)),
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl2))
        VelaAckRow(
            checked = acks[2],
            onCheckedChange = { checked -> acks = acks.replaceAt(2, checked) },
            text = buildAnnotatedString {
                // Row 3 wraps two individually-tappable inline links; taps emit
                // ActionIds only — no navigation in this feature.
                val linkStyles = TextLinkStyles(style = SpanStyle(color = colors.accentBase))
                append(strings.t(I18nKeys.Create.ACK3))
                withLink(
                    LinkAnnotation.Clickable(tag = "privacyPolicy", styles = linkStyles) {
                        onAction(ActionId.OpenPrivacyPolicy)
                    },
                ) {
                    append(strings.t(I18nKeys.Create.ACK3_PRIVACY_POLICY))
                }
                append(strings.t(I18nKeys.Create.ACK3_AND))
                withLink(
                    LinkAnnotation.Clickable(tag = "terms", styles = linkStyles) {
                        onAction(ActionId.OpenTerms)
                    },
                ) {
                    append(strings.t(I18nKeys.Create.ACK3_TERMS))
                }
                append(strings.t(I18nKeys.Create.ACK3_PERIOD))
            },
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
        VelaPrimaryButton(
            text = strings.t(I18nKeys.Create.CREATE_WALLET_BTN),
            onClick = { onAction(ActionId.SubmitCreate) },
            enabled = canSubmit && !state.busy,
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
    }
}

private fun List<Boolean>.replaceAt(index: Int, value: Boolean): List<Boolean> =
    mapIndexed { i, current -> if (i == index) value else current }

/**
 * Progress pattern content — shared by the create Working states ([step]
 * non-null: 5-segment bar + "第 N/5 步" counter) and the login Waiting state
 * ([step] null: single partially-filled bar), so both flows keep one layout
 * authority.
 */
@Composable
internal fun WorkingContent(
    headlineKey: String,
    hintKey: String?,
    elapsedSecs: Int?,
    step: Int? = null,
    modifier: Modifier = Modifier,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = VelaSizing.screenPaddingX),
    ) {
        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
        if (step != null) {
            VelaStepProgress(step = step, totalSteps = TOTAL_CREATE_STEPS)
            Spacer(modifier = Modifier.height(VelaSpacing.lg))
            Text(
                text = strings.t(
                    I18nKeys.Flow.STEP_COUNTER,
                    mapOf("current" to step.toString(), "total" to TOTAL_CREATE_STEPS.toString()),
                ),
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.sm,
            )
            Spacer(modifier = Modifier.height(VelaSpacing.lg))
        } else {
            VelaStepProgress(fraction = LOGIN_WAIT_FRACTION)
            Spacer(modifier = Modifier.height(VelaSpacing.xl2))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = strings.t(headlineKey),
                    color = colors.fgBase,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.semibold,
                    fontSize = VelaTextSize.xl,
                )
                if (hintKey != null) {
                    Spacer(modifier = Modifier.height(VelaSpacing.sm))
                    Text(
                        text = strings.t(hintKey),
                        color = colors.fgMuted,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.regular,
                        fontSize = VelaTextSize.base,
                        lineHeight = VelaLeading.normal * VelaTextSize.base,
                    )
                }
            }
            if (elapsedSecs != null) {
                Spacer(modifier = Modifier.width(VelaSpacing.xl))
                VelaElapsedRing(
                    seconds = elapsedSecs,
                    contentDescription = strings.t(
                        I18nKeys.Flow.WAITED_SECONDS,
                        mapOf("seconds" to elapsedSecs.toString()),
                    ),
                )
            }
        }
        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
    }
}

/** Login single-bar fill fraction (contract §5: ~40% filled accent). */
internal const val LOGIN_WAIT_FRACTION = 0.4f

/**
 * Outcome pattern content — THE single Outcome authority for both flows
 * (US3): badge → headline → body → optional address strip + footnote →
 * optional 技术详情 disclosure → action stack. Renders the [OutcomeSpec] only;
 * never branches on [OutcomeKind].
 */
@Composable
internal fun OutcomePane(
    spec: OutcomeSpec,
    onAction: (ActionId) -> Unit,
    modifier: Modifier = Modifier,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors

    // Local visual expansion; collapsed default re-applies on every new spec
    // (spec edge case) while the E2x fixture may open pre-expanded.
    var detailsExpanded by remember(spec) { mutableStateOf(spec.detailsExpanded) }

    val headlineColor = if (spec.headlineTinted) {
        when (spec.badge) {
            BadgeVariant.Success -> colors.successBase
            BadgeVariant.Warning, BadgeVariant.Timeout -> colors.warningBase
            BadgeVariant.Error -> colors.errorBase
            BadgeVariant.Info -> colors.infoBase
            BadgeVariant.Neutral -> colors.fgBase
        }
    } else {
        colors.fgBase
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = VelaSizing.screenPaddingX),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(VelaSpacing.xl4))
            VelaStatusBadge(variant = spec.badge)
            Spacer(modifier = Modifier.height(VelaSpacing.xl3))
            Text(
                text = strings.t(spec.headlineKey),
                color = headlineColor,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.bold,
                fontSize = VelaTextSize.xl2,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(VelaSpacing.md))
            Text(
                text = strings.t(spec.bodyKey, spec.bodyVars),
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.lg,
                textAlign = TextAlign.Center,
                lineHeight = VelaLeading.normal * VelaTextSize.lg,
            )
            if (spec.address != null) {
                Spacer(modifier = Modifier.height(VelaSpacing.xl2))
                VelaAddressStrip(
                    address = spec.address,
                    copyLabel = strings.t(I18nKeys.Flow.COPY_ADDRESS),
                    copiedLabel = strings.t(I18nKeys.Flow.COPIED),
                )
            }
            if (spec.footnoteKey != null) {
                Spacer(modifier = Modifier.height(VelaSpacing.xl2))
                Text(
                    text = strings.t(spec.footnoteKey),
                    color = colors.fgSubtle,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.regular,
                    fontSize = VelaTextSize.base,
                    textAlign = TextAlign.Center,
                    lineHeight = VelaLeading.normal * VelaTextSize.base,
                )
            }
        }
        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
        if (spec.details != null) {
            VelaTechDetails(
                label = strings.t(I18nKeys.Create.TECHNICAL_DETAILS),
                code = spec.details.code,
                context = spec.details.context,
                endpoint = spec.details.endpoint,
                expanded = detailsExpanded,
                onToggle = {
                    detailsExpanded = !detailsExpanded
                    onAction(ActionId.ToggleDetails)
                },
            )
            Spacer(modifier = Modifier.height(VelaSpacing.xl2))
        }
        VelaActionStack(
            actions = spec.actions.map { action ->
                VelaStackAction(
                    label = strings.t(action.labelKey),
                    primary = action.role == ActionRole.Primary,
                    onClick = { onAction(action.id) },
                )
            },
        )
        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
    }
}
