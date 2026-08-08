# Contract — presentation states, components, containers, galleries (spec 014)

Cross-platform contract. Shapes are defined in `../data-model.md`; this file pins the
per-platform surfaces so the four implementations stay aligned and later crux wiring is
mechanical.

## 1. State model (per platform, same vocabulary)

| Concern | web | iOS | Android | desktop |
| --- | --- | --- | --- | --- |
| Types | `src/lib/onboarding/states.ts` (discriminated unions) | `Features/Onboarding/FlowStates.swift` (enums + assoc. values) | `feature/onboarding/flow/FlowStates.kt` (sealed interfaces) | `src/onboarding_flow.rs` (enums) |
| Outcome catalog (`kind → OutcomeSpec`) | `src/lib/onboarding/outcomes.ts` | `FlowStates.swift` (`OutcomeKind.spec`) | `FlowStates.kt` (`OutcomeKind.spec()`) | `onboarding_flow.rs` (`OutcomeKind::spec`) |
| Fixtures (35, codes A1…E10) | `src/lib/onboarding/fixtures.ts` | `Features/Onboarding/FlowFixtures.swift` | `feature/onboarding/flow/FlowFixtures.kt` | `onboarding_flow.rs::fixtures` |
| Fixture-count test | vitest (server project) | Swift Testing (`@MainActor` if it touches Loc) | JUnit (JVM) | `#[test]` |

Fixture ids are the design codes verbatim: `A1 A2 A3 A4 A4c A5 A5c A6 A6c A7 A7c A8 A8c
A11 A12 A13 E1 E2 E2x E3 E4 E5 E6 E7 E8 E9 E10 B1 B1c B2 B3 B4 B5 B6` — 34 entries; E10
appears once but is listed in both flows' gallery sections (spec counts 35 mock files;
`E10` file exists in both directories with one rendering). The count test asserts the set
above (34 unique) and the gallery asserts E10 is reachable from both flow groups.

The A11 address fixture is the full 42-char
`0x44EEC06897ff7ab8C7f16819511A64bA168A6D33` (display truncates tail per mock; copy
copies the full value). E2x TechDetails fixture: code `E_SERVER`, context
`第 5 步同步公钥；以及登录`, endpoint `HTTP 503 · p256-index.getvela.app`. Ring fixtures:
A4c=19, A8c=8, B1c=41, others 4–12 (any 1–2 digit value).

## 2. Action sink

Every action press emits `(fixture_code_or_state, ActionId)` to a host-provided sink.
Production hosts (Welcome) route ALL ids to no-op-log + `close` semantics for
`back`/`cancel`/`not_now`; gallery hosts may switch fixtures. ActionIds (shared enum):
`submit_create, enter_wallet, finish_verify, start_over_new_passkey, retry, retry_upload,
retry_verify, retry_login, recreate_wallet, create_new_wallet, recover_now, not_now,
edit_index_endpoint, report_error, open_biometric_settings,
open_credential_manager_settings, back, cancel, close, copy_address,
toggle_details, open_privacy_policy, open_terms`.

## 3. Container behaviour

| Platform | Container | Open | Close |
| --- | --- | --- | --- |
| iOS | `.sheet` + drag indicator + content-height detent, bg `theme.bgRaised` | Welcome intents present sheet with initial state (create→`Form` empty, login→`Waiting{nil}`) | swipe / × / scrim per system; restores Welcome untouched |
| Android | M3 `ModalBottomSheet` (ThemeSettingsSheet pattern), `containerColor = colors.bgRaised` | same | system dismiss + × |
| web < 1280 | `Sheet.svelte` overlay: fixed inset, backdrop `--color-fixed-backdrop`, panel `--color-bg-raised`, radius `--radius-xl` top corners, enter/exit `--motion-sheet-in/out`, focus-trapped, `aria-modal` | Welcome buttons (no navigation) | × / backdrop / Esc |
| web ≥ 1280 | in-place swap of `.actions` aside content; hairline + bg unchanged; welcome hero column must not reflow | same buttons | × restores CTA stack |
| desktop | swap inside `action_panel` (512px col); no modal; welcome left column untouched | `Intent::CreateWallet/RecoverWallet` set page field | × resets field |

