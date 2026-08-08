# Tasks: Onboarding Create/Login Full-State UI & State Gallery

**Input**: Design documents from `/specs/014-onboarding-flow-ui/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md,
contracts/i18n-keys.md, contracts/presentation-states.md, quickstart.md

**Tests**: Fixture-count tests are mandated by research D9 (SC-001 mechanical gate);
platform audit/drift/i18n-smoke extensions are mandated by the repo's existing gates.
No other test tasks.

**Organization**: US1 = gallery + pattern components (the acceptance channel);
US2 = Welcome containers; US3 = reuse/coverage gates; US4 = localization verification.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (corpus + shared prerequisites)

- [X] T001 Track the design mocks on the feature branch: `git add design/onboarding/create design/onboarding/login` (35 PNGs — the fidelity reference for every later task)
- [X] T002 Add every NEW key from contracts/i18n-keys.md to all 15 locale files `rust/crates/vela-core/i18n/locales/<lng>/onboarding.json` (zh + en values verbatim from the contract; remaining 13 locales translated per repo conventions — no translator notes, zh-HK spoken register, keep load-bearing whitespace)
- [X] T003 Bump the three count pins + comment block in `scripts/gen-i18n.mjs:134-140` (cite spec 014), then from repo root run `npm run gen:i18n && npm run lint:i18n && npm run verify:i18n`; if residency pins trip, adjust `rust/crates/vela-core/tests/i18n_residency.rs` constants with measured values; run `cargo test -p vela-core --features i18n-all` in `rust/`; stage corpus + ALL regenerated artifacts (`paths.rs`, `i18n_catalogs/*.rs`, `src/i18n/resources.ts`, `public/i18n/*.json`) together
- [X] T004 [P] Extend `app-desktop/vela-wallet/src/theme.rs` Theme with `success_base/success_soft/warning_base/warning_soft/error_base/error_soft/info_base/info_soft` using exact `docs/design-tokens.json` values for light() and dark(), plus flow geometry consts (badge circle 56, ring size, bar heights, panel paddings); extend `theme::tests::contrast_floor_holds_in_both_themes` with the new pairs (research D5)

**Checkpoint**: corpus regenerated & diff-clean — copy resolvable on every platform.

## Phase 2: Foundational (state models — block both US1 and US2)

- [X] T005 [P] Web state model: `app-web/vela-wallet/src/lib/onboarding/states.ts` (CreatePanelState/LoginPanelState/OutcomeSpec/BadgeVariant/ActionId discriminated unions per data-model.md), `outcomes.ts` (OutcomeKind → OutcomeSpec catalog, 18 kinds per data-model §4), `fixtures.ts` (34 fixture codes per contracts/presentation-states.md §1 with mock data)
- [X] T006 [P] iOS state model: `app-ios/VelaWallet/VelaWallet/Features/Onboarding/FlowStates.swift` (enums + OutcomeKind.spec catalog) and `FlowFixtures.swift` (34 codes) — files auto-join the target (synchronized groups)
- [X] T007 [P] Android state model: `app-android/vela-wallet/app/src/main/java/app/getvela/wallet/feature/onboarding/flow/FlowStates.kt` (sealed interfaces + OutcomeKind.spec()) and `FlowFixtures.kt` (34 codes); add all flow key constants to `core/i18n/I18nKeys.kt` (new `Flow`/`Common` groups per contracts/i18n-keys.md)
- [X] T008 [P] Desktop state model: `app-desktop/vela-wallet/src/onboarding_flow.rs` (enums + OutcomeKind::spec + fixtures table), registered in `main.rs` module tree

**Checkpoint**: 4 state models compile; fixture tables enumerate all 34 codes.

## Phase 3: User Story 1 — every state inspectable in a gallery (P1) 🎯 MVP

**Goal**: pattern components + flow panels + dev-only gallery per platform; all 35 mock
states selectable in light+dark. **Independent test**: open each platform's gallery, step
all fixtures, compare to mocks (quickstart §2–§6).

### Web

- [X] T009 [P] [US1] Web static pattern atoms in `app-web/vela-wallet/src/lib/ui/onboarding/`: `Sheet.svelte` (overlay: backdrop `--color-fixed-backdrop`, `--motion-sheet-in/out`, focus trap, aria-modal), `FlowScaffold.svelte` (handle/title/close per contract §3), `StatusBadge.svelte` (6 variants), `ActionStack.svelte` (primary + dark solid secondary rows per contract §5), `TechDetails.svelte` (collapsed default, code block on `--color-bg-sunken`), `AddressStrip.svelte` (tail-truncate, copy + copied feedback) — token audit (`tokens.test.ts`) applies: no hex/px
- [X] T010 [P] [US1] Web input/progress atoms in same dir: `NameField.svelte` (label/placeholder/hint/error line), `AckRow.svelte` (checkbox + inline-link snippet support), `StepProgress.svelte` (5-segment + single-bar modes), `ElapsedRing.svelte` (SVG arc + 1–2 digit number, a11y label)
- [X] T011 [US1] Web panels `CreatePanel.svelte` + `LoginPanel.svelte` in `src/lib/ui/onboarding/` rendering any state from `states.ts` via the atoms only (no inline pattern layout), action sink prop per contract §2
- [X] T012 [US1] Web gallery `src/routes/dev/gallery/+page.server.ts` (`if (!dev) error(404)`, `export const prerender = false`, strings from `public/i18n/*.json` raw glob + dotted lookup + `{{var}}` fill — NO engine.server.ts import) and `+page.svelte` (fixture list grouped Create/Login with E10 in both, theme toggle via `documentElement.dataset.theme`, zh/en picker, renders panels inside Sheet or inline per toggle)

### iOS

- [X] T013 [P] [US1] iOS static atoms in `app-ios/VelaWallet/VelaWallet/Components/`: `StatusBadge.swift`, `ActionStack.swift`, `TechDetails.swift`, `AddressStrip.swift`; add `FlowGeometry` enum to `DesignSystem/Theme.swift` (badge 56, ring, bar, paddings) — audit-literals compliance, `#Preview` dark+light per file
- [X] T014 [P] [US1] iOS input/progress atoms in `Components/`: `NameField.swift`, `AckRow.swift` (links individually tappable), `StepProgress.swift`, `ElapsedRing.swift` (Canvas/Shape arc)
- [X] T015 [US1] iOS `Features/Onboarding/CreatePanel.swift` + `LoginPanel.swift` + `FlowSheet.swift` (scaffold header + content-height detent measurement via onGeometryChange), copy via `Loc.t` with dotted keys from contracts/i18n-keys.md (TOptions: all six params explicit)
- [X] T016 [US1] iOS `Features/Gallery/GalleryScreen.swift` entirely inside `#if DEBUG`, gated by env `VELA_GALLERY=1` read via a static enum (house style); wire the gate in `App/RootView.swift`; fixture list + theme toggle re-applying `.themed(...)`

### Android

- [X] T017 [P] [US1] Android: add `enabled: Boolean = true` to `VelaPrimaryButton`/`VelaSecondaryButton` (`core/designsystem/components/VelaButton.kt`, `VelaOpacity.disabled` treatment, never gray); hand-author needed `ImageVector` icons in `VelaIcons.kt` (Close, Check, ChevronDown, Copy, Clock — Lucide geometry, 24×24 stroke 2); create `VelaStatusBadge.kt`, `VelaActionStack.kt`, `VelaTechDetails.kt`, `VelaAddressStrip.kt` in `core/designsystem/components/` — CHK007–010 rules (no literals)
- [X] T018 [P] [US1] Android input/progress atoms in `core/designsystem/components/`: `VelaTextField.kt`, `VelaAckRow.kt`, `VelaStepProgress.kt`, `VelaElapsedRing.kt` (Canvas arc)
- [X] T019 [US1] Android `feature/onboarding/flow/CreatePanel.kt` + `LoginPanel.kt` + `FlowSheet.kt` (M3 ModalBottomSheet wrapper per ThemeSettingsSheet pattern, `containerColor = colors.bgRaised`, token drag handle), strings via `LocalVelaStrings` + `I18nKeys`
- [X] T020 [US1] Android `feature/onboarding/gallery/GalleryScreen.kt` + `MainActivity.kt` intent-extra gate `vela.gallery` (mirroring `vela.skipLaunchAnimation`); `feature/onboarding/flow/FlowPreviews.kt` with `PreviewStrings`-fake previews named after mock codes

### Desktop

- [X] T021 [P] [US1] Desktop static atoms in `app-desktop/vela-wallet/src/ui/`: `status_badge.rs` (PathBuilder/glyph icons — no SVG assets), `action_stack.rs` (add disabled/dark-row variants to `button.rs` `ButtonVariant`), `tech_details.rs`, `address_strip.rs`; register in `src/ui/mod.rs`; return `Div`/`Stateful<Div>` (never `impl IntoElement`), `min_w(px(0.))` on flex children
- [X] T022 [P] [US1] Desktop input/progress atoms in `src/ui/`: `name_field.rs` (gpui text input or focused-styled field per gpui idiom), `ack_row.rs`, `step_progress.rs`, `elapsed_ring.rs` (canvas arc), `flow_scaffold.rs` (title + close ×, no handle)
- [X] T023 [US1] Desktop panel renderers in `src/onboarding_flow.rs`: `render_create_panel(&CreatePanelState, …) -> Div` + `render_login_panel(…)` composing the atoms, copy via `Loc::t` dotted keys
- [X] T024 [US1] Desktop `src/gallery.rs` (fixture list + state rendering inside a 512px panel replica, keyboard/pager stepping, in-view theme toggle if trivial else `VELA_THEME`) gated by `VELA_GALLERY=1` in `src/main.rs` (5th env var, same shape as existing)

**Checkpoint (MVP)**: all four galleries step through all 35 states dark+light.

## Phase 4: User Story 2 — Welcome containers (P1)

**Goal**: entry buttons present the flows correctly per form factor; close restores
Welcome. **Independent test**: quickstart §2–§5 Welcome flows.

- [X] T025 [P] [US2] Web: extend `src/lib/i18n/messages.ts` (flow message shape + keys) and `src/lib/i18n/engine.server.ts` (flow resolver) so `[locale]/+layout.server.ts` serializes flow copy; rework `src/routes/[locale]/+page.svelte` — ≥1280px buttons swap `.actions` content in place (hero column stable), <1280px buttons open `Sheet.svelte`; buttons stop navigating (placeholder routes untouched); action sink = no-op + close semantics per contract §2
- [X] T026 [P] [US2] iOS: `App/RootView.swift` + `Features/Onboarding/WelcomeScreen.swift` — intents present `FlowSheet` (drag indicator visible, bg `theme.bgRaised`) with initial state (create→Form empty, login→Waiting nil); actions → no-op sink; `AppRoute` placeholder pushes removed from the intent path (cases retained)
- [X] T027 [P] [US2] Android: host `FlowSheet` in the `WELCOME` composable (visibility in `WelcomeViewModel`, ThemeSettingsSheet pattern); `onIntent(CreateWallet/RecoverWallet)` opens the sheet instead of `navController.navigate`; system dismissal + × restore Welcome
- [X] T028 [P] [US2] Desktop: add flow field to `OnboardingPage`, branch `action_panel` in `src/onboarding.rs` to render the active panel in place (512px column, re-rounded corners under client decorations), `Intent` handler sets/clears it; × resets to CTA stack

**Checkpoint**: correct container per form factor on all four platforms.

## Phase 5: User Story 3 — reuse & coverage gates (P2)

- [X] T029 [P] [US3] Web: vitest (server project) `src/lib/onboarding/fixtures.test.ts` asserting the 34-code set and per-flow grouping; verify no pattern layout duplicated outside `src/lib/ui/onboarding/` (grep documented in test file header)
- [X] T030 [P] [US3] iOS: `VelaWalletTests/FlowFixturesTests.swift` (Swift Testing; `@MainActor` if touching Loc) asserting the 34-code set + every OutcomeKind has ≤3 actions with exactly 1 primary
- [X] T031 [P] [US3] Android: `app/src/test/java/app/getvela/wallet/FlowFixturesTest.kt` (34-code set + action-shape invariant); append all new `I18nKeys` entries to `I18nEngineSmokeTest` key list
- [X] T032 [P] [US3] Desktop: `#[test]` in `src/onboarding_flow.rs` (34-code set + action-shape invariant); extend `loc.rs` no-echo sweep with the new flow keys across `en, zh, de, zh-TW, ru`

## Phase 6: User Story 4 — localization verification (P2)

- [X] T033 [P] [US4] Web: extend the `messages.test.ts` pattern to the new flow keys (no key echo × 15 locales), and assert the annotation strings (`新增 i18n`, `展开态`, `兜底集合`) appear nowhere under `src/`
- [X] T034 [US4] Cross-platform copy sweep: run each platform in `zh` and `en` (quickstart commands with `VELA_LANG`/device locale), confirm every gallery state renders localized copy with no echoes and no annotation text; record any copy deviations in `specs/014-onboarding-flow-ui/deviations.md`

## Phase 7: Polish & final gates

- [X] T035 Run all build/check gates and fix fallout: `pnpm check && pnpm lint && pnpm test:unit -- --run && pnpm build` (app-web), `xcodebuild … build test` + `gen-tokens.mjs --check` + `audit-literals.mjs` (app-ios), `./gradlew :app:assembleDebug :app:testDebugUnitTest -PvelaSkipRustBuild` (app-android), `cargo check && cargo clippy --all-targets && cargo test` (app-desktop)
- [X] T036 SC-004 grep gate (quickstart §6.4) over all new module dirs; SC-003 single-authority review against research D6 tables; confirm web `/dev/gallery` 404s in `pnpm preview` of a production build and the wasm-bundle e2e guard stays green
- [ ] T037 Manual fidelity walkthrough: all 35 states vs mocks, dark + light, all four galleries; screenshots for the record (`xcrun simctl io booted screenshot`, `adb exec-out screencap`, browser, desktop OS capture); log deviations in `deviations.md`

## Dependencies

- T001–T003 before T011/T012/T015/T016/T019/T020/T023/T024/T025 (anything resolving new keys); T004 before T021
- Phase 2 blocks Phase 3+ per platform (T005→T009–T012, T006→T013–T016, T007→T017–T020, T008→T021–T024)
- Within each platform: atoms ([P] pairs) → panels → gallery; US2 tasks need that platform's panels (T011→T025, T015→T026, T019→T027, T023→T028)
- US3/US4 need the fixtures + galleries they verify; Phase 7 last
- The four platform tracks are mutually independent and fully parallel

## Parallel example (after Phase 2)

Run four platform tracks concurrently: {T009,T010}→T011→T012 ∥ {T013,T014}→T015→T016 ∥
{T017,T018}→T019→T020 ∥ {T021,T022}→T023→T024; then T025 ∥ T026 ∥ T027 ∥ T028.

## Implementation strategy

MVP = Phase 1 + Phase 2 + Phase 3 (galleries prove all 35 states). Web track first if
serialized (fastest feedback loop via `pnpm dev`). US2 lands next (containers), then the
mechanical gates (US3/US4) and polish.
