# Implementation Plan: Onboarding Create/Login Full-State UI & State Gallery

**Branch**: `014-onboarding-flow-ui` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-onboarding-flow-ui/spec.md`

## Summary

Implement the 35 onboarding create/login mock states as **four pattern components**
(Scaffold, Form, Progress, Outcome) natively on each of the four shells — Android
(Compose), iOS (SwiftUI), web (SvelteKit), desktop (gpui) — presented as a bottom sheet on
mobile / web-narrow and as an in-place panel swap in the Welcome CTA column on desktop /
web-wide. No business logic is wired: a presentation state model (aligned with the spec
011 crux ViewModels, extended with the mock-driven outcome taxonomy) is rendered from
fixtures, and every platform ships a dev-only state gallery covering all 35 states in
light + dark. New copy lands once in the vela-core corpus (new `onboarding.common.*`
branch + login/create gaps) and flows to all platforms through the existing i18n
pipelines. Research is consolidated in [research.md](research.md) (D1–D10); shapes in
[data-model.md](data-model.md); binding surfaces in
[contracts/i18n-keys.md](contracts/i18n-keys.md) and
[contracts/presentation-states.md](contracts/presentation-states.md).

## Technical Context

**Language/Version**: Kotlin 2.2.10 (AGP 9.3.1, Compose BOM 2025.12.00, minSdk 31);
Swift 5 mode / Xcode 26.3, iOS 17+, SwiftUI; TypeScript 6 / Svelte 5.56 (runes) /
SvelteKit 2.70 on Cloudflare; Rust 1.97.1 / gpui 0.2.2 (zed pin `c97b7c0`, Cargo.lock-pinned)

**Primary Dependencies**: none added. Existing: Material3 (Android sheets), lottie
(untouched), vela-core (i18n via uniffi / wasm / path dep), Plus Jakarta Sans

**Storage**: N/A (explicitly none — FR-011)

**Testing**: Gradle JVM unit tests (drift/i18n smoke/fixture-count), Swift Testing
(hosted, `@MainActor` split), vitest (client+server projects) + existing token/contrast
audits, cargo test; per-platform build gates as in quickstart.md

**Target Platform**: Android 12+ (portrait phone), iOS 17+ iPhone, evergreen browsers via
Cloudflare Workers (prerendered locales), macOS/Linux/Windows desktop

**Project Type**: four native app shells sharing one design-token export
(`docs/design-tokens.json`) and one i18n corpus (`rust/crates/vela-core/i18n/locales/`)

**Performance Goals**: none new — static panels; no animation/timing beyond existing
sheet-motion tokens

**Constraints**: no hard-coded visual literals (per-platform audit gates); no business
I/O; corpus count-pins bumped in the same commit as regenerated artifacts; galleries
unreachable in release builds; web worker bundle must stay wasm-free

**Scale/Scope**: 35 states × 4 platforms; ~10 new pattern components + state model +
fixtures + gallery per platform; ~49 new corpus leaves × 15 locales

## Constitution Check

`.specify/memory/constitution.md` is an unfilled template — no ratified project
constitution exists. Gate passes vacuously. In its place this plan binds itself to the
repo's enforced de-facto principles, all machine-checked: single-source design tokens
(drift tests / `--check` generators / literal audits), single-source i18n corpus with
count pins and CI diff gates, one authoritative implementation per capability (spec SC-003),
and dev-only surfaces never shipping to release. Re-evaluated after Phase 1 design:
no violations introduced; no complexity-tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/014-onboarding-flow-ui/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — decisions D1–D10
├── data-model.md        # Phase 1 — presentation state shapes + crux mapping
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── i18n-keys.md     # per-state key map + new-key manifest (15 locales)
│   └── presentation-states.md  # per-platform surfaces, containers, galleries
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
rust/crates/vela-core/i18n/locales/<lng>/onboarding.json   # +new keys, all 15 locales
scripts/gen-i18n.mjs                                       # count-pin bump only

app-web/vela-wallet/src/lib/onboarding/{states,outcomes,fixtures}.ts
app-web/vela-wallet/src/lib/ui/onboarding/{Sheet,FlowScaffold,NameField,AckRow,
    StepProgress,ElapsedRing,StatusBadge,TechDetails,AddressStrip,ActionStack,
    CreatePanel,LoginPanel}.svelte
app-web/vela-wallet/src/lib/i18n/messages.ts               # flow message shape
app-web/vela-wallet/src/lib/i18n/engine.server.ts          # flow resolver
app-web/vela-wallet/src/routes/[locale]/+page.svelte       # swap/sheet hosting
app-web/vela-wallet/src/routes/dev/gallery/{+page.server.ts,+page.svelte}

app-ios/VelaWallet/VelaWallet/Features/Onboarding/{FlowStates,FlowFixtures,
    CreatePanel,LoginPanel,FlowSheet}.swift
app-ios/VelaWallet/VelaWallet/Components/{NameField,AckRow,StepProgress,ElapsedRing,
    StatusBadge,TechDetails,AddressStrip,ActionStack}.swift
app-ios/VelaWallet/VelaWallet/Features/Gallery/GalleryScreen.swift   # #if DEBUG
app-ios/VelaWallet/VelaWallet/App/RootView.swift           # sheet presentation + gallery gate
app-ios/VelaWallet/VelaWallet/DesignSystem/Theme.swift     # FlowGeometry constants

app-android/vela-wallet/app/src/main/java/app/getvela/wallet/
    feature/onboarding/flow/{FlowStates,FlowFixtures,CreatePanel,LoginPanel,FlowSheet}.kt
    feature/onboarding/gallery/GalleryScreen.kt
    core/designsystem/components/{VelaTextField,VelaAckRow,VelaStepProgress,
        VelaElapsedRing,VelaStatusBadge,VelaTechDetails,VelaAddressStrip,
        VelaActionStack}.kt  (+VelaButton enabled param, +VelaIcons additions)
    feature/onboarding/WelcomeScreen.kt / MainActivity.kt   # sheet host + gallery extra

app-desktop/vela-wallet/src/{onboarding_flow.rs,gallery.rs}
app-desktop/vela-wallet/src/ui/{flow_scaffold,name_field,ack_row,step_progress,
    elapsed_ring,status_badge,tech_details,address_strip,action_stack}.rs
app-desktop/vela-wallet/src/theme.rs                        # +status color pairs
app-desktop/vela-wallet/src/onboarding.rs                   # action_panel swap
app-desktop/vela-wallet/src/main.rs                         # VELA_GALLERY gate
```

**Structure Decision**: each platform keeps its established layering (tokens/components/
features separation); the shared artifacts of this feature are the corpus keys, the
design-token export already in place, and the cross-platform contracts in this spec dir.
