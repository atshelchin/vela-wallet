package app.getvela.wallet.feature.onboarding.flow

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize

/**
 * The v2 flow container: a full-screen stepped journey.
 *
 * This replaces spec 014's bottom sheet. The v2 design makes the flow the whole
 * screen and keeps a sheet for FAILURES only, where an interruption genuinely is
 * modal — a form the person is halfway through is not an interruption, and
 * putting it behind a scrim said it was.
 *
 * A back affordance, and nothing else. The three-segment bar and the flow's
 * name that used to sit here are gone (founder call, 2026-08-25): a meter over
 * a journey whose every screen already says what it is measured decoration
 * rather than progress, the label repeated the heading directly under it, and
 * on a phone the two together cost the form 60dp it needed with the keyboard
 * up. Every screen inside decides its own content.
 */
@Composable
fun FlowShell(
    backLabel: String,
    canGoBack: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = VelaTheme.colors

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.bgBase)
            .safeDrawingPadding()
            // Device-found 2026-08-25 (Galaxy S22): with the keyboard up, the
            // scrolling region shrinks to whatever is left and its LAST row —
            // the policy links — was clipped hard against the pinned CTA, so the
            // glyphs were cut in half. `imePadding` on top of `safeDrawingPadding`
            // is what keeps the two apart; the manifest already asks for
            // adjustResize, which is necessary and was not sufficient.
            .imePadding()
            .padding(horizontal = VelaSizing.screenPaddingX),
    ) {
        // The row keeps its height with or without the affordance, so the
        // screen below never jumps when back disappears.
        Row(
            modifier = Modifier.fillMaxWidth().height(VelaSizing.hitTarget),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (canGoBack) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(VelaRadius.md))
                        .clickable(onClick = onBack)
                        .padding(end = VelaSpacing.md)
                        .semantics { contentDescription = backLabel },
                ) {
                    Icon(
                        imageVector = VelaIcons.ArrowLeft,
                        contentDescription = null,
                        tint = colors.fgMuted,
                        modifier = Modifier.size(VelaIconSize.lg),
                    )
                    Spacer(modifier = Modifier.size(VelaSpacing.sm))
                    Text(
                        text = backLabel,
                        color = colors.fgMuted,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.semibold,
                        fontSize = VelaTextSize.base,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(VelaSpacing.xl3))
        content()
    }
}
