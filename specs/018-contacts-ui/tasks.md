# Tasks: Contacts UI Components & Preview Galleries

**Input**: Design documents from `/specs/018-contacts-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/{icons.json, i18n-keys.md}, quickstart.md

Format: `[ID] [P?] [Story] Description` — [P] = parallelizable across
files; stories: **US1** mobile states + gallery, **US2** desktop
two-column + third panel + menus, **US3** motion/input behaviours,
**US4** i18n/tokens discipline. Platform order per plan.md: core i18n →
web (canon proving ground) → desktop → android → iOS → polish.

## Phase 1: Setup

- [ ] T001 Commit `design/contacts/` mocks to git on branch
      `018-contacts-ui` (currently untracked)

## Phase 2: Foundational (blocking all platforms)

- [ ] T002 [US4] Apply contracts/i18n-keys.md: +21 keys and 2 value
      updates in `rust/crates/vela-core/i18n/locales/<lng>/contacts.json`
      for all 15 locales (ru kept terse — byte budget in research.md D3)
- [ ] T003 [US4] `npm run gen:i18n` (bump PATHS/leaf pins with ledger
      comment in `scripts/gen-i18n.mjs`) → `npm run lint:i18n` →
      `npm run verify:i18n` → `cargo test -p vela-core --features
      i18n-all` green; commit corpus + regenerated artifacts together

## Phase 3: US1 (+US3/US4) on Web — canon proving ground

- [ ] T010 [P] [US1] Icon corpus: add the 11 contracts/icons.json glyphs
      to `app-web/vela-wallet/src/lib/wallet/icons.ts`
- [ ] T011 [US1] `src/lib/contacts/model.ts` (display models,
      `ContactsStateId` unions, MOBILE_STATES/DESKTOP_STATES arrays) and
      `src/lib/contacts/fixtures.ts` (data-model.md port; builders take
      `(state, messages, identicon)`)
- [ ] T012 [US4] `resolveContactsMessages(locale)` in
      `src/lib/i18n/engine.server.ts` + `src/lib/contacts/messages.ts`
      (ContactsMessages + CONTACTS_KEYS, reusing wallet keys per
      contracts/i18n-keys.md map)
- [ ] T013 [P] [US1] New components in `src/lib/contacts/ui/`:
      ContactRow, GroupRow, GroupRail, AlphaSectionList, AlphaIndexRail,
      SearchHeader, ActionMenuSheet, DropdownMenu, ContextMenu,
      GroupChips, AddressBlock, GhostAddRow, PinnedCTABar,
      EmptyStateCTA, ContactDetailPanel (reuse wallet/ui Identicon,
      ActivityRow, SectionHeader, EmptyState, TabBar, Sidebar,
      ThirdPanel, BottomSheet — no copies)
- [ ] T014 [US1] `src/lib/contacts/ContactsHome.svelte` assembling
      c1/c1s/c1f/c2/c2s/c3/c4/c5/c6 from fixtures (tab bar 通讯录
      selected)
- [ ] T015 [US2] `src/lib/contacts/ContactsDesktop.svelte` assembling
      dc1–dc6 (+ dc2n via <1120 media query and pinned narrow stage);
      third column reuses ThirdPanel mechanics (Esc/✕, 240/200ms, 150ms
      content crossfade)
- [ ] T016 [US1] Gallery wiring: `[state]` route entries for all c*/dc*
      ids + contacts component boards with stable `gallery-contacts-*`
      ids on `/[locale]/gallery`
- [ ] T017 [US3] Web behaviours: index-rail pointer jump + bubble HUD
      (120/80ms), menu overlay anchoring (header ⋯ / contextmenu event),
      reduced-motion crossfade degrade, search filtering state
- [ ] T018 [US4] Extend the literal-audit scan set in
      `src/lib/tokens/tokens.test.ts` to include `src/lib/contacts/**`
- [ ] T019 [US1] Fixture tests `src/lib/contacts/fixtures.test.ts`
      (CONTACTS_KEYS resolve non-empty ×15 locales; zh verbatim pins;
      state-id inventory; canon addresses byte-exact) + gates:
      `pnpm check && pnpm lint && pnpm test:unit && pnpm build &&
      pnpm test:e2e`; visual pass vs C*/DC* mocks

## Phase 4: US2 (+US3) on Desktop

- [ ] T020 [P] [US2] `src/icons.rs`: add the 11 glyph bodies;
      `src/theme.rs`: contacts consts (rail width 216, menu 220×44,
      motion constants) + any new contrast pairs into
      `contrast_floor_holds_in_both_themes`
- [ ] T021 [US2] `src/contacts/` module: `mod.rs` (ContactsStrings
      resolve + no-echo test), `fixtures.rs` (canon port + zh verbatim
      pins + EXPECTED state codes), `components.rs` (contact_row,
      group_rail, alpha_section_list, menu_card, group_chips,
      address_block, ghost_add_row, empty_state_cta, detail panel body)