Shared scaffold anatomy (all containers): [handle (sheet only)] → header row: title
(leading) + close × (trailing, a11y `onboarding.common.close`) → divider → pattern
content. Title per state (`scaffold_title`). Disclosure expansion grows height in place;
sheets re-measure detent.

## 4. Gallery contract

| Platform | Entry | Gate | Theme toggle | Locale |
| --- | --- | --- | --- | --- |
| web | `/dev/gallery` | `+page.server.ts`: `if (!dev) error(404)`; `prerender = false`; strings from `public/i18n/*.json` raw glob (NO `engine.server.ts` import anywhere in the route) | sets `documentElement.dataset.theme` | picker ≥ `zh, en` |
| iOS | `GalleryScreen` | `#if DEBUG` + env `VELA_GALLERY=1` (read via static enum, launched `SIMCTL_CHILD_VELA_GALLERY=1`) | in-gallery toggle re-applies `.themed(...)` | device/`VELA_LANG` |
| Android | `GalleryScreen` composable | intent extra `--ez vela.gallery true` (MainActivity house pattern) | in-gallery toggle wraps `VelaTheme(darkTheme=…)` | device locale |
| desktop | gallery view in main window | env `VELA_GALLERY=1` | existing `VELA_THEME` (relaunch acceptable) + in-gallery toggle if trivial | `VELA_LANG` |

Gallery MUST: list fixtures grouped Create / Login (E10 in both groups), render the
selected fixture inside the platform's real container component (sheet on mobile,
panel on desktop/web-wide), and expose every fixture without code changes (data-driven
from the fixture table). Gallery MUST NOT: ship in release (web: 404 in prod build;
iOS: not compiled; Android: unreachable without adb extra; desktop: env-gated),
perform any I/O beyond clipboard copy.

## 5. Fidelity anchors (from mocks, token names per platform)

- Form field: raised dark input on `bg_sunken`-style well, focus ring per platform
  convention; error border/hint in `error.base` (A3: field border tints error).
- Ack checkbox: unchecked = hairline square (`border.strong`), checked = accent fill +
  white ✓; row text `fg_muted`; links in `accent.base`.
- Primary CTA disabled = accent at reduced emphasis (mock A1: dimmed accent, label muted)
  — implement with the platform's disabled treatment (`Opacity.disabled` ≈ 0.45), never a
  gray fill.
- Step bar: 5 equal segments, gap ~space-sm; filled = `accent.base`, rest =
  `border.base`-level neutral; login variant = single track, ~40% filled accent.
- Badge circle ≈ 56px (`emptyStateCircle` on Android; geometry const elsewhere); tint =
  variant `soft` bg + `base` glyph (see data-model §3 table).
- TechDetails expanded: code block on `bg_sunken`, radius lg; first line `error.base`,
  context `fg_muted`, endpoint `fg_subtle`/mono.
- Address strip: full-width `bg_sunken` rounded row, mono/tabular text, tail-truncated,
  trailing copy affordance.
- Action stack: primary (existing button) then secondaries as dark filled rows
  (`bg_raised`-elevated / hairline), full width, stacked with space-md gaps — secondaries
  are NOT the outline welcome-secondary style; they are the mock's dark solid rows.
  One shared `ActionStack` decides this styling per platform.

## 6. Accessibility floor (FR-017)

Close/copy/checkbox/disclosure carry localized labels (`common.close`,
`common.copyAddress`, ack row text, `create.technicalDetails`); disclosure exposes
expanded state; ring exposes `common.waitedSeconds`; links individually focusable;
sheet focus is trapped and restored on dismiss (web), standard system behaviour
elsewhere.
