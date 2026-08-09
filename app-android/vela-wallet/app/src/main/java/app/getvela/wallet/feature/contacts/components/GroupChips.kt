package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.contacts.GroupChipsModel

/**
 * Group-membership pills on contact detail (spec vocabulary #10, mock C2): one
 * outlined chip per group plus a trailing `+ 分组` add chip. Wraps when a
 * contact belongs to several groups (spec edge case).
 */
@Composable
fun GroupChips(
    model: GroupChipsModel,
    modifier: Modifier = Modifier,
    onGroup: (String) -> Unit = {},
    onAdd: () -> Unit = {},
) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(VelaSpacing.md, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(VelaSpacing.md),
    ) {
        model.groups.forEach { name ->
            Chip(label = name, leadingPlus = false, onClick = { onGroup(name) })
        }
        Chip(label = model.addLabel, leadingPlus = true, onClick = onAdd)
    }
}

@Composable
private fun Chip(label: String, leadingPlus: Boolean, onClick: () -> Unit) {
    val colors = VelaTheme.colors
    Row(
        modifier = Modifier
            .border(
                width = VelaBorder.hairline,
                color = colors.borderStrong,
                shape = RoundedCornerShape(VelaRadius.full),
            )
            .clickable(onClick = onClick)
            .heightIn(min = ContactsMetrics.chipHeight)
            .padding(horizontal = VelaSpacing.lg, vertical = VelaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingPlus) {
            Icon(
                imageVector = VelaIcons.Plus,
                contentDescription = null,
                tint = colors.fgMuted,
                modifier = Modifier.size(VelaIconSize.xs),
            )
            Spacer(modifier = Modifier.width(VelaSpacing.sm))
        }
        Text(
            text = label,
            color = if (leadingPlus) colors.fgMuted else colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.medium,
            fontSize = VelaTextSize.base,
            maxLines = 1,
        )
    }
}
