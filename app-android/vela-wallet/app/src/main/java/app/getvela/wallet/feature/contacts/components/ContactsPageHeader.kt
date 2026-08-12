package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize

/**
 * Contacts page header (spec vocabulary #18). Two mobile shapes:
 * [ContactsTitleHeader] — large 通讯录 title with the trailing person-add
 * button (C1/C3) — and [ContactsNavHeader] — back chevron with a trailing
 * pencil (C2) or ⋯ (C4).
 */
@Composable
fun ContactsTitleHeader(
    title: String,
    addContentDescription: String,
    modifier: Modifier = Modifier,
    onAdd: () -> Unit = {},
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            color = VelaTheme.colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.bold,
            fontSize = VelaTextSize.xl4,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        ContactsIconButton(
            icon = VelaIcons.UserRoundPlus,
            contentDescription = addContentDescription,
            onClick = onAdd,
        )
    }
}

@Composable
fun ContactsNavHeader(
    backContentDescription: String,
    trailingIcon: ImageVector,
    trailingContentDescription: String,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
    onTrailing: () -> Unit = {},
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ContactsIconButton(
            icon = VelaIcons.ChevronLeft,
            contentDescription = backContentDescription,
            onClick = onBack,
        )
        Spacer(modifier = Modifier.weight(1f))
        ContactsIconButton(
            icon = trailingIcon,
            contentDescription = trailingContentDescription,
            onClick = onTrailing,
        )
    }
}
