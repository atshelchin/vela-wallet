# Feature Specification: Desktop Onboarding in GPUI

**Feature Branch**: `007-desktop-onboarding-gpui`

**Created**: 2026-08-01

**Status**: Draft → implementation on this branch

**Input**: User description: "Create a new branch and rewrite the Vela Wallet desktop
UI in GPUI under `app-desktop/vela-wallet`. First release implements only the
Onboarding page; no mobile adaptation. Support light and dark modes with consistent
colors, contrast and interaction states. Design source:
`design/onboarding` (D1/D1L desktop mocks). GPUI patterns may follow
`/Volumes/data/production/gpui-demo`. Requirements: (1) adopt `DESIGN_SYSTEM.md`,
abstracting color/type/spacing/radius/shadow/component states into design tokens and
reusable components; (2) use the existing i18n/l10n capability in
`rust/crates/vela-core` — no user-visible string may be hardcoded; (3) reproduce the
mock's layout, hierarchy and interaction feedback as closely as possible;
(4) high cohesion / low coupling — visual components, theme logic, localization
logic and page logic each in their own place, no duplicated colors/copy/logic,
clear module boundaries; (5) keep the change focused on Onboarding and its
necessary infrastructure."

## Why

`app-desktop/vela-wallet` is today a hello-world scaffold, while specs 001/004 built
exactly the shared core a desktop app is supposed to sit on: `vela-core` already
resolves 15 locales' translations byte-identically to i18next (spec 004), and the
translation corpus already contains the full `onboarding` namespace. Every week the
desktop shell stays empty is a week the "one core, every platform" promise of
feature 001/004 goes unexercised on the platform that consumes it with the fewest
layers (direct Rust dependency — no uniffi, no wasm).

Onboarding is the right first screen for the same reason it was the RN app's first
screen: it is the highest-stakes copy in the product (what a passkey is, where the
key lives, what Safe contracts mean) rendered before any wallet state exists, so it
can ship without indexers, RPC or storage. And it is where a design system either
takes hold or dies: the first screen written without tokens becomes the template for
every hardcoded screen after it.

## User Scenarios & Testing

### Primary user story

A new user launches Vela Wallet on macOS. They see the welcome screen: the Vela
mark and wordmark, the tagline, six feature cards explaining what makes this wallet
different, and — separated in an action panel — a primary "Create Wallet" button
and a secondary "I already have a wallet" button. The screen renders in the user's
system appearance (light or dark) and in their language. Hovering any interactive
element gives visible feedback; clicking records the chosen intent (wallet creation
itself is a later feature).

### Acceptance scenarios

1. **Given** macOS in light appearance, **when** the app launches, **then** the
   window reproduces mock `D1L Welcome _ desktop light.png`: warm base background,
   white action panel right of a 1 px edge, orange primary button, outlined
   secondary button, six white feature cards in a 3×2 grid.
2. **Given** macOS in dark appearance, **when** the app launches, **then** the
   window reproduces mock `D1 Welcome _ desktop dark.png`: `#141412` base, raised
   `#1E1E1B` panel and cards, same accent orange, light foreground text.
3. **Given** the app is running, **when** the system appearance changes, **then**
   the window restyles to the other theme without restart.
4. **Given** `VELA_LANG=zh` (or a zh system locale), **when** the app launches,
   **then** every visible string is the Simplified Chinese translation — including
   the six feature cards — and **when** the language is any of the other 14
   supported locales, its translation shows instead, falling back to English only
   for locales outside the supported set.
5. **Given** any interactive element (the two buttons), **when** the pointer
   hovers it, **then** its documented hover state shows and the cursor becomes a
   pointer; **when** pressed, its active state shows.
6. **Given** either theme, **then** every text/background pair on the screen meets
   WCAG AA contrast (≥ 4.5:1 body, ≥ 3:1 large text), except the primary CTA
   label, which sits on the brand accent at 3.6:1 in both themes (→ DV-004).

### Edge cases

- Window resized: the two-column split holds — the action panel stays fixed-width
  and the left column takes the rest; the three cards of each row flex equally to
  fill it (204 px is the design-size floor, reached exactly at the 1280 minimum).
  Text wraps rather than truncates mid-glyph.
- A locale whose card copy runs long (de, ru): card height is driven by the tallest
  card in the row, text wraps, nothing clips.
- `VELA_LANG` set to an unsupported tag: resolves through `vela-core`'s
  `resolve_language` ladder and lands on `en`, never a mixed-language screen.
- `VELA_THEME` set to `light`/`dark` overrides system appearance (development and
  screenshot-verification hook; absent means follow the system).

## Requirements

### Functional

- **FR-001**: The desktop app MUST render the Onboarding welcome screen in GPUI,
  reproducing the D1/D1L mocks' layout: brand row, tagline, 3×2 feature-card grid
  on the left; action panel (primary CTA, secondary CTA) on the right. The card
  grid flexes with the window width (user direction, 2026-08-01); the mock's
  geometry is exact at the 1280×800 design size.
- **FR-002**: All colors, type sizes/weights, spacing, radii and shadows MUST be
  referenced through a single theme/token module. No raw hex or magic size in page
  or component code.
- **FR-003**: Light and dark themes MUST both be provided; the active theme MUST
  follow the OS appearance at launch and on change, with `VELA_THEME` as an
  explicit override.
- **FR-004**: Interaction states (hover, active, disabled where applicable) MUST be
  defined per component in both themes, with equivalent affordance strength.
