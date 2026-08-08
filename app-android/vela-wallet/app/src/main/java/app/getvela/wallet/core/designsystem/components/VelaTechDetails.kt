package app.getvela.wallet.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.times
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize

/**
 * 技术详情 disclosure (spec 014, E2/E2x anatomy): hairline + header row with
 * chevron; expanded shows a code block on bg.sunken — error-colored code line,
 * muted context line, subtle endpoint line. Collapsed is the caller's default
 * on every state entry. Content strings are runtime diagnostics, not copy.
 */
@Composable
fun VelaTechDetails(
    label: String,
    code: String,
    context: String,
    endpoint: String?,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = VelaTheme.colors
    Column(modifier = modifier.fillMaxWidth()) {
        HorizontalDivider(color = colors.borderBase, thickness = VelaBorder.hairline)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = VelaSizing.hitTarget)
                .semantics {
                    // Expose the disclosure state via the matching action (FR-017).
                    if (expanded) collapse { onToggle(); true } else expand { onToggle(); true }
                }
                .clickable(role = Role.Button, onClick = onToggle),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.base,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = VelaIcons.ChevronDown,
                contentDescription = null,
                tint = colors.fgMuted,
                modifier = Modifier
                    .rotate(if (expanded) 180f else 0f)
                    .size(VelaIconSize.md),
            )
        }
        if (expanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(VelaRadius.lg))
                    .background(colors.bgSunken)
                    .padding(VelaSpacing.xl),
            ) {
                Text(
                    text = code,
                    color = colors.errorBase,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.semibold,
                    fontSize = VelaTextSize.base,
                )
                Spacer(modifier = Modifier.height(VelaSpacing.md))
                Text(
                    text = context,
                    color = colors.fgMuted,
                    fontFamily = VelaFontFamily,
                    fontWeight = VelaFontWeight.regular,
                    fontSize = VelaTextSize.base,
                    lineHeight = VelaLeading.normal * VelaTextSize.base,
                )
                if (endpoint != null) {
                    Spacer(modifier = Modifier.height(VelaSpacing.md))
                    Text(
                        // font.mono is not bundled on Android (DV-004); the sunken
                        // code block + subtle tone carry the "code" reading instead.
                        text = endpoint,
                        color = colors.fgSubtle,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.regular,
                        fontSize = VelaTextSize.base,
                    )
                }
            }
            Spacer(modifier = Modifier.height(VelaSpacing.md))
        }
    }
}
