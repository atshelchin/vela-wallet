# Implementation Plan: Wallet Home UI Components & Preview Galleries

**Branch**: `015-wallet-home-ui` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-wallet-home-ui/spec.md`

## Summary

Build the wallet-home component vocabulary (18 components, spec §"The
Reusable Component Vocabulary") natively on four clients, assemble the
mobile H1–H8 and desktop D1–D3 screen states from shared canonical
fixtures (data-model.md), expose every state through a per-platform
preview gallery, and switch avatars to vela-core's Nimiq identicon. No
business logic — fixtures only. Rust gains one feature-gated
rasterization helper so the three non-DOM platforms render the identicon
from the same bytes (research.md D1).

## Technical Context

**Language/Version**: Kotlin 2.2.10 / Compose BOM 2025.12 (android) ·
Swift 5 / SwiftUI, iOS 17 (ios) · Svelte 5 + SvelteKit 2 + TS 6 (web) ·
Rust 2024, gpui @ zed rev c97b7c0 (desktop) · Rust 1.97.1 workspace
(core)

**Primary Dependencies**: existing per-platform stacks; new: `resvg`
(vela-core, optional feature `identicon-raster`; also app-desktop for
icon tinting)

**Storage**: none (fixtures in code)

**Testing**: gradle unit tests + compose previews · Swift Testing +
`#Preview` · vitest + playwright e2e · cargo test; vela-core
conformance/i18n suites stay green

**Target Platform**: Android API 31+ · iOS 17+ · Cloudflare Workers
(prerendered) · macOS/Linux/Windows desktop

**Project Type**: multi-client UI feature over a shared Rust core

**Performance Goals**: identicon raster ≤ 1 ms cached path per avatar;
gallery navigable at 60 fps

**Constraints**: deployed web Worker stays wasm-free; committed
generated artifacts (kotlin/swift bindings, tokens, i18n catalogs) only
change via their generator scripts; token/no-literal audit gates keep
passing (android `DesignTokenDriftTest`, ios `audit-literals.mjs`, web
`gen-tokens.mjs --check`)

**Scale/Scope**: 18 components × 4 platforms, 12 screen-state fixtures,
13 new i18n keys × 15 locales, 1 new core API

## Constitution Check

Constitution file is the unfilled template — no project-specific gates.
Applied the de-facto rules from specs 006–009: tokens only, i18n
through vela-core, generated files regenerated not hand-edited,
one authoritative implementation per capability per platform.

## Project Structure

### Documentation (this feature)

```text
specs/015-wallet-home-ui/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
```

### Source Code (repository root)

```text
rust/
├── crates/vela-core/
│   ├── Cargo.toml                  # + [features] identicon-raster = dep:resvg
│   └── src/identicon_raster.rs     # identicon_png(seed, size_px) + tests
├── crates/vela-core-uniffi/        # + identiconPng export (feature on)
├── bindings/kotlin/…               # regenerated (script)
└── crates/vela-core/i18n/locales/<lng>/{componentsUi,receive,history}.json  # +13 keys

app-web/vela-wallet/src/
├── lib/wallet/
│   ├── fixtures.ts                 # canonical fixtures port
│   ├── identicon.server.ts         # build-time identiconSvgCircular for fixture seeds
│   ├── icons.ts                    # shared 24×24 path corpus
│   └── ui/  Identicon, WalletHeader, NetworkFilterPill, BalanceDisplay,
│            BalanceStatusLine, ActionButtonRow, SectionHeader, ActivityRow,
│            AssetRow, TokenIcon, EmptyState, SkeletonRow, TabBar,
│            BottomSheet, ChainFilterList, Sidebar, ThirdPanel,
│            ReceivePanel, AssetDetailPanel, QRPlaceholder  (.svelte)
├── lib/wallet/WalletHome.svelte    # mobile assembly (state-driven)
├── lib/wallet/WalletDesktop.svelte # 3-column assembly
└── routes/[locale]/gallery/{+page.svelte,+page.server.ts,[state]/…}

app-android/vela-wallet/app/src/main/java/app/getvela/wallet/
├── core/designsystem/components/   # VelaIcons.kt grows the icon corpus
├── feature/wallet/
│   ├── WalletFixtures.kt, WalletComponents*.kt (per-component files),
│   ├── WalletScreen.kt, ChainSelectSheet.kt, WalletPreviews.kt
│   └── gallery/GalleryScreen.kt
├── core/identicon/IdenticonImage.kt  # identiconPng → ImageBitmap + cache
└── navigation/VelaNavHost.kt         # + wallet, gallery routes; MainActivity extra

app-ios/VelaWallet/VelaWallet/
├── Components/Wallet/              # one file per component + Identicon.swift
├── Features/Wallet/  WalletFixtures.swift, WalletScreen.swift,
│                     ChainSelectSheet.swift, GalleryScreen.swift
└── App/RootView.swift              # VELA_PAGE branch

app-desktop/vela-wallet/src/
├── theme.rs                        # + wallet layout consts
├── icons.rs                        # svg templates + resvg tint/rasterize cache
├── identicon.rs                    # vela-core identicon_png → RenderImage cache
├── wallet/  fixtures.rs, components.rs (rows/balance/etc.),
│            sidebar.rs, panels.rs, page.rs
├── gallery.rs                      # state-switcher window content
└── main.rs                         # VELA_PAGE routing
```

**Structure Decision**: each platform keeps its established layering
(tokens → shared components → feature screens); wallet components live
in a wallet-scoped module per platform with the platform's naming
convention; the component↔mock name map from spec §Vocabulary is
recorded in each module's doc header.

## Execution order

1. **Core**: i18n keys (15 locales) → `gen-i18n.mjs` (+tripwire bump) →
   `identicon-raster` feature + uniffi export → regenerate committed
   kotlin/swift bindings → `cargo test -p vela-core --features
   i18n-all` + conformance.
2. **Web** (fastest visual verification loop; validates fixture canon
   and component decomposition against the mocks first).
3. **Desktop** (three-column + panels; reuses fixture canon; gpui
   quirks from spec 007 memory apply).
4. **Android**, 5. **iOS** (mirror the proven decomposition; regen’d
   bindings land the identicon).
6. Per-platform gates + spec checklists + results notes.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `identicon-raster` core feature (resvg) | 3 platforms have no SVG renderer; avatar is a verification signal | per-platform SVG libs = 3 renderers to drift; hand parsers can't do strokes/ellipses |
| 13 new i18n keys | mock copy not fully covered | hardcoding strings violates the no-literal gates |
