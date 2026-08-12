//
//  ContactsGalleryScreen.swift
//  VelaWallet
//
//  Contacts preview gallery (spec 018 FR-004, research D1): every C-state
//  plus the component boards reachable in ≤ 2 interactions from the chip
//  strip. Fully offline — fixtures only. Reached via
//  VELA_PAGE=contacts-gallery (+ VELA_STATE preselect); never linked from
//  production navigation. Mirrors Features/Wallet/GalleryScreen.swift: chip
//  strip, theme toggle, and the 1.35× text-scale chip.
//

import SwiftUI

private enum ContactsGalleryEntry: Hashable, Identifiable {
    case state(ContactsStateId)
    case components
    case identicons

    var id: String {
        switch self {
        case .state(let state): state.rawValue
        case .components: "components"
        case .identicons: "identicons"
        }
    }

    /// Chip labels are mock/state codes — data, not translatable copy.
    var label: String {
        switch self {
        case .state(let state): state.label
        case .components: "Cmp"
        case .identicons: "ID"
        }
    }

    static let all: [ContactsGalleryEntry] =
        ContactsStateId.allCases.map { .state($0) } + [.components, .identicons]

    static let launchEntry: ContactsGalleryEntry = {
        guard let raw = ProcessInfo.processInfo.environment["VELA_STATE"] else { return .state(.c1) }
        return all.first { $0.id == raw } ?? .state(.c1)
    }()
}

struct ContactsGalleryScreen: View {
    @Environment(\.theme) private var inheritedTheme

    let loc: Loc
    @State private var schemeOverride: ColorScheme?
    @State private var entry: ContactsGalleryEntry = ContactsGalleryEntry.launchEntry
    @State private var largeText = false

    private var scheme: ColorScheme { schemeOverride ?? inheritedTheme.scheme }
    private var theme: Theme { Theme(scheme: scheme) }
    private var textScale: CGFloat { largeText ? ContactsGalleryScreen.largeScale : 1 }

    /// FR-011 gallery text scale (mock H7x precedent).
    private static let largeScale: CGFloat = 1.35

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            controls
            Rectangle()
                .fill(theme.borderBase)
                .frame(height: Tokens.BorderWidth.hairline)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .environment(\.walletTextScale, textScale)
        }
        .background(theme.bgSunken.ignoresSafeArea())
        .themed(scheme)
        .preferredColorScheme(scheme)
    }

    // MARK: - Chrome

    private var controls: some View {
        HStack(spacing: Tokens.Space.s8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Tokens.Space.s8) {
                    ForEach(ContactsGalleryEntry.all) { candidate in
                        chip(candidate)
                    }
                }
                .padding(.horizontal, Tokens.Space.s16)
            }
            Button {
                largeText.toggle()
            } label: {
                Text(verbatim: "Aa")
                    .typeRole(Typography.label)
                    .foregroundStyle(largeText ? theme.accentBase : theme.fgMuted)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
            }
            Button {
                schemeOverride = scheme == .dark ? .light : .dark
            } label: {
                Image(systemName: "circle.lefthalf.filled")
                    .font(WalletIconFont.galleryControl)
                    .foregroundStyle(theme.fgMuted)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
            }
            .padding(.trailing, Tokens.Space.s8)
        }
        .padding(.vertical, Tokens.Space.s8)
    }

    private func chip(_ candidate: ContactsGalleryEntry) -> some View {
        let selected = candidate == entry
        return Button {
            entry = candidate
        } label: {
            Text(verbatim: candidate.label)
                .typeRole(Typography.label)
                .foregroundStyle(selected ? theme.accentBase : theme.fgMuted)
                .padding(.horizontal, Tokens.Space.s12)
                .frame(minHeight: Tokens.Control.sm)
                .background(Capsule().fill(selected ? theme.accentSoft : theme.bgRaised))
        }
    }

    // MARK: - Content

    @ViewBuilder private var content: some View {
        switch entry {
        case .state(let state):
            // .id resets @State (the auto-presented sheets) per selection.
            ContactsStateHost(state: state, loc: loc)
                .id("\(state.rawValue)-\(largeText)")
        case .components:
            ContactsComponentBoard(loc: loc)
        case .identicons:
            identiconBoard
        }
    }

    /// SC-003 parity board: the 8+1 canon seeds plus the empty placeholder.
    private var identiconBoard: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: Tokens.Layout.hitTarget * 2))], spacing: Tokens.Space.s24) {
                ForEach(Array(ContactsFixtures.identiconBoardSeeds.enumerated()), id: \.offset) { _, seed in
                    VStack(spacing: Tokens.Space.s8) {
                        IdenticonAvatar(seed: seed, size: WalletGeometry.identiconTile)
                        Text(verbatim: seed.isEmpty ? "∅" : seed)
                            .monoRole(Typography.monoAddress)
                            .foregroundStyle(theme.fgMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            }
            .padding(Tokens.Space.s24)
        }
    }
}

