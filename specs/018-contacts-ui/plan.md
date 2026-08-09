# Implementation Plan: Contacts UI Components & Preview Galleries

**Branch**: `018-contacts-ui` | **Date**: 2026-08-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-contacts-ui/spec.md`

## Summary

Build the contacts list-management vocabulary (21 components, spec §"The
Reusable Component Vocabulary" — 8 of them reused from spec 015) natively
on four clients, assemble the mobile C1–C6 (+ swipe/delete-confirm) and
desktop DC1–DC6 (+ narrow-overlay) states from shared canonical fixtures
(data-model.md), and expose every state through each platform's existing
preview gallery. No business logic — fixtures only. No vela-core API
changes: identicon rendering routes from spec 015 are reused as-is; the
only core-side change is ~21 new `contacts.*` i18n keys plus two value
updates across 15 locales (research.md D3, with a Russian byte budget —
the u16 catalog pin has ~0.9 KB headroom).

## Technical Context

**Language/Version**: Kotlin 2.2.10 / Compose BOM 2025.12 (android) ·
Swift 5 / SwiftUI, iOS 17 (ios) · Svelte 5 + SvelteKit 2 + TS (web) ·
Rust 2024, gpui @ zed rev c97b7c0 (desktop) · Rust 1.97.1 workspace
(core, i18n corpus only)

**Primary Dependencies**: existing per-platform stacks only — no new
third-party dependencies on any platform

**Storage**: none (fixtures in code)

**Testing**: gradle unit tests + compose previews (`ContactsFixturesTest`
mirroring `WalletFixturesTest`) · Swift Testing + `#Preview` · vitest
(+ existing playwright harness) · cargo test; vela-core i18n suite stays
green

**Target Platform**: Android API 31+ · iOS 17+ · Cloudflare Workers
(prerendered, worker stays wasm-free) · macOS/Linux/Windows desktop

**Project Type**: multi-client UI feature over a shared Rust core

**Performance Goals**: galleries navigable at 60 fps; index-rail
letter-jump feedback within one frame

**Constraints**: token/no-literal audit gates keep passing (android
`DesignTokenDriftTest`, ios `audit-literals.mjs`, web `gen-tokens.mjs
--check` + literal-audit test); i18n corpus edits go through
`gen-i18n.mjs` with pin bumps; **ru catalog value blob ≤ 65,536 bytes**
(currently 64,614 — new ru copy must stay terse); committed generated
artifacts change only via their generators

**Scale/Scope**: 13 new + 8 reused components × 4 platforms, 8 mobile +
7 desktop screen-state fixtures, ~21 new i18n keys + 2 value updates ×
15 locales, ~10 new icons × 4 platforms, 0 new core APIs

## Constitution Check

Constitution file is the unfilled template — no project-specific gates.
Applied the de-facto rules from specs 006–015: tokens only, i18n through
vela-core, generated files regenerated not hand-edited, one authoritative
implementation per capability per platform, fixtures are the single
canon, components are pure (strings/models in, elements out).

## Project Structure

### Documentation (this feature)

```text
specs/018-contacts-ui/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/{icons.json, i18n-keys.md}
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks output)
```

### Source Code (repository root)

