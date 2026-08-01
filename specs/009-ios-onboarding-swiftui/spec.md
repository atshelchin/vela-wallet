# Feature Specification: iOS Onboarding in SwiftUI

**Feature Branch**: `009-ios-onboarding-swiftui`

**Created**: 2026-08-01

**Status**: Draft → implementation on this branch

**Input**: User description: "Create a new development branch and rewrite the
VelaWallet iOS client in `app-ios/VelaWallet` using SwiftUI. First release
implements only the mobile Onboarding flow and the reusable foundation
(navigation, state, localization) later pages will sit on. iOS phone only — no
iPad/macOS adaptation. Adopt `design-system.md` as the sole design authority
(mocks at `design/onboarding` as reference; where mock and system conflict, the
system wins and the difference is recorded). Full light + dark support; no
hardcoded color/font/spacing/radius/shadow in page code — tokens centralized and
reused. i18n via the existing capability in `rust/crates/vela-core`; no
user-visible string may live in view code. High cohesion / low coupling: design
tokens, shared components, page logic, navigation and localization each in their
own layer, one authoritative implementation per capability. Ship with tests or
SwiftUI Previews for key components and state logic."

## Why

`app-ios/VelaWallet` is today a pristine Xcode template, while the platforms
around it have already proven the shared core this feature consumes: spec 006
rendered this exact welcome content on web through `vela-core`'s wasm build, and
spec 007 rendered it on desktop through a direct Rust dependency. iOS is the
platform specs 003/004 explicitly reserved for the third consumption route —
uniffi Swift bindings — and that route is generated and CI-checked today but has
never fed a real app. Every existing `onboarding.welcome.*` string, all 15
locales, and the canonical token export are already in the repo; this feature is
where they finally meet UIKit-free native code.

Onboarding is the right first screen for the same reason it was on web and
desktop: it is the highest-stakes copy in the product, it needs no wallet state,
indexer or RPC, and it is where the design system either takes hold or dies —
the first SwiftUI screen written without tokens becomes the template for every
hardcoded screen after it.

## User Scenarios & Testing

### User Story 1 - See and understand the welcome screen (Priority: P1)

A new user launches Vela Wallet on an iPhone. Without scrolling they see the
Vela mark and "Vela Wallet" wordmark on one row, the tagline, one numbered
feature card with a six-dot pager, and — anchored at the bottom — a primary
"Create Wallet" button and a secondary "I already have a wallet" button. The
screen renders in the user's system appearance and language.

**Why this priority**: This screen is the product's front door and the proof
that tokens, theming and localization work end-to-end; every other story
builds on it.

**Independent Test**: Launch the app on a simulator in light and dark, in `zh`
and `en`; compare against the W1L/W1 mocks.

**Acceptance Scenarios**:

1. **Given** an iPhone in dark appearance, **when** the app launches, **then**
   the screen reproduces mock `W1 Welcome _ default.png`: near-black base,
   raised feature card, orange primary button, outlined secondary button,
   light foreground text.
2. **Given** an iPhone in light appearance, **when** the app launches, **then**
   the screen reproduces mock `W1L Welcome _ light.png`: warm off-white base,
   white raised card, same accent orange, dark foreground text.
3. **Given** the app is running, **when** the system appearance changes,
   **then** the screen restyles to the other theme without relaunch.
4. **Given** the device language is any of the 15 supported locales, **when**
   the app launches, **then** every visible string — tagline, card title and
   body, both buttons — is that locale's translation; an unsupported device
   language falls back to English, never a mixed-language screen.

---

### User Story 2 - Explore the six feature cards (Priority: P2)

The user swipes through six numbered cards ("01"–"06") explaining what makes
this wallet different: no seed phrase, one address across 12+ networks, open
source and self-hostable, keys living in the password manager, audited Safe
contracts, gas paid in stablecoins. The dot pager tracks position and jumps to
a card when tapped.

**Why this priority**: The cards carry the trust-building copy, but the screen
is already understandable and actionable with the first card alone.

**Independent Test**: Swipe through all six cards and tap arbitrary dots;
verify numerals, pager state and card copy in two locales.

**Acceptance Scenarios**:

1. **Given** the welcome screen, **when** the user swipes the card left/right,
   **then** the next/previous card snaps into place and the active dot moves
   with it; there is no autoplay.
2. **Given** any card is showing, **when** the user taps another dot, **then**
   the carousel moves to that card and the tapped dot becomes active (accent
   colored, pill-widened; inactive dots stay subtle).
3. **Given** the last card ("06"), **when** the user swipes forward, **then**
   the carousel stops (no wrap-around), matching the web behaviour.

---

### User Story 3 - Choose a path (Priority: P3)

The user taps "Create Wallet" or "I already have a wallet". Each press gives
visible feedback and navigates to a minimal placeholder screen for that intent
— wallet creation and import themselves are later features — proving the
navigation layer future pages will use.

