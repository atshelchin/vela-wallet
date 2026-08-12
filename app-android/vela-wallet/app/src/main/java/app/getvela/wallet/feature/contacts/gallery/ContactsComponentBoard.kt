package app.getvela.wallet.feature.contacts.gallery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaLetterSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.core.identicon.IdenticonImage
import app.getvela.wallet.feature.contacts.ActionMenuModel
import app.getvela.wallet.feature.contacts.ContactsFixtures
import app.getvela.wallet.feature.contacts.ContactsIcon
import app.getvela.wallet.feature.contacts.ContactsScreenState
import app.getvela.wallet.feature.contacts.MenuItemModel
import app.getvela.wallet.feature.contacts.components.ActionMenuRows
import app.getvela.wallet.feature.contacts.components.AddressBlock
import app.getvela.wallet.feature.contacts.components.AlphaIndexRail
import app.getvela.wallet.feature.contacts.components.ContactRow
import app.getvela.wallet.feature.contacts.components.ContactsMetrics
import app.getvela.wallet.feature.contacts.components.ContactsSearchField
import app.getvela.wallet.feature.contacts.components.EmptyStateCta
import app.getvela.wallet.feature.contacts.components.GhostAddRow
import app.getvela.wallet.feature.contacts.components.GroupChips
import app.getvela.wallet.feature.contacts.components.GroupRow
import app.getvela.wallet.feature.contacts.components.Hairline
import app.getvela.wallet.feature.contacts.components.PinnedCtaBar
import app.getvela.wallet.feature.wallet.components.ActivityRow
import app.getvela.wallet.feature.wallet.components.SectionHeader

/**
 * Contacts component board (FR-004a): every new vocabulary item with its
 * variants, driven by the same fixture builders as the screens. Board captions
 * are component names — technical identifiers, deliberately untranslated.
 */
@Composable
internal fun ContactsComponentBoard() {
    val strings = LocalVelaStrings.current
    val c1 = remember(strings) {
        ContactsFixtures.buildMobileState(ContactsScreenState.C1, strings)
    }
    val c1f = remember(strings) {
        ContactsFixtures.buildMobileState(ContactsScreenState.C1F, strings)
    }
    val detail = remember(strings) { ContactsFixtures.contactDetail(strings) }
    val group = remember(strings) { ContactsFixtures.groupDetail(strings) }
    val emptyGroup = remember(strings) { ContactsFixtures.emptyGroupDetail(strings) }
    val addMenu = remember(strings) { ContactsFixtures.addMenu(strings) }
    val groupMenu = remember(strings) { ContactsFixtures.groupMenu(strings) }
    val deleteConfirm = remember(strings) { ContactsFixtures.deleteConfirm(strings) }
    val contacts = c1.sections.flatMap { it.contacts }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = VelaSizing.screenPaddingX, vertical = VelaSpacing.xl),
    ) {
        BoardLabel("ContactRow · default / selected / member / long-name truncation")
        ContactRow(contact = contacts[0])
        Hairline()
        ContactRow(contact = contacts[1], selected = true)
        Hairline()
        ContactRow(contact = contacts[7], avatarSize = ContactsMetrics.memberAvatar)
        Hairline()
        ContactRow(contact = contacts[2])

        BoardLabel("ContactRow · swipe-revealed (转账 / 删除)")
        ContactRow(
            contact = contacts[1],
            revealed = true,
            swipeSendLabel = c1.swipeSendLabel,
            swipeDeleteLabel = c1.swipeDeleteLabel,
        )

        BoardLabel("GroupRow · default / selected")
        GroupRow(model = c1.groups[0])
        Hairline()
        GroupRow(model = c1.groups[1], selected = true)

        BoardLabel("SearchField · idle / filtering")
        ContactsSearchField(model = c1.search)
        Spacer(modifier = Modifier.height(VelaSpacing.lg))
        ContactsSearchField(model = c1f.search)

        BoardLabel("AlphaIndexRail · idle / bubble-HUD")
        Row(modifier = Modifier.height(VelaSizing.emptyStateCircle * 3)) {
            AlphaIndexRail(letters = c1.indexLetters)
            Spacer(modifier = Modifier.width(VelaSizing.emptyStateCircle * 2))
            AlphaIndexRail(letters = c1.indexLetters, pinnedBubble = c1.indexLetters.first())
        }

        BoardLabel("ActionMenuSheet · add (C5)")
        ActionMenuRows(model = addMenu)

        BoardLabel("ActionMenuSheet · group (C6, divider + destructive)")
        ActionMenuRows(model = groupMenu)

        BoardLabel("ActionMenuSheet · delete-confirm (C2s)")
        Text(
            text = deleteConfirm.title,
            color = VelaTheme.colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.bold,
            fontSize = VelaTextSize.xl2,
        )
        Spacer(modifier = Modifier.height(VelaSpacing.md))
        Text(
            text = deleteConfirm.body,
            color = VelaTheme.colors.fgMuted,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.regular,
            fontSize = VelaTextSize.base,
        )
        Spacer(modifier = Modifier.height(VelaSpacing.md))
        ActionMenuRows(
            model = ActionMenuModel(
                items = listOf(
                    MenuItemModel(
                        id = "contacts.delete",
                        icon = ContactsIcon.Delete,
                        label = deleteConfirm.confirm,
                        destructive = true,
                    ),
                ),
                cancel = deleteConfirm.cancel,
            ),
        )

        BoardLabel("GroupChips")
        GroupChips(model = detail.chips)

        BoardLabel("AddressBlock · mobile two-line")
        AddressBlock(model = detail.address)

        BoardLabel("RecentActivity · SectionHeader + ActivityRow (015 reuse)")
        SectionHeader(title = detail.activity.title, action = detail.activity.action)
        detail.activity.rows.forEach { ActivityRow(model = it) }

        BoardLabel("EmptyStateCTA · empty / search-empty")
        EmptyStateCta(model = ContactsFixtures.emptyState(strings))
        EmptyStateCta(model = ContactsFixtures.searchEmptyState(strings))

        BoardLabel("GhostAddRow")
        GhostAddRow(label = group.addMemberLabel)

        BoardLabel("PinnedCTABar · members / empty group")
        PinnedCtaBar(label = group.batchSendLabel, caption = group.batchSendHint)
        Spacer(modifier = Modifier.height(VelaSpacing.xl))
        PinnedCtaBar(
            label = emptyGroup.batchSendLabel,
            caption = emptyGroup.batchSendHint,
            enabled = false,
        )

        BoardLabel("Identicon · 9 canon seeds + placeholder")
        Column(verticalArrangement = Arrangement.spacedBy(VelaSpacing.lg)) {
            ContactsFixtures.IDENTICON_BOARD_SEEDS.forEach { seed ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IdenticonImage(seed = seed, size = ContactsMetrics.memberAvatar)
                    Spacer(modifier = Modifier.width(VelaSpacing.lg))
                    Text(
                        // Seeds are fixture data; "" renders the shared placeholder.
                        text = seed.ifEmpty { "«empty» → placeholder" },
                        color = VelaTheme.colors.fgMuted,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.regular,
                        fontSize = VelaTextSize.sm,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
    }
}

@Composable
private fun BoardLabel(text: String) {
    Box {
        Column {
            Spacer(modifier = Modifier.height(VelaSpacing.xl3))
            Text(
                text = text,
                color = VelaTheme.colors.fgSubtle,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.semibold,
                fontSize = VelaTextSize.sm,
                letterSpacing = VelaLetterSpacing.sectionLabel,
            )
            Spacer(modifier = Modifier.height(VelaSpacing.md))
        }
    }
}