/// Renders whichever of the three screens a C-state resolves to.
struct ContactsStateHost: View {
    let state: ContactsStateId
    let loc: Loc

    var body: some View {
        switch ContactsFixtures.buildMobileState(state, loc: loc) {
        case .home(let model): ContactsScreen(model: model)
        case .detail(let model): ContactDetailScreen(model: model)
        case .group(let model): GroupDetailScreen(model: model)
        }
    }
}

/// Component board (data-model.md §Component boards): every new component
/// and its variants on one scrollable surface.
struct ContactsComponentBoard: View {
    @Environment(\.theme) private var theme

    let loc: Loc

    private var contacts: [ContactModel] {
        ContactsFixtures.buildMobileState(.c1, loc: loc).home?.sections.flatMap(\.contacts) ?? []
    }

    private var groups: [GroupRowModel] {
        ContactsFixtures.buildMobileState(.c1, loc: loc).home?.groups ?? []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s24) {
                board("ContactRow") {
                    ContactRow(contact: contacts[0])
                    ContactRow(contact: contacts[0], selected: true)
                    ContactRow(contact: contacts[2])
                    ContactRow(contact: contacts[7], size: .member)
                    ContactRow(
                        contact: contacts[1],
                        swipe: SwipeRevealModel(
                            contactId: contacts[1].id,
                            sendLabel: loc.t("componentsUi.dock.send"),
                            deleteLabel: loc.t("contacts.delete")
                        ),
                        forceRevealed: true
                    )
                }
                board("GroupRow") {
                    ForEach(groups) { group in
                        GroupRow(model: group)
                    }
                    GroupRow(model: groups[0], selected: true)
                }
                board("SearchField") {
                    ContactsSearchField(model: ContactsSearchModel(
                        placeholder: loc.t("contacts.searchPlaceholder"), query: nil,
                        clearLabel: loc.t("contacts.cancel")
                    ))
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    ContactsSearchField(model: ContactsSearchModel(
                        placeholder: loc.t("contacts.searchPlaceholder"),
                        query: ContactsFixtures.searchQuery,
                        clearLabel: loc.t("contacts.cancel")
                    ))
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                }
                board("AlphaIndexRail") {
                    HStack(alignment: .top, spacing: Tokens.Space.s24) {
                        VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                            ContactLetterHeader(letter: "A")
                            ContactLetterHeader(letter: "M")
                        }
                        AlphaIndexRail(
                            letters: ContactsFixtures.indexLetters,
                            populated: Set(ContactsFixtures.sectionLetters)
                        )
                        AlphaIndexRail(
                            letters: ContactsFixtures.indexLetters,
                            populated: Set(ContactsFixtures.sectionLetters),
                            pinnedBubble: "H"
                        )
                        .padding(.trailing, ContactsGeometry.bubbleSize)
                    }
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                }
                board("GroupChips") {
                    GroupChips(chips: [ContactsFixtures.familyGroupName], addLabel: loc.t("contacts.sectionGroups"))
                        .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    GroupChips(
                        chips: [ContactsFixtures.familyGroupName, ContactsFixtures.workGroupName, ContactsFixtures.exchangeGroupName],
                        addLabel: loc.t("contacts.sectionGroups")
                    )
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                }
                board("AddressBlock") {
                    AddressBlock(
                        label: loc.t("contacts.addressLabel"),
                        lines: ContactsFixtures.aliceAddressLines,
                        copyLabel: loc.t("componentsUi.identiconViewer.copyAddress"),
                        copiedLabel: loc.t("componentsUi.identiconViewer.copied")
                    )
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    AddressBlock(
                        label: loc.t("contacts.addressLabel"),
                        lines: [ContactsFixtures.roster[0].addressFull],
                        copyLabel: loc.t("componentsUi.identiconViewer.copyAddress"),
                        copiedLabel: loc.t("componentsUi.identiconViewer.copied")
                    )
                    .padding(.horizontal, Tokens.Layout.screenPaddingX)
                }
                board("GhostAddRow / PinnedCTABar") {
                    GhostAddRow(label: loc.t("contacts.addMember"))
                    PinnedCTABar(
                        title: loc.t("contacts.batchSend"),
                        caption: loc.t("contacts.batchSendHint", vars: ["count": "3"])
                    )
                    PinnedCTABar(
                        title: loc.t("contacts.batchSend"),
                        caption: loc.t("contacts.batchSendHint", vars: ["count": "0"]),
                        enabled: false
                    )
                }
                board("ActionMenuSheet") {
                    menuCard(ContactsFixtures.addMenu(loc: loc))
                    menuCard(ContactsFixtures.groupMenu(loc: loc))
                    menuCard(ContactsFixtures.deleteConfirm(loc: loc, name: ContactsFixtures.roster[0].name))
                }
                board("EmptyStateCTA") {
                    if let empty = ContactsFixtures.buildMobileState(.c3, loc: loc).home?.empty {
                        EmptyStateCTA(model: empty)
                    }
                    EmptyStateCTA(model: ContactsFixtures.searchEmpty(loc: loc, query: "zzz"))
                }
                board("RecentActivity") {
                    if let detail = ContactsFixtures.buildMobileState(.c2, loc: loc).detail {
                        VStack(alignment: .leading, spacing: Tokens.Space.s0) {
                            WalletSectionHeader(title: detail.activityTitle, action: detail.activityAction)
                            ForEach(detail.activity) { row in
                                ActivityRowView(model: row)
                            }
                            WalletEmptyState(icon: .inbox, model: ContactsFixtures.activityEmpty(loc: loc))
                        }
                        .padding(.horizontal, Tokens.Layout.screenPaddingX)
                    }
                }
            }
            .padding(.vertical, Tokens.Space.s24)
        }
    }

    /// The sheet body rendered inline (no presentation) so all three
    /// variants sit side by side on the board.
    private func menuCard(_ model: ActionMenuModel) -> some View {
        ActionMenuSheet(model: model)
            .fixedSize(horizontal: false, vertical: true)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.r20).fill(theme.bgRaised))
            .padding(.horizontal, Tokens.Space.s12)
    }

    @ViewBuilder
    private func board(_ name: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s8) {
            // Gallery chrome — component names stay untranslated by design.
            Text(verbatim: name)
                .typeRole(Typography.caption)
                .foregroundStyle(theme.fgSubtle)
                .padding(.horizontal, Tokens.Layout.screenPaddingX)
            content()
        }
    }
}

#Preview("Contacts gallery") {
    ContactsGalleryScreen(loc: Loc(overrideTag: "zh"))
        .themed(.dark)
        .environment(\.identiconProvider, .previewSafe)
        .environment(\.lucideIconProvider, .previewSafe)
}
