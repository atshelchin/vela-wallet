package app.getvela.wallet.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.times
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaOnAccent
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize

/**
 * Acknowledgment checkbox row (spec 014, A1–A3): hairline square when
 * unchecked, accent fill + white ✓ when checked; muted wrapping text that may
 * carry inline [androidx.compose.ui.text.LinkAnnotation] links (row 3). The
 * whole row toggles (Role.Checkbox); link taps are consumed by the text link
 * handler and never toggle the box (spec-011 click-target lesson).
 */
@Composable
fun VelaAckRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    text: AnnotatedString,
    modifier: Modifier = Modifier,
) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .toggleable(
                value = checked,
                role = Role.Checkbox,
                onValueChange = onCheckedChange,
            )
            // Vertical padding keeps the touch target comfortable while the
            // row itself hugs its wrapped text.
            .padding(vertical = VelaSpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        val boxShape = RoundedCornerShape(VelaRadius.sm)
        Box(
            modifier = Modifier
                .padding(top = VelaSpacing.xs)
                .size(VelaSizing.checkboxBox)
                .clip(boxShape)
                .background(if (checked) colors.accentBase else colors.bgRaised)
                .border(
                    width = VelaBorder.hairline,
                    color = if (checked) colors.accentBase else colors.borderStrong,
                    shape = boxShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) {
                Icon(
                    imageVector = VelaIcons.Check,
                    contentDescription = null,
                    tint = VelaOnAccent,
                    modifier = Modifier.size(VelaIconSize.sm),
                )
            }
        }
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
        Text(
            text = text,
            color = colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.regular,
            fontSize = VelaTextSize.base,
            lineHeight = VelaLeading.normal * VelaTextSize.base,
            modifier = Modifier.weight(1f),
        )
    }
}