- [ ] T022 [US2] `src/wallet/page.rs`: `Section { Wallet, Contacts }`
      switch (sidebar nav derives selected), `PanelId::ContactDetail`,
      contacts content pane (rail + sectioned list), header ⋯ dropdown +
      group-row right-click context menu via `deferred(anchored(...))` +
      `on_mouse_down_out`/Esc dismiss
- [ ] T023 [US2] Gallery: `GalleryTab` += DC1…DC6 + ContactsComponents
      board; `VELA_PAGE=contacts` arm in `main.rs`; gates: `cargo check
      && cargo clippy --all-targets && cargo test`

## Phase 5: US1 (+US3) on Android

- [ ] T030 [P] [US1] `VelaIcons.kt`: add the 11 glyphs (PathParser,
      24×24, matching contracts/icons.json)
- [ ] T031 [US4] `core/i18n/I18nKeys.kt`: `object Contacts` with the
      full key map
- [ ] T032 [US1] `feature/contacts/`: ContactsModels.kt (+
      `ContactsScreenState`), ContactsFixtures.kt (canon port),
      components/ (ContactRow, GroupRow, AlphaIndexRail,
      ContactsSearchField, ActionMenuSheet on ModalBottomSheet,
      GroupChips, AddressBlock, GhostAddRow, PinnedCtaBar, EmptyStateCta)
- [ ] T033 [US1] Screens: ContactsScreen.kt (c1 family, VelaTabBar
      selected=Contacts), ContactDetailScreen.kt (c2/c2s),
      GroupDetailScreen.kt (c4/c6); ContactsPreviews.kt (dark+light,
      PreviewStrings)
- [ ] T034 [US3] Behaviours: index-rail pointerInput drag + bubble HUD +
      per-letter haptic; AnchoredDraggable swipe reveal (fixture
      `revealedIndex` forces c1s); reduced-motion degrade
- [ ] T035 [US1] `gallery/ContactsGalleryScreen.kt` (chips C1…C6, C1S,
      C1F, C2S, Components + theme + 1.35× text-scale chips);
      `VelaDestinations` += CONTACTS, CONTACTS_GALLERY; gates:
      `./gradlew :app:testDebugUnitTest :app:assembleDebug` +
      `ContactsFixturesTest` (zh verbatim + inventory pins)

## Phase 6: US1 (+US3) on iOS

- [ ] T040 [P] [US1] `DesignSystem/LucideIcons.swift`: add the 11
      glyphs + size entries; keep `audit-literals.mjs` clean
- [ ] T041 [US1] `Features/Contacts/`: ContactsModels.swift
      (ContactsStateId), ContactsFixtures.swift (canon port);
      `Components/Contacts/`: ContactRow, GroupRow, AlphaIndexRail,
      ContactsSearchField, ActionMenuSheet (detents sheet), GroupChips,
      AddressBlock, GhostAddRow, PinnedCTABar, EmptyStateCTA — each with
      dark/light `#Preview` (+ `.previewSafe` providers)
- [ ] T042 [US1] Screens: ContactsScreen / ContactDetailScreen /
      GroupDetailScreen assembling all c* states; WalletTabBar gains
      selected/onSelect API (single integration point per platform map)
- [ ] T043 [US3] Behaviours: index-rail DragGesture + selection haptics
      + bubble overlay; swipe reveal via horizontal drag anchors;
      `accessibilityReduceMotion` degrade
- [ ] T044 [US1] `ContactsGalleryScreen` + `VELA_PAGE=contacts|
      contacts-gallery` in RootView (+ `VELA_STATE` preselect); gates:
      xcodebuild build test + `ContactsFixturesTests` +
      `node app-ios/scripts/audit-literals.mjs` +
      `gen-tokens.mjs --check`

## Phase 7: Polish & results

- [ ] T050 [P] Cross-platform identicon spot check: 9 canon seeds +
      placeholder render pairwise-identical on all four platforms
      (SC-003/SC-006 import inspection for reuse)
- [ ] T051 [P] zh ↔ en walkthrough on every gallery (US4 SC — no key
      echoes, no clipped strings at 1.35×)
- [ ] T052 `specs/018-contacts-ui/results.md`: gates table + recorded
      deviations (8-roster/妈妈, invented-address identicons, desktop
      <1120 N/A, plus anything discovered); update checklists
- [ ] T053 Full gate sweep per platform; commits per phase (core, web,
      desktop, android, ios, docs)

## Dependencies

- T002→T003 block every platform phase (keys must resolve or web build
  fails / fixture tests echo).
- Within each platform: icons [P] first (independent), then models/
  fixtures → components → screens → gallery → gates.
- Phases 3–6 are independent of each other after Phase 2, but plan.md
  orders web first as the canon proving ground; desktop/android/iOS can
  run in parallel once T019's visual pass confirms the decomposition.
- Phase 7 needs all platform phases.

## Implementation strategy

MVP = Phase 2 + Phase 3 (web gallery walkable against all 20 mocks).
Each later phase is an independently verifiable increment gated by its
own platform commands (quickstart.md).
