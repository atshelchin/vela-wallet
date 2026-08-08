# Research — spec 014 (Onboarding Create/Login Full-State UI & Gallery)

Findings from four platform surveys + the vela-core i18n/token survey (2026-08-08).
Each decision lists what was chosen, why, and what was rejected.

---

## D1 — Copy strategy: reuse the existing corpus aggressively, add one small `onboarding.common.*` namespace

**Decision**: The corpus already contains most of the mock copy verbatim
(`onboarding.create.*` 43 keys, `onboarding.login.*` 15 keys — A11/A12/A13/B2/B3/B4 and
E4–E9 are fully or mostly covered, and the five `statusX` keys are exactly the A4–A8
headlines). Reuse those keys as-is. Add new keys only where nothing exists:
`onboarding.common.*` (new branch: shared outcome/progress scaffolding — network, server,
timeout, unknown, back, step counter, settings-actions, recreate, prompt hints, waited
seconds) plus a handful under `onboarding.login.*` (B1/B5/B6) and
`onboarding.create.retryVerifyBtn` (E5 primary). Full manifest with zh/en values:
`contracts/i18n-keys.md`.

**Rationale**: The mocks' zh strings match existing corpus zh values character-for-character
in most states (the designer worked from the corpus). Duplicate keys would create drift and
double translation load across 15 locales.

**Alternatives rejected**: (a) a fresh `onboarding.flow.*` namespace for everything —
maximal isolation but duplicates ~50 already-translated strings; (b) reusing
`common.somethingWrong`/`send.tx*` cross-feature strings for E10/rings — saves 3 keys but
couples onboarding copy to send-flow phrasing that can drift for its own reasons.

**Mechanics** (binding, from the survey): edit all 15
`rust/crates/vela-core/i18n/locales/<lng>/onboarding.json`; bump the three count pins at
`scripts/gen-i18n.mjs:134-140` (currently 1245 paths / 1172 leaves / 73 branches; new
branch `onboarding.common` +1, leaves per manifest) and extend the pin's comment block
citing spec 014; run `npm run gen:i18n && npm run lint:i18n && npm run verify:i18n` from
the repo root; corpus edit + regenerated artifacts (`paths.rs`, `i18n_catalogs/*.rs`,
`resources.ts`, `public/i18n/*.json`) must land in the same commit (CI diff-gate).
Residency pins (`i18n_residency.rs`: `CORPUS_BYTES`, `SC005_BUDGET`, ≥86.0 saved, u16
blob ceiling) may need matching bumps. Per-platform pickup: web/iOS/Android read
`public/i18n/*.json` at build time (no wasm/xcframework/ndk rebuild for a copy-only
change); desktop compiles catalogs in — plain `cargo build` picks them up.

**TechDetails content is data, not copy**: the E2x code/context/endpoint lines are runtime
diagnostics; gallery fixtures carry the mock strings verbatim. Only the disclosure label
(`onboarding.create.technicalDetails`, exists) is localized.

## D2 — Containers per platform

**Decision**:
- **iOS**: SwiftUI `.sheet` on the Welcome screen, `presentationDragIndicator(.visible)`,
  content-height detent (measure with `onGeometryChange`, `presentationDetents([.height(h)])`),
  background `theme.bgRaised`. First sheet in the app — greenfield, no precedent to break.
- **Android**: Material3 `ModalBottomSheet` exactly per the `ThemeSettingsSheet` precedent
  (`containerColor = colors.bgRaised`, hosted inside the `WELCOME` composable, visibility in
  the ViewModel); custom drag handle tinted with tokens.
- **Web < 1280 px**: new `Sheet.svelte` overlay (fixed inset, backdrop
  `--color-fixed-backdrop`, `--motion-sheet-in/out` tokens — already emitted, currently
  unused), pattern-modeled on `LaunchAnimation.svelte`'s overlay conventions.
- **Web ≥ 1280 px**: swap the flow panel into the existing `.actions` aside on the Welcome
  page (the 38% right pane, `border-inline-start` hairline) — the pane spec 006 already
  built; no modal, no navigation.
- **Desktop**: swap inside `OnboardingPage::action_panel` (fixed `PANEL_W = 512`,
  `PANEL_INSET = 84`) by branching on a new page-state field; `Intent` sink pattern stays.

**Rationale**: each choice is that platform's already-established idiom (or, where none
exists, its design-token-compatible native primitive); the web breakpoint and both swap
targets already exist.

**Alternatives rejected**: custom pan-gesture sheets on iOS/Android (needless physics
re-implementation); a shared web modal for both breakpoints (violates the product owner's
explicit no-modal-on-desktop rule); a new gpui window for desktop panels (breaks the
in-place requirement).

## D3 — Entry-button behaviour in this feature