**Why this priority**: Intent routing is the bridge to every subsequent
feature, but it carries no user value until those flows exist.

**Acceptance Scenarios**:

1. **Given** the welcome screen, **when** either CTA is pressed, **then** its
   pressed state shows, and release navigates to the matching placeholder
   screen, from which the user can return to Welcome.
2. **Given** the placeholder screens, **then** their titles resolve through the
   same localization path as the welcome screen (no hardcoded strings).

---

### Edge Cases

- Small phone (iPhone SE class): brand row, tagline, card, pager and both CTAs
  remain visible without scrolling; the card area compresses before the CTAs
  do. Text wraps rather than truncates.
- Long-copy locales (de, ru): card height is driven by the tallest line count;
  text wraps, nothing clips, CTA stack never moves off-screen.
- System Dynamic Type at large accessibility sizes: type scales from the token
  roles, layout wraps or scrolls, never clips; the two CTAs remain reachable.
- Unsupported device language (e.g. `ar`, `hi`): resolves through the same
  negotiation ladder the other platforms use and lands on `en`. All 15
  supported locales are left-to-right; RTL layout is explicitly untested.
- Relaunch mid-carousel: no onboarding state persists (parity with 006/007 —
  no "completed" flag exists anywhere yet); the screen opens on card "01".
