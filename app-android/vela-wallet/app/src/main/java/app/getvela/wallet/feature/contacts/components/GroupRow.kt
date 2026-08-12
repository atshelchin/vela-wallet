package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.text.style.TextOverflow
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaIconSize
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.contacts.GroupRowModel

/**
 * Group row (spec vocabulary #2, mock C1): rounded-square sunken tile with the
 * users-round glyph, group name, trailing `N 人` and a chevron. `selected` is
 * the raised wash the desktop rail shows; on mobile it stays false.
 */
@Composable
fun GroupRow(
    model: GroupRowModel,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: () -> Unit = {},
) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (selected) Modifier.background(colors.bgRaised) else Modifier)
            .clickable(onClick = onClick)
            .heightIn(min = VelaSizing.hitTarget)
            .padding(vertical = VelaSpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(ContactsMetrics.groupTile)
                .background(colors.bgSunken, RoundedCornerShape(VelaRadius.md)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = VelaIcons.UsersRound,
                contentDescription = null,
                tint = colors.fgMuted,
                modifier = Modifier.size(VelaIconSize.md),
            )
        }
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
        Text(
            text = model.name,
            color = colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.semibold,
            fontSize = VelaTextSize.lg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = model.countLabel,
            color = colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.regular,
            fontSize = VelaTextSize.base,
            maxLines = 1,
        )
        Spacer(modifier = Modifier.width(VelaSpacing.md))
        Icon(
            imageVector = VelaIcons.ChevronRight,
            contentDescription = null,
            tint = colors.fgSubtle,
            modifier = Modifier.size(VelaIconSize.base),
        )
    }
}
