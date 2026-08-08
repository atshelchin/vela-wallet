# Tasks: Wallet Home UI Components & Preview Galleries

**Input**: Design documents from `/specs/015-wallet-home-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

Format: `[ID] [P?] [Story] Description` — [P] = parallelizable across
files; stories: US1 mobile states+gallery, US2 desktop 3-column, US3
identicon, US4 i18n/tokens discipline.

## Phase 1: Setup

- [ ] T001 Branch `015-wallet-home-ui`, spec dir, design/wallet mocks
      committed to git

## Phase 2: Foundational (blocking)

- [ ] T002 [US4] Add 13 keys to `rust/crates/vela-core/i18n/locales/*/
      {componentsUi,receive,history}.json` (15 locales, research.md D3)
- [ ] T003 [US4] `node scripts/gen-i18n.mjs` (bump tripwire counts) →
      regenerated catalogs/paths; `cargo test -p vela-core --features
      i18n-all` green
- [ ] T004 [US3] `identicon-raster` feature in vela-core:
      `src/identicon_raster.rs` (`identicon_png`), resvg optional dep,
      unit tests (known seed → decodes, deterministic, placeholder path)
- [ ] T005 [US3] uniffi export `identiconPng`; regenerate kotlin bindings
      (`rust/scripts/smoke-kotlin.sh`) and swift bindings/xcframework
      (`rust/scripts/build-ios-xcframework.sh`)
- [ ] T006 [P] Icon corpus: 24×24 outline paths (lucide) + solid nav
      glyphs, recorded once and ported per platform (research.md D2)

## Phase 3: US1+US3 on Web (canon proving ground)

- [ ] T010 fixtures.ts port of data-model.md; identicon.server.ts
      (build-time SVGs for fixture seeds)
- [ ] T011 [P] 20 wallet UI components under `src/lib/wallet/ui/`
- [ ] T012 WalletHome.svelte (9 states) + WalletDesktop.svelte (3 states)
- [ ] T013 `/[locale]/gallery` routes (component boards + state pages,
      locale/appearance/text-scale switchers), prerendered
- [ ] T014 Gates: `pnpm check`, `lint`, `test:unit`, `build` (worker
      wasm-free), visual pass vs mocks

## Phase 4: US2 on Desktop

- [ ] T020 theme.rs wallet consts; icons.rs (resvg tint cache);
      identicon.rs (RenderImage cache)
- [ ] T021 wallet/ components + sidebar + ReceivePanel/AssetDetailPanel
      + page.rs with PanelState (Esc/✕ close)
- [ ] T022 gallery.rs + `VELA_PAGE=wallet|gallery`; cargo test green
      (theme/loc/golden suites intact)

## Phase 5: US1+US3 on Android

- [ ] T030 IdenticonImage.kt (identiconPng → ImageBitmap, LRU);
      VelaIcons corpus growth (PathParser)
- [ ] T031 feature/wallet components + WalletScreen (9 states) +
      ChainSelectSheet + WalletFixtures.kt
- [ ] T032 GalleryScreen + nav routes + `vela.startDestination` extra;
      previews; `gradlew test` + `assembleDebug` green

## Phase 6: US1+US3 on iOS

- [ ] T040 Identicon.swift (identiconPng → UIImage, cache); SF Symbols
      map
- [ ] T041 Components/Wallet/* + WalletScreen (9 states) +
      ChainSelectSheet + WalletFixtures.swift
- [ ] T042 GalleryScreen + `VELA_PAGE`; `#Preview`s;
      `audit-literals.mjs` + xcodebuild build/test green

## Phase 7: Polish

- [ ] T050 [P] Cross-platform identicon board eyeball check (US3 SC-003)
- [ ] T051 Results notes (deviations from mocks) + checklists +
      quickstart.md finalized
- [ ] T052 Full gate sweep per platform; commits per phase
