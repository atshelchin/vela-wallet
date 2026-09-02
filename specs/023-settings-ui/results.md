# Spec 023 — Results

Branch `023-settings`, built in an isolated git worktree
(`/Volumes/data/production/vela-wallet-023-settings`) because a second session
was committing to the shared checkout mid-feature.

## What shipped

| Platform | Components | States | Real-app wiring |
|---|---|---|---|
| Web (SvelteKit) | 25 in `src/lib/settings/ui/` | 28 phone + 10 desktop, prerendered per state | `/[locale]/settings` route; wallet's 设置 tab navigates there |
| Desktop (gpui) | 16 in `src/settings/components.rs` | 10 desktop chips in the existing gallery | `Section::Settings` in the wallet shell; sidebar 设置 selects it |
| Android (Compose) | 18 across `feature/settings/components/` | 28 in `SettingsGalleryScreen` | `VelaDestinations.SETTINGS`; wallet's 设置 tab pushes it |
| iOS (SwiftUI) | 18 across `Components/Settings/` | 28 in `SettingsGalleryScreen` | `AppRoute.settings`; wallet's 设置 tab pushes it |

**The bug this closed**: on all four clients the 设置 tab called `signOut()`,
because there was no settings screen to open. Tapping it to change a language
logged you out. 退出登录 now lives on its own row inside settings.

## i18n

56 new corpus keys × 15 locales (840 leaves). Roughly 200 strings these mocks
need were already in the corpus — the `settings.*` namespace, `settingsModals.*`,
`about.*`, `assets.rpcFix*`, `home.balanceDetail*`,
`componentsUi.bugReport.*` and `componentsUi.treasuryBootstrap.*` all describe
screens these mocks redraw.

New: `settings.storage.*` (24), `settings.networks.*` (5),
`settings.indexDown.*` (3), `settings.appearance.{themeTitle,textScale,avatarTitle}`,
`settings.account.contactsSubtitle`, `common.done`,
`settingsModals.addNetwork.{compatible,incompatible,checkSafe,checkSigner,checkRemaining}`,
`settingsModals.rpcProviders.avgLatency`,
`settingsModals.endpoints.selfHostGuide`, `assets.rpcFixRestored`,
`about.sectionLinks`, `home.balanceDetailUpdatedLabel`, and the six
`componentsUi.bugReport.preview*` labels.

All five root gates run: `gen:i18n` (pins 1419 → 1478 paths), `lint:i18n`
(`A5_count_without_plurals` baseline 239 → 329 — the corpus's existing
convention for `{{count}}` without CLDR plurals, deliberate), `verify:i18n`,
`dump:vectors`, the jest leaf pin (19,818 → 20,658) and `build:wasm`.

## Gates

- Root: `cargo test -p vela-core --features crux,i18n-all` — 37 suites, 0 failures.
- Web: `svelte-check` 0 errors · `pnpm lint` clean · `pnpm test:unit` 197 passed · `pnpm build` OK, all 38 states prerendered.
- Desktop: `cargo fmt` · `cargo clippy --all-targets` clean for the new files · `cargo test` 72 passed.
- Android: `:app:compileDebugKotlin` · `:app:testDebugUnitTest` — `SettingsFixturesTest` 15 passed (real engine, all 15 locales).
- iOS: `xcodebuild build` · `xcodebuild test` — `SettingsFixturesTests` passed.

## Visual verification

- **Web** — screenshotted ST1, ST1b, ST2, ST4, ST5, ST9, ST10c, ST13, ST15, ST16, SR2, SR5, DST1, DST3, DST4, DST4b, DST7 against the PNGs at 480×940 / 1280×800, dark.
- **iOS** — simulator screenshots of ST1, ST2, ST13, ST10c, SR2 (zh, dark).
- **Desktop** — launched `VELA_PAGE=settings`; DST1 verified on screen (light).
- **Android** — NOT eyeballed. The OnePlus 5T (`e93a3fa`) is pattern-locked and
  cannot be unlocked from here. It compiles, installs and its tests pass; a
  human needs to unlock the phone and run
  `adb shell am start -n app.getvela.wallet/.MainActivity --es vela.startDestination settings-gallery`.

## Deliberate calls worth a founder eye

1. **Currency names are provider data, not corpus copy.** The mock shows 美元 /
   欧元; the currency list is provider-driven (the FX endpoint decides which
   currencies exist), so their names live in the fixture layer in English rather
   than as 120 translated strings. Change this if the founder wants them
   translated — it is 8 × 15 new keys.
2. **`{{count}}` without plural forms.** The six new counting keys follow the
   corpus's existing convention (239 such keys already) rather than minting
   CLDR plural sets. The lint baseline records it.
3. **Desktop drops five phone-only strings.** `legend*`, `incompatible`,
   `online` and `networks.count` are resolved by the three mobile clients and
   NOT by the desktop, whose mocks do not draw them — resolving a key a screen
   never shows would be the desktop claiming copy it does not have.
4. **A `danger` button variant** was added to each platform's shared button
   (web `Button.svelte`, Android `VelaDangerButton`, iOS `VelaButton.Kind`,
   desktop inline). Accent stays reserved for value-moving actions.
5. **`VELA_SETTINGS_STATE`** (iOS) pins the gallery to one state, because the
   simulator has no tap API from a shell and a screenshot script could otherwise
   only ever see ST1.

## Follow-ups

- Wire real preferences (theme, language, text scale, formats) — the fixture
  layer is the only thing that has to change.
- Android device eyeball, once the phone is unlocked.
- The web `worker-configuration.d.ts` type warning and the Android
  `lintDebug` `NewApi` error both come from generated artifacts this worktree
  regenerates; neither is in CI and neither is this feature's.
