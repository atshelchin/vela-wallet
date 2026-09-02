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
- **Desktop** — all ten states (DST1–DST8, DST4b, DSR1) screenshotted by window id and compared to the PNGs, after the founder review below.
- **Android** — NOT eyeballed. The OnePlus 5T (`e93a3fa`) is pattern-locked and
  cannot be unlocked from here. It compiles, installs and its tests pass; a
  human needs to unlock the phone and run
  `adb shell am start -n app.getvela.wallet/.MainActivity --es vela.startDestination settings-gallery`.

## Founder review, 2026-09-02 — four desktop bugs

The founder opened DST7 in a wide window and it was visibly wrong. I had
screenshotted DST1 ONLY, in a narrower window, and read the gap as padding.
Four defects, all in the desktop panel:

1. **The panel was centred, not left-aligned.** `justify_center` on a fixed
   640 column: nearly flush at the 1280 the mocks are drawn at, and a gap the
   width of the nav column at 2000. The wallet's own content column has always
   been `flex_1 + px`; the panel now matches it, padded 48 with the content
   capped at 640 (measured off DST7: the storage bar runs 505 -> 1146).
2. **The nav column stopped at its last row.** `h_full` without `flex()` does
   not resolve in gpui, so the 216px column's background and right border
   ended under 关于 and the rest of the height was panel. `sidebar()` had
   `.flex()` all along; this did not.
3. **The open dropdown was painted over.** gpui paints in child order, so a
   menu opened inside form row 2 was covered by rows 3 and 4 — the date and
   time triggers sat on top of it and one option was invisible. Now
   `deferred(...).with_priority(1)`, the same escape the contacts menus use.
4. **The expanded row's caret pointed the wrong way**, and About had no brand
   mark.

Two process fixes came out of it, both worth keeping:

- `VELA_SETTINGS_STATE=dst7` picks the panel, so a screenshot pass can cover
  all ten desktop states instead of whichever one opens first. iOS grew the
  same seam for the same reason.
- Screenshots are taken by CGWindowID (`screencapture -l`), not by screen
  region — a full-screen grab caught whatever window had focus, which on a
  busy machine was usually somebody else's.

All ten desktop states re-verified after the fix.

## Device sweep, 2026-09-02 — Android, and five more bugs

The Android device had never been looked at. A Xiaomi alioth (392dp x 872dp,
font scale 1.0 — near enough the mocks' 392x844 to compare directly) made all
28 mobile states screenshottable, and five defects came out of it. Four are
Android's; the fifth was on three clients at once.

1. **The account switcher dropped the identicon and the address.** ST2 reused
   the generic `VelaSelectRow` — a label and a note — so a model that already
   carried `addressFull` and `addressDisplay` rendered as three bare names with
   no way to tell which key each one is. Now its own row.
2. **Sheets had no ✕.** `closeLabel` was in the model and never drawn. It now
   lives in the sheet host rather than in each body, so no sheet can forget it.
3. **Sheets did not scroll.** Fifteen locales are taller than the screen: four
   languages and the whole contribute footer were simply unreachable — you
   could not pick German. Fixed with a height cap on the host plus
   `verticalScroll`; the cap is the load-bearing half, since a wrap-height
   column has no overflow to scroll and `verticalScroll` alone did nothing.
4. **"清除全部缓存" was left-aligned**, reading as one more row in the list
   above it rather than as the group's action.
5. **"较慢" was hard-coded** in the Android, iOS and web fixtures, so every
   non-Chinese reader saw Chinese on the fiat-rates pill; desktop had no prefix
   at all, leaving an amber "1.2s" to explain itself. New corpus key
   `settings.networks.slow` across 15 locales, wired on all four.

Two harness lessons, both of which produced a wrong "verified" before they were
caught:

- **A screenshot of a launching app is a screenshot of the splash.** The first
  sweep slept 1.6s and filed ten splash screens as states — visible only
  because their file sizes clustered. Captures now wait for two identical
  consecutive frames.
- **`gradle … | head -5` kills the build.** `head` closes the pipe, gradle
  takes the SIGPIPE, and `adb install` cheerfully reports Success for the APK
  already on disk. Two rounds of "the fix didn't work" were a stale APK. Build
  output goes to a file now, and the APK's mtime is checked against the source.

`vela.settingsState`, `vela.settingsDark` and `vela.skipLaunchAnimation` make
each Android state a one-line launch — the same seam iOS and desktop have.

Gates after the fixes: vela-core `cargo test --features crux,i18n-all` green;
Android 79 unit tests; desktop fmt/clippy/72 tests; web check + lint + 41
tests; iOS `xcodebuild test` exit 0. Android `lintDebug` reports 3 NewApi
errors inside the generated `rust/bindings/kotlin` uniffi file — pre-existing,
not from this work.

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