**Decision**: Welcome buttons open the container with the flow's initial fixture
(create → `Form` empty, login → `Waiting`); all in-panel actions route to a no-op intent
sink (desktop's `on_intent` log pattern, replicated per platform); close × / scrim /
standard dismissal restores Welcome. Web keeps the `[locale]/create` and `[locale]/import`
placeholder routes untouched for direct URLs, but the Welcome buttons stop navigating and
swap/present instead. iOS keeps `AppRoute` placeholder cases but the intents now present
the sheet.

**Rationale**: FR-011 forbids real progression; the gallery is the state-viewing surface.
A scripted fake progression in the production entry path was rejected — it would
demo-wire behaviour that the wiring feature must replace, and could be mistaken for real.

## D4 — Gallery mechanism per platform

**Decision**:
- **Web**: `src/routes/dev/gallery/` (outside `[locale]` → outside the prerender seam),
  `+page.server.ts` guard `if (!dev) error(404)` + `export const prerender = false`.
  Strings resolve from `public/i18n/<lng>.json` directly (raw JSON glob + dotted-path
  lookup + trivial `{{var}}` fill in dev code) — **not** through `engine.server.ts`, so no
  wasm can leak into `_worker.js` (the deploy dry-run guard e2e stays untouched). Theme
  toggle sets `document.documentElement.dataset.theme` (hooks already dormant in
  tokens.css); locale picker offers at least `zh`/`en`.
- **iOS**: `Features/Gallery/GalleryScreen.swift` compiled under `#if DEBUG` only, shown
  when `VELA_GALLERY=1` (env-switch house style, launched via `SIMCTL_CHILD_VELA_GALLERY`);
  plus `#Preview` blocks per pattern component following the existing dark/light pairing
  conventions. Strings via the real `Loc` (catalogs are bundled in Debug builds).
- **Android**: gallery composable gated by the intent-extra house pattern
  (`--ez vela.gallery true`, mirroring `vela.skipLaunchAnimation`); plus `*Previews.kt`
  files using the `PreviewStrings` fake. No `BuildConfig` exists and we do not enable it.
  Release builds simply never receive the extra; the gallery adds no manifest surface.
- **Desktop**: `VELA_GALLERY=1` env var (5th env var, established shape) makes `main.rs`
  open the gallery view instead of Welcome; keyboard/pager to step states; theme via
  existing `VELA_THEME`.

**Rationale**: every gate reuses a mechanism the platform already ships and tests; none
adds release surface. The web decision deliberately trades "gallery goes through the wasm
engine" for "gallery provably cannot poison the worker bundle" — the corpus JSON it reads
is the same artifact the engine loads, so copy verification is not weakened.

**Alternatives rejected**: web route under `[locale]` (inherits `prerender = true`, ships
in the deploy bundle); Android `src/debug` source set or `buildConfig = true` (heavier than
the established runtime-flag precedent); iOS Release-reachable gallery route (violates
FR-013).

## D5 — Desktop theme gap must be closed

**Decision**: extend `app-desktop/vela-wallet/src/theme.rs` `Theme` with the status colors
this feature needs — `success_base/soft`, `warning_base/soft`, `error_base/soft`,
`info_base/soft` — using the exact `docs/design-tokens.json` values (light and dark), and
add the new pairs to the existing contrast test. Keep the struct hand-maintained (as
today); converting desktop to a generated-token pipeline is out of scope but noted as
follow-up.

**Rationale**: the desktop Theme currently has no success/warning/error/info at all — the
six badge variants are unbuildable without this. Using export values (not mock-sampled)
keeps all four platforms on identical status colors.

## D6 — Component inventories (one authority per capability, per platform)

New pattern components, named per platform convention; existing atoms reused where they
exist (details in `contracts/presentation-states.md`):

| Capability | web (`src/lib/ui/onboarding/`) | iOS (`Components/`) | Android (`core/designsystem/components/`) | desktop (`src/ui/`) |
| --- | --- | --- | --- | --- |
| Sheet/panel scaffold | `Sheet.svelte` + `FlowScaffold.svelte` | `FlowSheet.swift` (+scaffold header) | `VelaBottomSheet` wrapper + scaffold | `flow_scaffold` fn |
| Name field | `NameField.svelte` | `NameField.swift` | `VelaTextField` | `name_field` |
| Ack row | `AckRow.svelte` | `AckRow.swift` | `VelaAckRow` | `ack_row` |
| Stepped/linear progress | `StepProgress.svelte` | `StepProgress.swift` | `VelaStepProgress` | `step_progress` |
| Countdown ring | `ElapsedRing.svelte` | `ElapsedRing.swift` | `VelaElapsedRing` | `elapsed_ring` |
| Status badge | `StatusBadge.svelte` | `StatusBadge.swift` | `VelaStatusBadge` | `status_badge` |
| Tech-details disclosure | `TechDetails.svelte` | `TechDetails.swift` | `VelaTechDetails` | `tech_details` |
| Address strip | `AddressStrip.svelte` | `AddressStrip.swift` | `VelaAddressStrip` | `address_strip` |
| Action stack | `ActionStack.svelte` | `ActionStack.swift` | `VelaActionStack` | `action_stack` |
| Buttons | existing `Button.svelte` (+`disabled` already) | existing `VelaButton` (`enabled:` exists) | existing `VelaPrimaryButton/VelaSecondaryButton` **+ new `enabled` param** (none today, opacity `VelaOpacity.disabled`) | existing `vela_button` **+ disabled variant** |
| Checkbox glyph, close ×, chevron, copy, clock icons | inline SVG (BrandMark-style whitelisting not needed — use `currentColor`) | SF Symbols | hand-authored `ImageVector`s in `VelaIcons` (house rule: no icon lib) | `PathBuilder`/glyph text per logo.rs precedent |

Platform state models: web `src/lib/onboarding/states.ts` + `fixtures.ts`; iOS
`Features/Onboarding/FlowStates.swift` + `FlowFixtures.swift`; Android
`feature/onboarding/flow/FlowStates.kt` + `FlowFixtures.kt`; desktop
`src/onboarding_flow.rs` (states + outcome catalog + fixtures behind `#[cfg(...)]`-free
plain module — fixtures compiled always but only reachable from the gallery).

## D7 — Known platform constraints the implementation must respect

- **iOS**: files auto-join targets (synchronized groups) → anything not `#if DEBUG`-guarded
  ships in Release; `TOptions` memberwise init has no defaults; `audit-literals.mjs` bans
  raw visual literals outside `DesignSystem/` (new geometry goes in
  `Theme.swift`-style enums); concrete simulator destination required (arm64-only
  xcframework slice); test suites touching `Loc`/view-models need `@MainActor`.
- **Android**: no `Text` literals / raw dp/sp / `Color(` outside tokens (CHK007–010
  greps); new tokens must join `DesignTokenDriftTest`; new `I18nKeys` entries join
  `I18nEngineSmokeTest.welcomeKeys`; build with `-PvelaSkipRustBuild` when `.so`/dylib are
  warm; config-cache-safe Gradle only; JDK via `./gradlew` (JAVA_HOME=17, daemon 21).
- **Web**: `tokens.test.ts` audits `src/lib/ui/**` + `src/routes/**` (no hex, no px except
  `1280px` in `@media`, shadows/fonts via vars) — new components must live inside audited
  dirs and comply; runes forced; strings reach `.svelte` as serialized props (Welcome) —
  the flow panels on Welcome receive their copy via `+layout.server.ts` message expansion
  (extend `messages.ts` shape + `engine.server.ts` resolver + `WELCOME_KEYS`-style arrays);
  `pnpm check`/`build` hard-fail on token drift; `worker-configuration.d.ts` requires
  `wrangler types` on fresh clones.
- **Desktop**: return `Div`/`Stateful<Div>` not `impl IntoElement`; `min_w(px(0.))` on
  flex children; no child-clipping to parent rounding (re-round corner-hugging children);
  no `SVG` assets (PathBuilder or glyphs); gpui pinned by Cargo.lock only — no
  `cargo update`; `VELA_SKIP_LAUNCH_ANIMATION=1` for deterministic runs; crate is
  standalone (run cargo from `app-desktop/vela-wallet/`).

## D8 — Countdown ring rendering

**Decision**: draw natively per platform (SVG arc on web, `Canvas`/`Shape` on
Android/iOS, gpui `canvas` + `PathBuilder` arc on desktop). Ring = static open arc +
centered 1–2-digit number, sized by a per-platform geometry constant; no animation
requirement in this feature (fixtures show frozen values 8/19/41). Accessibility label via
new `onboarding.common.waitedSeconds` ("已等待 {{seconds}} 秒").

**Rejected**: any animation/timer driving the ring (FR-011 — no timing behaviour), and any
new dependency.

## D9 — Verification strategy

- **Builds** (SC-005/FR-018): Android `./gradlew :app:assembleDebug -PvelaSkipRustBuild` +
  `:app:testDebugUnitTest`; iOS `xcodebuild … -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build test`
  + the four `--check`/audit scripts; web `pnpm check && pnpm lint && pnpm test:unit -- --run && pnpm build`;
  desktop `cargo check && cargo clippy --all-targets && cargo test`.
- **Corpus** (FR-015): `npm run gen:i18n` diff-clean, `lint:i18n` no new defects,
  `verify:i18n` green, `cargo test -p vela-core --features i18n-all`.
- **Coverage** (SC-001): each platform's gallery enumerates the 35 fixture codes from one
  fixture table; a unit test per platform asserts the fixture count and code set (35,
  A/B/E codes) so a dropped state fails mechanically, not visually.
- **Fidelity** (SC-002): manual walkthrough against mocks per quickstart; web additionally
  can screenshot gallery states via the existing Playwright-style loop in dev (optional,
  not a gate).
- **No-business-logic** (SC-004): grep gate recorded in quickstart (no
  fetch/URLSession/OkHttp/reqwest/navigator.credentials/ASAuthorization in new modules).

## D10 — What this feature deliberately does not do

No crux wiring (spec 011 machines untouched); no Expo RN app changes; no desktop
token-generator conversion (D5 note); no real elapsed-time measurement; no new
dependencies on any platform; no removal of the existing web/iOS placeholder routes.
