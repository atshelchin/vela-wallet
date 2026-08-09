package app.getvela.wallet.feature.contacts.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaLetterSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.feature.contacts.ContactModel
import app.getvela.wallet.feature.contacts.ContactSectionModel

/** Uppercase letter header above a contacts section (mock C1). */
@Composable
fun AlphaSectionHeader(letter: String, modifier: Modifier = Modifier) {
    Text(
        text = letter,
        color = VelaTheme.colors.fgSubtle,
        fontFamily = VelaFontFamily,
        fontWeight = VelaFontWeight.semibold,
        fontSize = VelaTextSize.sm,
        letterSpacing = VelaLetterSpacing.sectionLabel,
        modifier = modifier.padding(top = VelaSpacing.lg, bottom = VelaSpacing.sm),
    )
}

/**
 * Alphabetically sectioned contact list (spec vocabulary #4). Sections arrive
 * pre-grouped from the fixtures — this component never sorts or collates.
 *
 * [flatIndexOf] hands each row its position in the flattened list so the
 * screen can pin exactly one swipe-revealed row (c1s).
 */
@Composable
fun AlphaSectionList(
    sections: List<ContactSectionModel>,
    modifier: Modifier = Modifier,
    revealedIndex: Int? = null,
    swipeSendLabel: String? = null,
    swipeDeleteLabel: String? = null,
    onContact: (ContactModel) -> Unit = {},
    onSwipeSend: (ContactModel) -> Unit = {},
    onSwipeDelete: (ContactModel) -> Unit = {},
) {
    var flatIndex = 0
    Column(modifier = modifier.fillMaxWidth()) {
        sections.forEach { section ->
            AlphaSectionHeader(letter = section.letter)
            Hairline()
            section.contacts.forEach { contact ->
                val index = flatIndex++
                ContactRow(
                    contact = contact,
                    revealed = revealedIndex == index,
                    swipeSendLabel = swipeSendLabel,
                    swipeDeleteLabel = swipeDeleteLabel,
                    onClick = { onContact(contact) },
                    onSwipeSend = { onSwipeSend(contact) },
                    onSwipeDelete = { onSwipeDelete(contact) },
                )
                Hairline()
            }
            Spacer(modifier = Modifier.height(VelaSpacing.md))
        }
    }
}