- VoiceOver: cards read number, title, body; pager dots are buttons ("page N
  of 6" semantics); both CTAs are buttons with their localized labels.

## Requirements

### Functional

- **FR-001**: The app MUST render the mobile welcome screen in SwiftUI,
  reproducing the W1/W1L mocks' layout: centered brand row (mark + wordmark),
  tagline, single-card feature carousel with six-dot pager, bottom-anchored
  primary + secondary CTA stack. Geometry is exact at the 390×844 design frame
  and flexes to other iPhone sizes.
- **FR-002**: All colors, type, spacing, radii, shadows, opacities and motion
  durations MUST be referenced through a single token layer whose values derive
  from the canonical Penpot export (`docs/design-tokens.json`, sets `core` +
  `color-light`/`color-dark`), with a drift gate so regeneration is a no-op.
  Values the export lacks (e.g. control heights, on-accent color, typography
  composites) live in one explicit, documented additions block licensed by
  `design-system.md` — never inline in component or page code. Desktop's
  mock-sampled deviations (`theme.rs`) are NOT inherited.
- **FR-003**: Light and dark themes MUST both be provided and follow the system
  appearance at launch and on change. A development override (launch argument
  or scheme setting) MUST exist for screenshot verification of either theme.
- **FR-004**: Interaction states (pressed, disabled) MUST be defined per
  component in both themes with equivalent affordance strength; touch targets
  MUST be at least 44 pt (pager dots get an expanded hit area even though the
  dots draw smaller).
- **FR-005**: Every user-visible string MUST resolve through `vela-core`'s
  `I18n` engine, consumed via its uniffi Swift bindings — the same engine and
  corpus the web and desktop apps use. Card numerals ("01"–"06") are generated,
  not translated. The wordmark "Vela Wallet" is a proper name and renders
  verbatim. A raw key on screen (e.g. `onboarding.welcome…`) is the visible
  failure signal.
- **FR-006**: The screen MUST reuse the existing corpus keys — the six feature
  title/body pairs and CTAs from `onboarding.welcome.*` and the one-line
  tagline already present in all 15 locales. No new keys and no third
  near-duplicate key family may be introduced; if a key rename is ever wanted
  it is a separate corpus change.
- **FR-007**: The active locale MUST be resolved at launch from the iOS
  preferred-languages list through the same base-language mapping the other
  platforms use (zh-Hant/TW/HK/MO handling, `es-*`→`es-MX`, `pt-*`→`pt-BR`,
  `in`→`id`, unsupported→`en`), then through `vela-core`'s resolver, with
  English as the pinned fallback.
- **FR-008**: The Vela mark MUST be drawn from the design geometry of
  `logo-light.svg`/`logo-dark.svg` — hull themed per mode, orange + peach sails
  identical in both modes — not from a rasterized asset.
- **FR-009**: Capabilities MUST live in dedicated layers with one authoritative
  implementation each: the token/theme layer is the only place naming visual
  values; the localization layer is the only i18n touchpoint; shared components
  (button, feature card, pager, brand row) take theme + pre-resolved strings;
  the onboarding feature owns only composition and intent; the app layer owns
  entry and navigation.
- **FR-010**: Both CTAs MUST route through a single intent handler
  (create-wallet / import-wallet) that drives navigation to placeholder
  destinations, so later features attach real flows without touching the
  welcome components.
- **FR-011**: The change set MUST NOT touch unrelated surfaces: no edits to RN
  app source, web, desktop, Android, or `vela-core`'s Rust logic. Additions on
  the Rust side are limited to build/packaging tooling for the existing uniffi
  bindings (no API changes).
- **FR-012**: Key components and state logic (carousel/pager state, locale
  resolution, intent routing, token integrity) MUST ship with unit tests and/or
  SwiftUI Previews; token-derived contrast MUST be executable as a test.

### Deviations from the mocks and design system (deliberate)

- **DV-001** *(carried from 007)*: The dark mock renders the secondary button
  label at ≈2:1 contrast. The implementation uses the dark-theme primary
  foreground for the label and keeps the mock's outline tone.
- **DV-002** *(carried from 006/007, founder 2026-08-01)*: The passkey-index
  service link that appears in the dark desktop mock does not exist on this
  screen; its entry point belongs to a future settings screen. (The W1 mobile
  mocks never had it.)
- **DV-003**: `design-system.md` names Plus Jakarta Sans with Noto Sans SC as
  CJK fallback. The app bundles Plus Jakarta Sans (as web does) but does not
  bundle Noto Sans SC; CJK text renders in the iOS system font — exactly how
  the shipped RN app behaves today. Revisit if brand mandates a bundled CJK
  face. The mono-font conflict (JetBrains vs IBM Plex vs Menlo) is noted but
  moot: this screen uses no mono text.
- **DV-004** *(carried from 006/007)*: The primary CTA renders its label on the
  brand accent `#E8572A` at ≈3.6:1 — the mock's own pairing on every Vela
  platform. Founder decision on the pairing is still pending; the contrast test
  pins these pairs at a 3.0 floor and this deviation records why. All other
  text meets AA-normal (4.5:1).

### Key Entities

- **Onboarding intent**: the user's chosen path — create wallet or import
  wallet; recorded by one handler, consumed by navigation.
- **Feature card content**: six ordered items (number, title, body) resolved
  from the corpus at render time; order is fixed by the design, numerals
  generated.
- **Locale state**: the resolved language and its catalog residency; owned by
  the localization layer, never duplicated per screen.
- **Theme**: the active semantic palette (light or dark) plus mode-invariant
  core scales; owned by the token layer.

## Success Criteria

- **SC-001**: The app target and its unit tests build and pass cleanly for an
  iOS simulator from a clean checkout (one documented command); the existing
  repo test suites remain green.
- **SC-002**: Screenshots of the running app — dark/zh against W1 and light/zh
  against W1L — match in layout order, card and button geometry, palette
  (spot-checked at 8 reference points) and copy; en and de verified for
  no-clipping. Theme/locale forced via the FR-003 override.
- **SC-003**: Regenerating the token layer from `docs/design-tokens.json`
  immediately followed by `git diff` shows no drift, and an automated literal
  audit finds no color/size/radius/shadow/font literals outside the token
  layer's files.
- **SC-004**: Switching device language across `en`, `zh`, `de` changes every
  string on screen with no key echoes and no English bleed-through in the
  non-English locales.
- **SC-005**: All text/background pairs in both themes measure ≥4.5:1, except
  the accent pairs covered by DV-004 which measure ≥3:1 — computed from the
  token values as an executable test, not by eye.
- **SC-006**: `git diff --stat` against the branch point shows changes confined
  to `app-ios/`, `specs/009-…/`, `design/onboarding/` (committing the
  previously untracked iOS prompt), and any new Rust build-tooling scripts —
  nothing else.

## Out of scope

- Wallet creation, import/recovery, passkey ceremonies — the placeholder
  screens record intent only.
- Any other iOS screen; iPad or macOS layouts (the target is iPhone-only);
  widgets, app icon rework, store assets.
- In-app language or theme pickers and the app-level text-scale setting from
  `design-system.md` (system appearance + system Dynamic Type only, this
  release).
- Entrance/press spring animations beyond standard paging and pressed states —
  same polish deferral as 007.
- CI wiring for `app-ios` (no workflow builds it today; adding one is separate
  work).
- Replacing or migrating the Expo/RN iOS app; both projects share a bundle id
  during development and store submission strategy stays a later decision.

## Assumptions

- The single Welcome screen IS the complete onboarding flow: the mocks and
  specs 006/007 define no additional steps and no back/skip/finish controls
  beyond carousel paging and the two CTAs; none are invented here, and no
  "onboarding completed" flag is persisted (006/007 parity).
- The one-line tagline shown in the W1/W1L mobile mocks ("Your keys, your
  assets") is the correct tagline for iOS, reusing its existing corpus key
  as-is; the RN app's two-line tagline stays untouched.
- The deployment target is deliberately lowered from the template default
  (iOS 26.2) to a broadly available modern baseline chosen in the plan, since
  a wallet meant for real devices cannot require the newest OS.
- The 13 non-en/zh locale translations inherit the corpus's standing
  best-effort status (spec 005 human-review sweep pending); iOS ships them
  as-is.
- The uniffi Swift bindings already exported by `vela-core-uniffi` are the
  supported native surface (specs 003/004); this feature adds packaging, not
  API.
- Development happens against the local toolchain (Xcode + Rust with iOS
  targets); reproducibility is documented in the plan's quickstart rather than
  enforced by CI in this feature.
