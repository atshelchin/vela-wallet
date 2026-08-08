package app.getvela.wallet.core.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaMotion
import app.getvela.wallet.core.designsystem.tokens.VelaOnAccent
import app.getvela.wallet.core.designsystem.tokens.VelaOpacity
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize

/**
 * Vela CTA buttons: pill shape (DV-002), 52dp control height, spring press-scale
 * (design-system interactive-feedback rule) on top of the Material ripple.
 * Disabled (spec 014, mock A1) = the whole surface + label at
 * [VelaOpacity.disabled] — dimmed accent, never a gray fill.
 */
@Composable
fun VelaPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    VelaButtonSurface(onClick = onClick, modifier = modifier, enabled = enabled) { pressModifier ->
        Box(
            modifier = pressModifier.background(VelaTheme.colors.accentBase),
            contentAlignment = Alignment.Center,
        ) {
            ButtonLabel(text = text, color = VelaOnAccent)
        }
    }
}

@Composable
fun VelaSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    VelaButtonSurface(onClick = onClick, modifier = modifier, enabled = enabled) { pressModifier ->
        Box(
            modifier = pressModifier.border(
                width = VelaBorder.hairline,
                color = VelaTheme.colors.borderStrong,
                shape = RoundedCornerShape(VelaRadius.full),
            ),
            contentAlignment = Alignment.Center,
        ) {
            // Label uses fg.base, not the mock's low-contrast gray (spec DV-001).
            ButtonLabel(text = text, color = VelaTheme.colors.fgBase)
        }
    }
}

/** Shared press-feedback surface; internal so VelaActionStack rows reuse it. */
@Composable
internal fun VelaButtonSurface(
    onClick: () -> Unit,
    modifier: Modifier,
    enabled: Boolean = true,
    content: @Composable (Modifier) -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) VelaMotion.pressScaleButton else 1f,
        animationSpec = VelaMotion.pressSpring,
        label = "buttonPressScale",
    )
    content(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else VelaOpacity.disabled
            }
            .heightIn(min = VelaSizing.controlLg)
            .clip(RoundedCornerShape(VelaRadius.full))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
    )
}

@Composable
internal fun ButtonLabel(text: String, color: androidx.compose.ui.graphics.Color) {
    Text(
        text = text,
        color = color,
        fontFamily = VelaFontFamily,
        fontWeight = VelaFontWeight.semibold,
        fontSize = VelaTextSize.lg,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = VelaSpacing.xl),
    )
}