- **FR-005**: Every user-visible string MUST resolve through `vela-core`'s `I18n`
  engine from the `onboarding` namespace. Card numerals ("01"–"06") are generated,
  not translated. The brand wordmark "Vela Wallet" is a proper name and renders
  verbatim.
- **FR-006**: New strings required by the desktop welcome screen (tagline variant,
  six card titles+bodies — 13 keys) MUST be added to the
  corpus source of truth (`rust/crates/vela-core/i18n/locales/`) for **all 15
  locales**, and all generated artefacts (path table, per-locale catalogs,
  `resources.ts`, `public/i18n/*.json`) regenerated via `scripts/gen-i18n.mjs`
  with zero hand edits to generated files.
- **FR-007**: The active language MUST be resolved at launch from `VELA_LANG`,
  then `LC_ALL`/`LC_MESSAGES`/`LANG`, through `vela_core::i18n::resolve_language`;
  unresolvable tags fall back to `en`.
- **FR-008**: The Vela mark MUST be drawn from the design geometry (the three
  paths of `logo-light.svg`/`logo-dark.svg`), hull color themed per mode, sails
  identical in both modes.
- **FR-009**: Reusable pieces (buttons, feature card, logo, theme, i18n access)
  MUST live in dedicated modules, separate from the page; the page module owns
  only composition and interaction intent.
- **FR-010**: Clicking either CTA MUST route through a single page-level intent
  handler (stubbed: logged), so later features attach navigation without touching
  components.
- **FR-011**: The change set MUST NOT touch unrelated app surfaces: no edits to
  RN app source (beyond generated i18n artefacts), web, iOS, Android, or other
  `vela-core` modules.

### Deviations from the mocks (deliberate)

- **DV-001**: The dark mock renders the secondary button label at ≈ 2:1 contrast
  (`#554B46`-toned text on `#1E1E1B`). This fails the input's own "consistent
  contrast across modes" requirement and WCAG AA; the implementation uses the
  dark-theme primary foreground (`#E8E6E1`) for the label, keeping the mock's
  `#554B46` for the outline.
- **DV-002**: The dark mock shows a divider + passkey-index link below the
  secondary button; the light mock omits them. Initially implemented in both
  themes for parity, then **removed entirely at user direction (2026-08-01)** —
  the passkey-index entry point will live in the settings screen instead. The
  `setupPasskeyIndex` translation key was removed with it (the reviewed
  translations for all 15 locales are preserved in this branch's history).
- **DV-004**: The primary CTA renders its 16 px semibold label in white on the
  brand accent `#E8572A` — 3.6:1, which meets WCAG AA only under the large-text
  rule. This is the mock's own pairing and the accent used on every Vela
  platform; recoloring the brand or inflating the label to 19 px+ were both
  rejected. The contrast test pins the pair at a 3.0 floor and this deviation
  records why. All other text meets AA-normal (4.5:1).

- **DV-003**: The mock's display typeface (a geometric rounded sans) is not
  identified in the repo and ships no license; the system font stack renders all
  text (matches `DESIGN_SYSTEM.md` §2.1 "System" for UI text). Revisit if brand
  supplies a font file.

### Success criteria

- **SC-001**: `cargo build` + `cargo clippy` clean for `app-desktop/vela-wallet`
  (no warnings from the new code) at the pinned gpui revision.
- **SC-002**: Screenshot of the running app in light/zh matches D1L and dark/zh
  matches D1 in: column split position, card grid geometry, button geometry,
  palette (spot-checked hex at 8 reference points), copy. *(Execution note:
  screenshots require Screen Recording permission the host process does not
  have; tasks.md T017 records the equivalent evidence used and how to re-run
  the pixel pass once permission is granted.)*
- **SC-003**: `node scripts/gen-i18n.mjs` immediately followed by `git diff` shows
  no drift (generator output committed exactly);
  `cargo test -p vela-core --features i18n-all` remains green after the corpus
  gains the 13 keys × 15 locales (the conformance corpus needs the compiled-in
  catalogs, so the feature flag is part of the command).
- **SC-004**: Every string on screen changes when `VELA_LANG` switches between
  `en`, `zh`, and one non-CJK locale (`de`), with no key echoes (raw
  `onboarding.…` text) visible.
- **SC-005**: All text/background pairs in both themes measure ≥ 4.5:1 (body),
  except the accent-button pairs covered by DV-004 which measure ≥ 3:1;
  computed from the theme tokens (executable as `theme::tests`).

## Out of scope

- Wallet creation, sign-in, passkey ceremonies (webauthn), the passkey-index
  settings sheet the link will eventually open — the link records intent only.
- Any other desktop screen; mobile/responsive layouts; Windows/Linux window-chrome
  polish (the code compiles for macOS first; gpui abstracts the rest).
- In-app language or theme pickers (system + env override only, this release).
- Entrance/press animations from `DESIGN_SYSTEM.md` §7 (spring press scale,
  FadeInDown). GPUI supports them, but they are polish on top of this spec's
  scope; tracked as follow-up.

## Assumptions

- The gpui git revision pinned by `gpui-demo`'s lockfile (`c97b7c0`) is the
  reference API; the lockfile is committed to keep it reproducible.
- Desktop binary size is not budget-constrained, so all 15 locale catalogs compile
  in via the `i18n-all` feature (spec 004 explicitly reserves compiled-in catalogs
  for platforms "where there is no wire").
- macOS system locale detection via environment variables is acceptable for this
  release; native `NSLocale` integration arrives with the settings screen.
