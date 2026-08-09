package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import app.getvela.wallet.core.designsystem.components.VelaIcons
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.components.VelaSecondaryButton
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.contacts.ContactsEmptyModel
import app.getvela.wallet.feature.wallet.EmptyStateModel
import app.getvela.wallet.feature.wallet.components.EmptyState

/**
 * Contacts empty state (spec vocabulary #14, mocks C3/DC3): the spec-015
 * [EmptyState] artwork — consumed, never re-drawn (SC-006) — with the users
 * glyph, plus the stacked CTA pair in its new content slot.
 *
 * Used for the search-empty treatment too (no CTAs; caption carries
 * `contacts.noResults`).
 */
@Composable
fun EmptyStateCta(
    model: ContactsEmptyModel,
    modifier: Modifier = Modifier,
    icon: ImageVector = VelaIcons.UsersRound,
    onPrimary: () -> Unit = {},
    onSecondary: () -> Unit = {},
) {
    EmptyState(
        icon = icon,
        model = EmptyStateModel(title = model.title, caption = model.caption),
        modifier = modifier,
        content = if (model.primaryCta == null && model.secondaryCta == null) {
            null
        } else {
            {
                model.primaryCta?.let { label ->
                    VelaPrimaryButton(text = label, onClick = onPrimary)
                }
                if (model.primaryCta != null && model.secondaryCta != null) {
                    Spacer(modifier = Modifier.height(VelaSpacing.lg))
                }
                model.secondaryCta?.let { label ->
                    VelaSecondaryButton(text = label, onClick = onSecondary)
                }
            }
        },
    )
}

/**
 * Centred destructive text action (spec vocabulary #15, mock C2's 删除联系人).
 * Raising the confirmation is the caller's job — this is presentation only.
 */
@Composable
fun DestructiveTextButton(
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = VelaSizing.hitTarget),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = VelaTheme.colors.errorBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.semibold,
            fontSize = VelaTextSize.lg,
            textAlign = TextAlign.Center,
        )
    }
}