```text
rust/crates/vela-core/i18n/locales/<lng>/contacts.json   # +~21 keys, 2 value updates, 15 locales
public/i18n/*.json, rust/crates/vela-core/src/i18n*/     # regenerated (gen-i18n.mjs, pins bumped)

app-web/vela-wallet/src/
├── lib/contacts/
│   ├── model.ts            # display models + ContactsStateId unions + state arrays
│   ├── fixtures.ts         # canon port; buildMobileState/buildDesktopState(state, m, identicon)
│   ├── messages.ts         # ContactsMessages + CONTACTS_KEYS (reuses wallet keys where shared)
│   └── ui/  ContactRow, GroupRow, GroupRail, AlphaSectionList, AlphaIndexRail,
│            SearchHeader, ActionMenuSheet, DropdownMenu, ContextMenu, GroupChips,
│            AddressBlock, GhostAddRow, PinnedCTABar, ContactDetailPanel,
│            EmptyStateCTA  (.svelte; reuses wallet/ui Identicon, ActivityRow,
│            SectionHeader, EmptyState, TabBar, Sidebar, ThirdPanel, BottomSheet)
├── lib/contacts/ContactsHome.svelte      # mobile assembly (state-driven)
├── lib/contacts/ContactsDesktop.svelte   # sidebar + rail + list + third column
├── lib/i18n/engine.server.ts             # + resolveContactsMessages(locale)
├── lib/wallet/icons.ts                   # + ~10 utility icons (shared corpus)
└── routes/[locale]/gallery/              # + contacts boards; [state] gains c*/dc* entries

app-android/vela-wallet/app/src/main/java/app/getvela/wallet/
├── core/designsystem/components/VelaIcons.kt   # + ~10 icons
├── feature/contacts/
│   ├── ContactsModels.kt, ContactsFixtures.kt, ContactsScreen.kt,
│   │   ContactDetailScreen.kt, GroupDetailScreen.kt, ContactsPreviews.kt
│   ├── components/  ContactRow.kt, GroupRow.kt, AlphaIndexRail.kt,
│   │   ContactsSearchField.kt, ActionMenuSheet.kt, GroupChips.kt,
│   │   AddressBlock.kt, GhostAddRow.kt, PinnedCtaBar.kt, EmptyStateCta.kt
│   └── gallery/ContactsGalleryScreen.kt (+ ContactsComponentBoard.kt)
├── core/i18n/I18nKeys.kt                        # + object Contacts
├── navigation/VelaNavHost.kt                    # + CONTACTS, CONTACTS_GALLERY routes
└── app/src/test/java/app/getvela/wallet/ContactsFixturesTest.kt

app-ios/VelaWallet/VelaWallet/
├── Components/Contacts/    # ContactRow, GroupRow, AlphaIndexRail, ContactsSearchField,
│   ActionMenuSheet, GroupChips, AddressBlock, GhostAddRow, PinnedCTABar, EmptyStateCTA
├── Features/Contacts/      # ContactsModels, ContactsFixtures, ContactsScreen,
│   ContactDetailScreen, GroupDetailScreen, ContactsGalleryScreen
├── DesignSystem/LucideIcons.swift               # + ~10 glyphs
├── App/RootView.swift                           # VELA_PAGE gains contacts/contacts-gallery
└── VelaWalletTests/ContactsFixturesTests.swift

app-desktop/vela-wallet/src/
├── theme.rs                # + contacts layout consts (rail width, menu metrics)
├── icons.rs                # + ~10 lucide bodies
├── wallet/mod.rs           # WalletStrings unchanged; new contacts strings struct
├── contacts/  mod.rs (ContactsStrings), fixtures.rs, components.rs
├── wallet/page.rs          # Section enum (wallet|contacts), PanelId::ContactDetail,
│                           # GalleryTab += DC1…DC6 + ContactsComponents, menu overlay state
└── (tests in the modules: fixtures pins + strings resolve + contrast additions)
```

**Structure Decision**: each platform keeps its established layering;
contacts components live in a contacts-scoped module per platform,
reusing the wallet-scoped spec-015 components via imports (never
copies). The desktop reuses `WalletPage` as the three-column shell with
a `Section` switch rather than a second page struct, because the
sidebar/third-column/gallery chrome is already there (research.md D1).

## Execution order

1. **Core/i18n**: add ~21 `contacts.*` keys + 2 value updates to all 15
   locales (ru kept terse) → `npm run gen:i18n` (bump path/leaf pins) →
   `npm run lint:i18n` + `npm run verify:i18n` → `cargo test -p
   vela-core --features i18n-all`. Contract: contracts/i18n-keys.md.
2. **Web** (fastest loop; validates fixture canon + component
   decomposition against the mocks first; extends the literal-audit
   scan set to `src/lib/contacts/**`).
3. **Desktop** (Section switch, third-column contact detail, first
   anchored menus in the codebase via `deferred(anchored(...))`).
4. **Android**, 5. **iOS** (mirror the proven decomposition; first
   anchored menus stay sheets on mobile per the mocks).
6. Per-platform gates + results.md with recorded deviations.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| ~21 new i18n keys (15 locales) | mock copy not fully covered by the existing 53 `contacts.*` keys | hardcoding strings violates the no-literal gates |
| First anchored-menu primitives (desktop `deferred(anchored())`, gpui) | DC5/DC6 demand dropdown + context menus; none exist | bottom sheets on desktop contradict the mocks and desktop idiom |
| Fabricated-but-pinned full addresses for 7 fixture contacts | identicon seeds need full strings; mocks only show head…tail | seeding identicons from truncated display strings would diverge across future real-data wiring; recorded in data-model.md with head/tail matching the mocks |
