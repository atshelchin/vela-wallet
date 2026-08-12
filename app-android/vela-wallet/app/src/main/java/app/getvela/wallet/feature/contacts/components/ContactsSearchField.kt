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
import androidx.compose.ui.draw.clip
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
import app.getvela.wallet.feature.contacts.SearchFieldModel

/**
 * Contacts search field (spec vocabulary #6, mock C1): full-width sunken well,
 * leading search glyph, placeholder 搜索名字、ENS 或地址, and — once a query is
 * present (c1f) — the typed text plus a clear affordance.
 *
 * Fixture-driven: the field renders the model's query, it never filters.
 * Tapping is an action sink (no keyboard state in this feature).
 */
@Composable
fun ContactsSearchField(
    model: SearchFieldModel,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
    onClear: () -> Unit = {},
) {
    val colors = VelaTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(VelaRadius.lg))
            .background(colors.bgSunken)
            .clickable(onClick = onClick)
            .heightIn(min = VelaSizing.controlMd)
            .padding(horizontal = VelaSpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = VelaIcons.Search,
            contentDescription = null,
            tint = colors.fgSubtle,
            modifier = Modifier.size(VelaIconSize.base),
        )
        Spacer(modifier = Modifier.width(VelaSpacing.md))
        Text(
            text = if (model.filtering) model.query else model.placeholder,
            color = if (model.filtering) colors.fgBase else colors.fgSubtle,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.regular,
            fontSize = VelaTextSize.base,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (model.filtering) {
            Box(
                modifier = Modifier
                    .size(VelaIconSize.lg)
                    .clickable(onClick = onClear),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = VelaIcons.Close,
                    contentDescription = null,
                    tint = colors.fgMuted,
                    modifier = Modifier.size(VelaIconSize.base),
                )
            }
        }
    }
}
