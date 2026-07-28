# Vela Wallet — UI Primitives Spec (02)

Scope: every file in `src/components/ui/` (40 files) plus `src/components/themed-text.tsx`, `themed-view.tsx`, `animated-icon.tsx` / `animated-icon.web.tsx`.
Purpose: source-of-truth input for a Penpot component library (variant axes proposed per component). Visual + structural + behavioral only; RN implementation trivia omitted except where it encodes design behavior.

Authoritative style docs: `docs/DESIGN-LANGUAGE.md` (CONFIRMED current: de-containered, hairline dividers, open heroes) overrides `DESIGN_SYSTEM.md` where they conflict. Conflicts found are flagged in §Z.

---

## 0. Token quick reference (from `src/constants/theme.ts`)

All components reference these tokens. Values below are the ground truth (DESIGN_SYSTEM.md has stale hexes — see §Z).

### 0.1 Color (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `fg.base` | `#1A1A18` | `#E8E6E1` | primary text, icons |
| `fg.muted` | `#6E6B62` | `#9A9790` | secondary text (WCAG ≥4.5:1 body) |
| `fg.subtle` | `#8C887E` | `#85827A` | tertiary/placeholder/disabled (≥3:1) |
| `fg.inverse` | `#FFFFFF` | `#1A1A18` | text on dark/accent fills |
| `bg.base` | `#FAFAF8` | `#141412` | page background |
| `bg.raised` | `#FFFFFF` | `#1E1E1B` | cards, chips, modal knobs |
| `bg.sunken` | `#F5F3EF` | `#0F0F0D` | inset areas, soft chips, inputs |
| `accent.base` | `#E8572A` | `#E8572A` (same) | CTAs, commit, selection checks |
| `accent.soft` | `#FFF0EB` | `#2C1A12` | accent-tinted circles/badges |
| `success.base` | `#2D8E5F` | `#3DA872` | incoming, confirmed |
| `success.soft` | `#EDFAF2` | `#132A1E` | success washes |
| `warning.base` | `#92600A` | `#D4A54A` | pending, degraded states |
| `warning.soft` | `#FFF8F0` | `#2A2010` | warning banners |
| `warning.border` | `#F0DCC8` | `#3D3020` | warning banner border |
| `error.base` | `#C62828` | `#F87171` | failed, destructive (deep red for AA) |
| `error.soft` | `#FEF2F2` | `#2D1515` | error washes |
| `info.base` | `#4267F4` | `#5A7CF6` | network/info |
| `info.soft` | `#EDF0FF` | `#131B33` | info washes |
| `border.base` | `#ECEBE4` | `#2C2C28` | hairlines, card borders |
| `border.strong` | `#D8D6CE` | `#3E3E38` | secondary-button border, checkbox ring |

### 0.2 Spacing (4px grid)
`xs 2 · sm 4 · md 8 · lg 12 · xl 16 · 2xl 20 · 3xl 24 · 4xl 32 · 5xl 48`

### 0.3 Radius
`sm 4 · md 8 · lg 12 · xl 16 · 2xl 20 · full 9999`

### 0.4 Type scale (base px, before user scale)
`xs 10 · sm 11 · base 13 · lg 15 · xl 17 · 2xl 20 · 3xl 26 · 4xl 32 · 5xl 40`
- User text-scale multiplier: **6 levels, 0.82×–1.35×** (compact 0.82 · small 0.91 · standard 1.0 · comfortable 1.10 · large 1.22 · xlarge 1.35) — `// src/constants/text-scale.ts:15-22`. Default is `standard` on BOTH platforms (`// text-scale.ts:25`; the file's own header comment "Android defaults to comfortable" is stale). Applies to every token size; design layouts must survive both extremes (0.82 and 1.35).
- **Web-only ×1.2 boost** on top (`WEB_TEXT_BOOST`, `// src/constants/theme.ts:61`); native instead additionally inherits OS font scaling.
- Weights: regular 400 / medium 500 / semibold 600 / bold 700.
- **Typeface: Plus Jakarta Sans** in all four weights (the code export is named `inter` for historic reasons — the actual family is PlusJakartaSans_400/500/600/700). `font.display` = Plus Jakarta Bold. `font.mono` = Menlo (iOS) / `monospace` (Android/web). `font.numeric` = Plus Jakarta Regular (no separate tabular face — see §Z-2).
- Line heights (`leading`): none 1 / tight 1.2 / normal 1.4 / relaxed 1.6 (mostly used ad hoc: explicit lineHeight 18–22 on paragraphs).

### 0.5 Shadows (color `#1A1A18`)
| Token | offset | opacity | blur | elevation |
|---|---|---|---|---|
| `shadow.sm` | 0,1 | 0.04 | 3 | 1 |
| `shadow.md` | 0,2 | 0.06 | 8 | 3 |
| `shadow.lg` | 0,4 | 0.08 | 16 | 6 |

### 0.6 Motion
- `motion.fast 150ms · normal 250ms · slow 400ms`
- `motion.spring { damping 15, stiffness 150, mass 0.8 }` — ALL interactive feedback
- `motion.springGentle { damping 20, stiffness 120, mass 1 }`
- Entrances: `fadeIn/fadeInDown/fadeInUp(delay, 300–400ms)` — **iOS only** (helper returns undefined on Android AND web to kill blank-frame flicker). Entrances play once per mount (gated with `hasEntered` refs so re-renders never replay).

---

## 0b. App-wide interaction conventions (Penpot "foundations" page)

1. **Press feedback**: spring scale — buttons 0.97, list rows 0.98, FAB 0.92, all `motion.spring`. Never opacity-only (exceptions noted per component).
2. **Sheet header pattern** (repeated in ~10 sheets): row `paddingHorizontal 20 (2xl)`, `paddingVertical 8 (md)`; left spacer `width 34`; centered title `text.xl(17) bold fg.base`; right plain 34×34 round icon button with `X 20px strokeWidth 2 fg.base` — no bg/border/shadow (plain icon button rule), `hitSlop 8`.
3. **Hairline divider**: 1px `border.base`, inset past the leading icon so it aligns under the text. Inset formula = row left padding + icon Ø + gap. Concrete insets used: 48 (40 avatar + 8), 48 (36 logo + 12), 60 (8 + 40 + 12 token rows), 36 (28 logo + 8).
4. **Masked amounts (privacy mode)**: four 7×7 px circles, radius 3.5, gap 4, color `fg.base` (or `success.base` for incoming) — never bullet glyphs.
5. **Copy affordance**: `Copy` icon (`fg.subtle`, strokeWidth 2) → `Check` (`success.base`, strokeWidth 2.6–3) + optional text swap to "Copied" in success color; resets after 1.5–2s.
6. **Selection mark**: trailing accent `Check` 18–20px strokeWidth 2.6 (radio-style pickers). Selected rows never get a filled tint in the de-boxed convention (but see §Z-4).
7. **QR plates**: QR codes always sit on a **hardcoded `#FFFFFF`** rounded plate (radius 12–16, hairline border or shadow.sm) in BOTH themes — scannability over theming. QR payload is always the bare address (never EIP-681) so any scanner works.
8. **Haptics**: light on press/copy/threshold, selection on segment/toggle change, success on commit/save.
9. **Touch targets** ≥44×44 (explicit size or `hitSlop`); every pressable has `accessibilityRole="button"` + translated label; selected controls expose `accessibilityState={{selected}}`; web modals trap focus + Escape closes (`useWebDialog`).
10. **Accent discipline**: `#E8572A` only for money-moving/commit CTAs, selection checks, and small action links ("Fix", "Add token", "Check now"). Neutral-ink (`fg.base` fill + inverse text) is the selected state for filters/chips.

---

# A. Core atoms

## A1. VelaButton (`ui/VelaButton.tsx`)

**Purpose**: THE app CTA. One component for all filled/outline buttons (mandated by design review: "VelaButton 唯一 CTA").

**Props affecting appearance**: `title`, `variant: 'primary' | 'secondary' | 'accent'` (default primary), `compact?: boolean`, `disabled?`, `loading?`, `style?`.

**Anatomy & styling**:
- Container: `paddingVertical 16 (xl)`, `borderRadius 16 (xl)`, centered content, full width of parent.
- Compact: `paddingVertical 12 (lg)` + `paddingHorizontal 20 (2xl)`.
- Label: `text.lg (15) semibold`; compact label `text.base (13)`.
- **primary**: fill `fg.base` (ink; `#1A1A18` light / `#E8E6E1` dark), label `fg.inverse`, no border, `shadow.sm`.
- **secondary**: transparent fill, `1.5px` border `border.strong`, label `fg.base`, no shadow.
- **accent**: fill `accent.base #E8572A`, label `fg.inverse` (white), `shadow.sm`.

**States**:
- default → pressed: spring scale to **0.97** (`motion.spring`), on release back to 1.
- disabled OR loading: whole button `opacity 0.45`; press disabled.
- loading: label replaced by `ActivityIndicator` tinted the label color; a11y `busy`.

**A11y**: role button, label = title, state `{disabled, busy}`.

**Usage sites**: SendScreen, SettingsScreen, AddTokenPanel (fetch/save), BugReportModal (send/fallback), BundlerFundingModal (continue/open-in-wallet), AccountSwitcherModal (create/sign-in), TreasuryBootstrapSheet, TokenSelector (sweep confirm).

**Penpot axes**: `variant (primary/secondary/accent) × size (regular/compact) × state (default/pressed/disabled/loading)` = 24 variants.

---

## A2. VelaCard (`ui/VelaCard.tsx`)

**Purpose**: generic raised surface. Per DESIGN-LANGUAGE, now reserved for genuinely distinct surfaces (result cards, amount hero in funding sheet) — NOT for wrapping every section.

**Props**: `elevated?: boolean`, `style?`. No internal padding by design — children own it.

**Styling**: fill `bg.raised`, `borderRadius 16 (xl)`, `1px` border `border.base`, `shadow.sm`. `elevated`: border transparent, `shadow.md`.

**States**: static (no press behavior).

**Usage**: AddTokenPanel (suggestion/result/compat cards), BundlerFundingModal (amount card).

**Penpot axes**: `elevation (default/elevated)`.

---

## A3. SectionLabel (`ui/SectionLabel.tsx`)

**Purpose**: THE section heading of the de-boxed layout — groups open content by type + space instead of boxing.

**Styling**: `text.sm (11) semibold`, color `fg.subtle`, `UPPERCASE`, `letterSpacing 0.6`, `marginTop 20 (2xl)`, `marginBottom 8 (md)`. (Docs say 0.8–1.2 letterspacing — code says 0.6; see §Z-5.)

**Variants in the wild**: inline usage zeroes the margins (HoldingsList header row); "first in sheet" usage overrides `marginTop 12`.

**Usage**: AccountSwitcherModal, HoldingsList, BalanceDetailSheet, TransactionDetailSheet, ConnectionEventDetailSheet, Home sections.

**Penpot axes**: `spacing (standalone/inline/first-in-sheet)`.

---

## A4. DetailRow + Divider (`ui/DetailRow.tsx`)

**Purpose**: canonical label↔value row for detail/metadata sections, with optional copy or open-in-explorer affordance; plus the app's 1px Divider.

**Props**: `label`, `value?`, `custom?` (replaces value cell), `mono?`, `onCopy?/copied?`, `onOpen?`, `actionHint?` (a11y hint).

**Styling**:
- Row: horizontal, space-between, `gap 12 (lg)`, `paddingVertical 12 (lg)`.
- Label: `text.base (13) regular fg.muted`.
- Value: `text.base (13) semibold fg.base`, 1 line, shrinks; `mono` swaps family to `font.mono`.
- Trailing icon 14px: `Copy` (`fg.subtle`, sw2) ↔ `Check` (`success.base`, sw2.6) when `copied`; or `ExternalLink` (`fg.subtle`, sw2). `hitSlop 10` on the value pressable.
- `Divider`: height 1, `border.base`, full width (callers add inset variants themselves).

**States**: static / copyable (default, copied) / linked. Interactive value cell has role button + label "Label: value" + hint.

**Usage**: TransactionDetailSheet, ConnectionEventDetailSheet, ReceiveScreen, TokenDetailScreen, PayScreen, ReceiveRequestControls.

**Penpot axes**: `trailing (none/copy/copied/open) × value-face (sans/mono/custom)`.

---

## A5. TxStatusBadge (`ui/TxStatusBadge.tsx`)

**Purpose**: identical "pending / confirmed / failed" rendering everywhere a stored tx status shows.

**Styling**: row, `gap 4 (sm)`; icon 16px strokeWidth 2.4 + label `text.base (13) semibold`, both in the status tint:
- pending → `Clock`, `warning.base`, label i18n `statusPending`.
- confirmed → `CheckCircle2`, `success.base`, label `statusSucceeded`.
- failed → `XCircle`, `error.base`, label `statusFailed`.

**Usage**: TransactionDetailSheet, ConnectionEventDetailSheet (inside DetailRow `custom`).

**Penpot axes**: `status (pending/confirmed/failed)`.

---

## A6. AmountText (`ui/AmountText.tsx`)

**Purpose**: "atomic number" monetary display (Apple Wallet / Cash App cascade). Never wraps mid-number.

**Behavioral spec (design-load-bearing)**:
1. Fit-to-width on one line: font shrinks from `size` toward `size × minScale` (default 0.6).
2. Compact-notation floor: below the floor, switch representation (`$1,234,567.89 → $1.23M`) instead of shrinking further (`compact` default true; `text` mode never compacts).
3. Two-tier typography: integer at full size; decimal tail + unit at `tailScale` (default **0.56**) of current size.
4. Subordinated currency symbol: `symbolScale` (~**0.58** in heroes) renders the symbol smaller/leading so the NUMBER is the hero; omit → symbol full-size glued to integer.
5. `maxLines` default 1 (atomic); >1 only for input/full-precision surfaces (wraps at the decimal).
6. Line height = 1.12 × font size.

**Props affecting appearance**: `value | text`, `symbol`, `unit`, `size` (px, the ideal), `showDecimals`, `minScale`, `compact`, `tailScale`, `symbolScale`, `maxLines`, `style` (color/weight/family), `tailStyle`.

**Usage**: Home hero balance (via BalanceDisplay, `symbolScale ≈ 0.58`), TokenDetailScreen, EnterDetailsStep (input echo), TransactionDetailSheet hero (`size text.2xl`, `tailScale 0.62`, `minScale 0.55`), DetailRow custom cells.

**Penpot axes** (as a text style recipe, not a frame): `mode (fiat-two-tier / preformatted) × symbol (full/subordinated/none) × decimals (shown/hidden) × representation (full/compact)`. Document tail = 56% and symbol = 58% ratios.

---

## A7. AutoGrowTextInput (`ui/AutoGrowTextInput.tsx`)

**Purpose**: multiline text input that grows with content (and shrinks), instead of fixed-height internal scrolling. Pure behavior — carries NO intrinsic visual style; callers apply the app input recipe.

**Props**: `minHeight` (default 44 = resting/empty height), `maxHeight` (cap; beyond it scrolls; omit = grow freely inside a ScrollView), + all TextInput props. Text top-aligned.

**Canonical caller styling** (the "input recipe", see BugReportModal/AddTokenPanel): fill `bg.sunken`, `radius 12 (lg)`, `1px border.base`, padding 12–16, text `sm–base regular/medium fg.base`, placeholder `fg.subtle`.

**Usage**: BugReportModal (description 120/160px resting, steps 96), SettingsScreen, EnterDetailsStep, ContactsManager, MultiRecipientEditor.

**Penpot axes**: none of its own — include as `Input / multiline (empty/filled/at-max-scrolling)` using the input recipe.

---

## A8. Identicon (`ui/Identicon.tsx`)

**Purpose**: deterministic Nimiq geometric avatar derived from a (lowercased) address. Circular — clipped by the wrapper so it matches the app's all-circle avatar language (stock Nimiq output is hexagonal; deliberately overridden).

**Styling**: `width/height = size`, `borderRadius size/2`, `overflow hidden`; inner SVG 160×160 viewBox with library-generated background/accent/main colors (address-derived — not theme tokens, identical in light/dark).

**Usage**: WalletAvatar (identicon mode), AccountSwitcherModal rows, ContactAvatar, AdvancedPanel, IdenticonViewerSheet.

**Penpot axes**: `size (18/32/40/44/220…)` — represent as one component with a size token; artwork is per-address generated (use 2–3 sample seeds).

---

## A9. WalletAvatar (`ui/WalletAvatar.tsx`)

**Purpose**: account avatar honoring the avatar-style preference; one component so Home / switcher / Settings never drift.

**Props**: `name`, `address?`, `size` (default 40), `letterSize?` (default `round(size × 0.34)`), `enlargeable?`.

**Variants**:
- **initial** (classic): circle `accent.soft` fill, letter = first char uppercased (fallback "V"), `bold accent.base`.
- **identicon**: `<Identicon>` at size (requires `address`). If `enlargeable` and address valid: tappable (stops propagation, selection haptic) → opens IdenticonViewerSheet. Deliberately NOT role=button (lives inside button rows; avoids nested-button invalid HTML on web) — has a11y label only.

**Usage**: HomeScreen account button (44), AccountSwitcherModal rows (40, enlargeable), TransactionReceipt from-party (38), ConfirmStep, browser bottom-bar account pill (**20**, `letterSize 11` — `// src/app/browser.tsx:476`, the dApp-browser account-switcher trigger).

**Penpot axes**: `style (initial/identicon) × size (20/32/38/40/44)`.

---

## A10. ScreenContainer (`ui/ScreenContainer.tsx`)

**Purpose**: standard screen wrapper — safe area + page padding + keyboard avoidance.

**Styling**: outer fill `bg.base`; SafeArea edges default `['top']`; `paddingHorizontal 24 (3xl)`. iOS keyboard `behavior="padding"`; Android relies on native adjustResize (no behavior).

**Usage**: SettingsScreen, ReceiveScreen, AboutScreen, AddTokenScreen, SafariExtensionScreen, ClearSigningTestScreen (most non-modal screens).

**Penpot**: page template — 24px side margins on `bg.base`, top safe-area only (bottom handled per-screen for docks).

---

# B. Interactive controls

## B1. SegmentedToggle (`ui/SegmentedToggle.tsx`)

**Purpose**: THE segmented control ("SegmentedToggle 唯一分段控件") — e.g. Home's Activity | Assets | Connections. Content-sized segments, horizontal scroll when a locale runs long, labels never truncate.

**Anatomy & styling**:
- Track: transparent, row, `gap 2 (xs)`, horizontally scrollable (no indicator).
- Segment: row, `paddingVertical 8 (md)`, `paddingHorizontal 16 (xl)`, `minHeight 44` (WCAG floor), `radius.full`, optional leading icon render-prop, optional numeric badge.
- Label: `text.base (13) semibold`; inactive `fg.muted`, active `fg.base` — **color change only** (weight change would resize the text and re-spring the chip).
- **Floating active chip** (single sliding indicator behind the active segment): absolute pill, `radius.full`, fill `bg.raised`, `1px border.strong`, `shadow.sm`. Springs position AND width between segments (`motion.spring`); first placement is instant; hidden until measured (opacity 0 at width 0). Rationale: warm palette can't carry selection on fill alone (bg.sunken chip was ~1.04:1) → raised fill + hairline + shadow = redundant cues (WCAG 1.4.1).
- Badge: `minWidth 18`, `height 18`, `radius 9`, `paddingHorizontal 5`, fill `fg.base`, text `text.xs (10) bold fg.inverse`.
- Active segment auto-scrolls into view (offset −24).

**Behavior**: selection haptic on change; a11y role button + `selected` per segment.

**Usage**: HomeScreen tabs, SettingsScreen, ReceiveScreen, PayScreen, ContactsManager, BatchImportSheet.

**Penpot axes**: `segment state (active/inactive) × badge (none/count) × icon (none/leading)`; plus the chip as its own sub-component.

---

## B2. SlideToConfirmButton (`ui/SlideToConfirmButton.tsx`)

**Purpose**: deliberate commit control for consequential actions (send, danger signing). Drag the knob to the end to fire — a stray tap can't.

**Anatomy & styling** (landing-page-approved look — quiet track, loud knob):
- Track: height **60**, `radius 30` (full pill), fill `bg.raised`, `1px border.base`. Never red — risk is signaled above the control, not by the commit surface.
- Thumb/knob: **52×52** circle, inset 4px, fill `accent.base`, white `ArrowRight 22 sw2.6`, `shadow.md`; web cursor `grab`.
- Label: centered on track (insets 60 left/right for optical centering), `text.lg (15) semibold fg.muted`, single line; **fades + drifts right (up to 14px) as the knob approaches** (fully gone by 55% of travel).
- Hint prop is the a11y hint (e.g. "Slide to confirm").

**States**:
- idle: knob "peeks" right 9px, 3 times (2.2s delay, 240ms out, springy back) to teach the gesture; killed forever on first grab.
- dragging: knob scales ×1.06 while grabbed; rubber-bands past both ends (12% resistance, +10px max overshoot); haptic tick at 60% travel.
- commit: ≥80% travel on release, or fast flick (velocity > 900) past 45%; knob animates to end (110ms), success haptic, then fires. Track/border interpolate (220ms) to `success.soft` fill + border `rgba(45,142,95,0.30)`.
- disabled/loading: `opacity 0.45`; while loading the knob parks at the far end hosting a small white spinner.
- re-arm: when un-blocked after an action resolves, knob springs home and the latch clears (persistent-mount callers like the signing sheet).

**A11y**: focusable button; web fires on Enter/Space; native exposes an `activate` accessibility action. Placement rule: never rest against the screen's bottom edge — keep ≥ ~48pt clearance (iOS app-switcher gesture band).

**Usage**: SendScreen ConfirmStep, SigningSheet (dApp signing).

**Penpot axes**: `state (idle/dragging/committed/disabled/loading)` (+ knob-position overlays for dragging).

---

## B3. VelaRefresh (`ui/VelaRefresh.tsx`)

**Purpose**: branded gesture-driven pull-to-refresh (identical feel iOS/Android/web; native RefreshControl unstylable on iOS).

**Behavioral spec**:
- Trigger distance **72px**; 1:1 finger tracking to the trigger, then 0.4 resistance ("the resistance change IS the threshold"); one crisp light haptic on crossing (re-arms if you back off); spring-back on under-threshold release; rests at 72px while refreshing.
- Engages only when the list is at the very top; otherwise normal scroll wins.

**Indicator** (arc that "draws" with the pull, then spins):
- Ring 30px, stroke 3, on a 44px (RING+14) circle plate — native: `bg.raised` + soft black shadow (0,2 / 0.08 / 6, elevation 3); web: transparent.
- Track circle: `border.base` at 60% opacity (full ring, depth cue).
- Arc: `accent.base`, round caps, starts 12 o'clock; sweep 8%→70% proportional to pull; while refreshing fixed 72% sweep spinning 360°/750ms linear.
- Wrapper scales 0.55→1 and rotates 0→130° with the pull.
- Optional status caption under the indicator: `text.xs (10) medium fg.subtle` (e.g. "Updated 2m ago" — freshness is the reason the pull exists). Band fades in over the first 70% of the pull.

**Usage**: HomeScreen feed, HoldingsList (render-prop child spreads `scrollProps` onto an Animated list).

**Penpot axes**: `state (idle/pulling-25%/pulling-75%/armed/refreshing) × caption (none/status)`.

---

## B4. WaveDock (`ui/WaveDock.tsx`)

**Purpose**: Home's bottom action bar. Flat full-bleed bar; floating circular Scan FAB is the focal point; Send is the single accent action; Receive is its matched neutral pill.

**Anatomy & styling**:
- Bar: absolute bottom, full-bleed, height **86 + bottom safe inset**, fill `bg.raised`, `1px top hairline border.base`.
- Scan FAB: **56px** circle centered, overlapping the bar's top edge by half; fill `bg.raised`, `1px border.base`, `shadow.md`; `ScanLine 26 fg.base sw2`; icon-only (no label). Press: haptic + spring scale **0.92**.
- Button row: absolute, `bottom = inset + 8`, `paddingHorizontal 12`, `gap 4`; center slot reserved `56 + 8` wide.
- Pills (both): flex 1, row, centered, `gap 8`, `paddingVertical 16 (xl)`, `paddingHorizontal 8`, `radius 16 (xl)`, `1px border` (both carry the border so heights match). Icon 22 sw2.2 matches label color (a dimmer icon reads half-disabled).
  - **Send (primary)**: fill + border `accent.base`; `ArrowUpRight`; label `text.xl (17) bold fg.inverse` (xl size needed for white-on-accent WCAG 3:1).
  - **Receive (secondary)**: fill `bg.base` + border `border.strong` (NOT bg.sunken — inverts in dark mode); `ArrowDownLeft`; label `text.xl (17) semibold fg.base`.
- Arrow pair mirrors ActivityRow's in/out glyphs.
- Screens must reserve scroll clearance of 86 + inset (+ breathing room).

**Press**: haptic light + scale 0.97 (pills) / 0.92 (FAB).

**Usage**: HomeScreen (rendered full-width outside the padded container), tabs layout.

**Penpot axes**: `element (bar/send/receive/fab) × state (default/pressed)`.

---

## B5. NetworkFilterButton (`ui/NetworkFilterSheet.tsx`, trigger)

**Purpose**: compact single-select chain-filter trigger.

**Styling**: soft chip — `bg.sunken`, `radius.full`, `paddingVertical 8`, `paddingHorizontal 12`, `gap 8`, `maxWidth 150`.
- Unselected: stack of first 3 chain logos (20px each, overlap −8, each ringed 2px `bg.raised`) + label "All" `text.base (13) semibold fg.base` + `ChevronDown 13 fg.muted sw2.4`.
- Selected: single 20px ChainLogo + chain name + separate clear button: 20px circle `bg.sunken` with `X 12 fg.muted sw2.6` (sibling pressable — never nested buttons).

**Penpot axes**: `selection (all/chain-selected)`.

---

# C. Rows & list components

## C1. TokenRow (`ui/TokenRow.tsx`)

**Purpose**: the token list row (holdings, pickers, unpriced lists). De-boxed.

**Anatomy & styling**:
- Row: `paddingVertical 12 (lg)`, `paddingHorizontal 8 (md)`, `gap 12 (lg)`, `radius 12` (for the pressed/selected tint only), web: no text-select/focus ring.
- Leading: TokenLogo **40px** (fixed) with optional chain badge.
- Optional leading checkbox (multi-select/sweep): 22px circle, `2px border.strong`; ON → fill+border `accent.base` with white/`bg.base` check 13 sw3.
- Info column (`gap 3`): symbol `text.lg (15) semibold fg.base`; chain label `text.sm (11) regular fg.subtle`; optional contract chip: self-start, `bg.sunken`, `radius.full`, `padding 4/2`, mono `text.xs (10) medium fg.muted` short address `0x1234…abcd` + `Copy 11` → on copy shows "Copied" + `Check 11 success` (light haptic).
- Values column (right-aligned, `gap 2`): balance `text.lg (15) semibold` `font.numeric` `fg.base` (shrinks to 0.7 to fit); fiat `text.sm (11) regular numeric fg.muted`.
- Masked: balance replaced by 4×7px dots (`fg.base`).
- Selected (checkbox mode): row fill `accent.soft`.

**Motion**: press spring 0.98; entrance `fadeIn(index × 40ms, 300)` (iOS only).

**Usage**: HoldingsList, TokenSelector, BalanceDetailSheet, BatchImportSheet.
**Row separator convention** (owned by lists): hairline inset `marginLeft 60` (8 + 40 + 12).

**Penpot axes**: `mode (plain/checkbox-off/checkbox-on) × masked (y/n) × contract-chip (none/default/copied) × fiat (y/n) × state (default/pressed/selected)`.

---

## C2. ActivityRow (`ui/ActivityRow.tsx`)

**Purpose**: one entry in the payment-first Activity feed. De-boxed edge-to-edge row on `bg.base`.

**Anatomy & styling**:
- Row: `paddingVertical 16 (xl)`, `paddingHorizontal 2 (xs)`, `gap 12`, fill `bg.base`.
- Avatar: 44px circle `bg.sunken`; incoming → `success.soft`. Arrow 19 sw2.2: incoming `ArrowDownLeft success.base`, outgoing `ArrowUpRight fg.subtle`. Chain badge: ChainLogo 18 at bottom-right (−2,−2) ringed 2px `bg.raised`.
- Content (3 lines, `gap 3`):
  1. title `text.base (13) semibold fg.muted` (calm — the arrow + amount carry direction) ↔ amount `text.xl (17) bold`, right-aligned, `fg.base` / incoming `success.base`; ticker rendered inside at `text.sm (11) semibold fg.muted` (only the NUMBER fits-to-width, ticker subordinated; shrink floor 0.85). Masked → 4 dots (success-tinted when incoming).
  2. counterparty `text.sm (11) medium` **mono** `fg.muted` (owns the line width) ↔ fiat `text.sm (11) medium fg.muted` (no shrink).
  3. time `text.xs (10) regular fg.subtle` (omitted on Home, which groups by date headers).
- "Just arrived" glow (`isNew`): full-row `success.soft` overlay fading out over 1600ms.

**Motion**: press spring 0.98 + light haptic; entrance `fadeInDown(index × 40, 300)` once (gated).
**A11y**: single spoken label "Sent, 0.05 ETH, to 0x12…ab, ≈$90, 2h ago"; amount omitted when masked.

**Usage**: HomeScreen Activity feed; connection panels.
**Penpot axes**: `direction (in/out) × masked (y/n) × new (glow/none) × time (y/n) × chain-badge (y/n)`.

---

## C3. HoldingsList (`ui/HoldingsList.tsx`)

**Purpose**: Home "Assets" tab — funded tokens per chain with collapsed search, add-token, token-detail navigation.

**Header row**: inline SectionLabel (margins zeroed) ↔ actions (`gap 4`): search toggle 32px round plain icon (`Search 15 sw2.4`; `fg.muted` → `accent.base` when open) + add row (`Plus 14 accent sw2.5` + label `text.sm (11) semibold accent.base`).
**Search bar** (only while open): `bg.sunken`, `radius 12`, `padding 12/8`, `gap 8`, `Search 14 fg.subtle`, input `16px` regular (≥16 prevents iOS Safari zoom) `fg.base`, autofocus.
**Rows**: TokenRow + hairline separators inset 60.
**Empty (funded-nothing)**: open state, no card — centered, `padding 32`: 48px circle `accent.soft` with `ArrowDown 22 accent sw2.5`; title `text.xl (17) semibold fg.muted`; subtext `text.base (13) regular fg.subtle` centered lh20. Tapping navigates to Receive.
**No-match (filtering)**: plain centered `text.base regular fg.subtle`, `paddingVertical 24`.
**Refresh**: wrapped in VelaRefresh with status caption.

**Penpot axes** (screen-section component): `state (list/empty/no-match/loading) × search (closed/open)`.

---

## C4. TokenSelector (`ui/TokenSelector.tsx`)

**Purpose**: reusable "pick a token" list — search + category chips + network filter + summary + add-token; single-select or sweep multi-select.

**Styling**:
- Search: `bg.sunken`, `radius.full`, `padding 12/8`, `gap 8`, `Search 16 fg.subtle`, input `text.base (13) regular fg.base`.
- Category chips row (All / Stable / Gas / Other), horizontally scrollable, `gap 4`: chip `bg.sunken`, `radius.full`, `padding 12/4`; label `text.sm (11) semibold fg.muted`. **Active chip = neutral ink**: fill `fg.base`, label `fg.inverse` (accent reserved for money-moving). Selection haptic. Vertical-only hitSlop 12.
- NetworkFilterButton at the row's right.
- Sweep master row (only when a specific chain is picked): 22px circle checkbox (`2px border.strong` → accent fill + white check) + label `text.base (13) semibold fg.base`.
- Summary row: count `text.sm medium fg.muted` ↔ total `text.sm semibold numeric fg.base`.
- Rows: TokenRow (single-select: contract chip; sweep: checkbox + `space.sm` gaps instead of hairlines); hairline inset 60 otherwise.
- Loading: `text.lg regular fg.muted` centered, top 48. Empty: `text.xl semibold fg.muted` + add-token.
- Add token (footer, always reachable): de-boxed centered accent row — `Plus 18 accent sw2.5` + `text.base (13) semibold accent.base`, `paddingVertical 16` (was a dashed card; now plain).
- Sweep confirm: accent VelaButton pinned under the list.

**Usage**: SendScreen, ReceiveRequestControls (payment request builder).
**Penpot axes**: `mode (single/sweep) × chip state (active/inactive) × list state (loading/empty/results)`.

---

## C5. FeeTokenSelector (`ui/FeeTokenSelector.tsx`)

**Purpose**: shared fee-asset picker rows (native coin + held whitelisted stables) used by Send confirm AND dApp GasFeeCard — cost of THIS tx per coin is the emphasis; balance is context. Presentational only.

**Styling** (de-boxed: open rows under a hairline, no card):
- Container: `1px top border.base`, `marginBottom 12`.
- Header: `text.xs (10) semibold fg.muted`, UPPERCASE, `letterSpacing 0.8`, `marginTop 12`, `marginBottom 2`.
- Row: `gap 8`, `paddingVertical 8`; TokenLogo **32**; left column: symbol `text.base (13) semibold fg.base` + balance line `text.xs (10) regular numeric fg.subtle` ("Balance 12.4"); right column: cost `text.base (13) semibold numeric fg.base` ("~0.021 USDC", dust shows "< 0.0001", unknown "—") + label `text.xs (10) regular fg.subtle` ("this tx spends").
- Trailing 22px slot: selected → accent `Check 18 sw2.6`; pending (selection applying) → 16px accent spinner; else empty. **No filled tint on selected** (check-only convention).
- Insufficient (can't cover the fee) or busy non-pending rows: `opacity 0.4`, taps blocked.

**Penpot axes**: `row state (default/selected/pending/insufficient)`.

---

## C6. GasFeeCard (`ui/GasFeeCard.tsx`)

**Purpose**: collapsed fee display + expandable fee-asset picker; shared by Send + dApp signing.

**Collapsed row**: `paddingVertical 12`, no horizontal inset (shares the sheet's left edge), space-between.
- Left: "Est. Fee" `text.sm (11) medium fg.muted`; sub-line "Paid with USDC" `text.xs (10) regular fg.subtle` (only when selectable).
- Right (right-aligned stack + icons `gap 4`):
  - value `text.sm (11) semibold fg.base`: `~0.0012 POL`; while estimating → "Estimating…"; failed → "Estimate failed" in `warning.base`.
  - fiat `≈ $0.003` `text.xs (10) regular fg.subtle` (hidden below $0.005 — the native amount is the honest primary).
  - refresh: plain icon `RefreshCw 14 fg.muted` (spinner 14 while refreshing).
  - expand chevron `ChevronUp/Down 16 fg.subtle` (only when >1 fee asset).
  - failed state: single `RefreshCw 16 warning.base`; tapping the row retries.
- Expanded: renders FeeTokenSelector below. Auto-expands once when a choice first exists; auto-defaults selection to the first affordable asset.

**Penpot axes**: `state (estimating/ready/failed/refreshing) × expandable (y/n) × expanded (y/n)`.

---

# D. Modal system & sheets

## D1. AppModal (`ui/AppModal.tsx`)

**Purpose**: THE cross-platform modal/bottom-sheet shell everything else builds on.

**Modes**:
- **iOS default**: native `pageSheet` with interactive pull-down (finger-tracked). Static grabber.
- **Android default**: full sheet with custom whole-sheet drag-to-dismiss from the handle region; dismiss past **90px** drag or fling velocity 0.5; threshold haptic; sheet throws off-screen (200ms) before closing.
- **`fit` (both natives)**: content-height bottom card over a dimmed backdrop for short prompts (dApp connect consent); backdrop fade + slide 220ms in / 180ms out; same drag-dismiss.
- **Web**: DOM portal; backdrop `rgba(0,0,0,0.35)` fading 300ms; sheet slides up 300ms cubic-bezier(0.4,0,0.2,1); `maxHeight 92%`; drag handle closes past 80px/0.5.

**Chrome**:
- Sheet fill `bg.base`; top corners `radius 20 (2xl)` (web + fit; native pageSheet uses OS chrome).
- Grabber: handle area `paddingTop 10 / paddingBottom 6`, bar **36×5**, `radius 3`, `border.base`.
- Content gets bottom safe-area + keyboard padding.

**A11y (web)**: focus trap, focus restore, Escape closes, scroll lock (`useWebDialog`).

**Usage**: every sheet below + ReceiveRequestControls, RpcProvidersModal, WelcomeScreen, browser.
**Penpot axes**: `mode (pageSheet/fit) × platform frame (iOS/Android/web)` — practically: one sheet template with grabber + 20px top radius on `bg.base`.

## D1b. Sheet header pattern (composite, reuse everywhere)
`[spacer 34] [title text.xl(17) bold fg.base centered] [34×34 round plain X 20 sw2]`, container `paddingHorizontal 20`, `paddingVertical 8`. Used by: AddTokenSheet, BalanceDetailSheet, ConnectionEventDetailSheet, TransactionDetailSheet, IdenticonViewerSheet, TreasuryBootstrapSheet, NetworkFilterSheet (search toggle instead of X on the right).

---

## D2. AppAlert / AlertProvider (`ui/AppAlert.tsx`)

**Purpose**: web replacement for `window.alert/confirm`; native uses OS `Alert.alert` (so this visual spec is WEB-ONLY).

**Styling**:
- Overlay: centered; backdrop `rgba(0,0,0,0.35)`; portal above all modals.
- Card: `bg.raised`, `radius 16 (xl)`, `padding 20 (2xl)`, `width 85% / maxWidth 340`, `shadow.lg`.
- Title: `text.lg (15) bold fg.base`, `marginBottom 8`.
- Message: `text.base (13) regular fg.subtle`, lineHeight 22, `marginBottom 16`.
- Button row: right-aligned, `gap 8`. Buttons `padding 8/16`, `radius 12`, `minWidth 70`:
  - default (text-only): label `text.base (13) semibold accent.base`.
  - cancel: label `fg.subtle`.
  - primary (last of ≥2 non-cancel/destructive): fill `accent.base`, label `fg.inverse`.
  - destructive: fill `error.base`, label `fg.inverse`.

**Penpot axes**: `buttons (1/2/3) × role (default/cancel/primary/destructive)`.

---

## D3. AccountSwitcherModal (`ui/AccountSwitcherModal.tsx`)

**Purpose**: the one multi-account picker (Home / Assets / Settings / browser).

**Styling** (de-boxed):
- Header: `padding 16/12`, `gap 8`: title `text.xl (17) bold` + optional subtitle (formatted total, count) `text.sm (11) medium fg.subtle`; small spinner while balances load; `X 22 sw2` close.
- List `paddingHorizontal 16`; SectionLabel on top.
- Account row: `paddingVertical 12`, `gap 8`: WalletAvatar 40 (enlargeable) · name `text.base (13) semibold fg.base` (**active → `accent.base`**) · address `text.sm (11) regular mono fg.subtle` · right: balance `text.sm (11) semibold fg.muted` (or spinner; `••••` when privacy-hidden) + active accent `Check 18`.
- Hairline between rows inset `marginLeft 48` (40 avatar + 8 gap).
- Optional actions (Settings): primary VelaButton "Create new" + secondary "Sign in existing", `gap 8`, `paddingTop 32`.
- Selection: success haptic, closes.

**Penpot axes**: `row (active/inactive) × balance (value/loading/masked) × actions (none/create)`.

---

## D4. AddTokenSheet (`ui/AddTokenSheet.tsx`)

AppModal wrapper: sheet `paddingHorizontal 20`, header pattern (X is 18px here), hosting AddTokenPanel. No unique styling beyond the pattern.

---

## D5. AddTokenPanel (`ui/AddTokenPanel.tsx`)

**Purpose**: body of "Add Token" — two tabs: import ERC-20 by contract (multi-chain auto-detect) / add a custom network. Rendered full-screen (AddTokenScreen) or in AddTokenSheet.

**Tab switcher** (⚠ legacy control style — see §Z-6): track `bg.sunken`, `radius 12`, `padding 3`; tab flex-1 row centered `gap 4`, `paddingVertical 8`, `radius 8`; active: fill `bg.raised` + `shadow.sm`; label `text.sm (11) semibold`, inactive `fg.subtle`, active **`accent.base`**; network tab has `Globe 14` (accent when active).

**Form**:
- Field label: `text.sm (11) semibold fg.muted`, UPPERCASE, ls 0.8, `marginTop 20 / marginBottom 8`.
- Input (recipe): `bg.sunken`, `radius 12`, `1px border.base`, `padding 16/16`, text `text.base (13) medium` **mono** `fg.base`; address input row embeds a scan button (`ScanLine 20 fg.subtle`, `padding 12`).
- Search hint: `text.sm regular fg.subtle`; error text `text.sm medium error.base`.
- Fetch button: secondary VelaButton (disabled until valid address; loading spinner).

**Result cards** (one per network found): VelaCard `padding 20`, `marginTop 24`; label/value rows `paddingVertical 12` (label `base regular fg.muted` / value `base semibold fg.base`) with 1px separators; then either accent VelaButton "Add to wallet" (loading state) or added-row: centered `Check 16 success sw2.5` + `text.base semibold success.base`.

**Network flow**: suggestions VelaCard (name `base medium` ↔ "Chain ID x" `sm regular subtle` rows); chain-info VelaCard incl. editable RPC input; compat VelaCard `elevated`: title `sm semibold fg.muted uppercase ls0.8`; check rows (`Check 14 success sw2.5` / `X 14 subtle` + name `sm regular subtle` → ok `fg.base`); deploy action: `accent.soft` fill `radius 12` centered `paddingVertical 12`, label `sm semibold accent.base`; compatible card `elevated` with `Check 20 success` + title `lg bold success.base`.

**Manage section**: custom-token rows — `bg.raised`, `1px border.base`, `radius 12`, `padding 12`, `gap 12`: symbol `base semibold` + meta "Name · Network" `sm regular fg.muted`; delete: 36×36 `radius 8` square `error.soft` fill with `Trash2 18 error.base`.

**Penpot axes**: `tab (erc20/network) × result (none/found/added/error) × compat (pass/fail)`.

---

## D6. BalanceDetailSheet (`ui/BalanceDetailSheet.tsx`)

**Purpose**: "why is my total an estimate" explainer: failed/rate-limited networks + unpriced tokens.

**Styling**: header pattern; body `paddingHorizontal 20`.
- Section note under each SectionLabel: `text.sm (11) regular fg.muted` lh18.
- Network row: `paddingVertical 12`, `gap 12`: ChainLogo 36 · name `text.lg (15) semibold` + status `text.sm (11) medium` — failed → `warning.base` / retrying (rate-limited, self-healing) → `fg.muted`; genuinely-failed rows get "Fix" link `text.sm semibold accent.base`. Hairline inset 48 (36+12).
- Retry row: `RefreshCw 14 accent sw2.5` + `text.sm semibold accent.base`.
- Unpriced tokens: TokenRow (`usdValue` shows "No price" copy), hairline inset 60.
- Empty: `text.base regular fg.subtle` centered `paddingVertical 32` (auto-closes when everything recovers).
- In-place content swap to RpcFixForm (never a second stacked modal — iOS constraint).

**Penpot axes**: `section (networks/tokens/both/empty) × net-row (failed/retrying)`.

---

## D7. BrowserHistorySheet (`ui/BrowserHistorySheet.tsx`)

**Purpose**: recently-opened dApps list (favicon + host, newest first, per-row delete, clear all).

**Styling**: sheet `paddingHorizontal 16`, `maxHeight 460`.
- Header: title `text.lg (15)` weight 700 ↔ "Clear all" `text.sm (11)` weight 600 **`error.base`**.
- Row: `paddingVertical 4`; divider = hairline (StyleSheet.hairlineWidth) top `border.base`; favicon 28×28 `radius 8` (fallback: `bg.sunken` square with `Globe 16 fg.subtle`); host `text.sm` 600 `fg.base`; title-sub `12px` (hardcoded) `fg.muted`; delete `X 16 fg.subtle` `padding 4`.
- Empty: `text.sm fg.muted` centered `paddingVertical 20`.
- Clear-all confirms via AppAlert (destructive).

⚠ Uses raw `fontWeight` + a hardcoded 12px instead of the `inter`/token recipe (minor drift).

**Penpot axes**: `state (list/empty) × row (default)`.

---

## D8. BugReportModal (`ui/BugReportModal.tsx`)

**Purpose**: one-click bug report (no GitHub account needed); nothing sent until "Send report"; preview shows exactly what's sent; GitHub-URL fallback.

**Compose state**: container `paddingHorizontal 20`, `paddingTop 16`.
- Title `text.lg (15) bold`; subtitle (the prompt — no visible field labels) `text.sm (11) regular fg.muted`.
- Description input: input recipe (`bg.sunken`, r12, 1px border, `padding 12/8`), `text.sm regular`, resting height **120** (screens ≥700px: **160**).
- "Add steps" quiet disclosure: `text.sm medium fg.muted`, self-start; reveals a second 96px input (autofocus).
- Send: accent VelaButton, disabled until text; loading label "Sending…".
- Consent line: `text.xs (10) regular fg.subtle`.
- Preview toggle: `ChevronRight/Down 16 fg.subtle` + `text.sm medium fg.subtle`; preview box `bg.sunken r8 padding 8`, `text.xs regular fg.muted`.
- GitHub link footer: centered underlined `text.sm medium fg.muted`.

**Success state** (content swap): title + body (`text.sm regular fg.muted`) + optional secondary "View issue" + accent "Done".
**Fallback state**: title/body + accent "Open GitHub" + secondary "Cancel".

**Penpot axes**: `state (compose/steps-open/preview-open/sending/success/fallback)`.

---

## D9. BundlerFundingModal + BundlerFundingView (`ui/BundlerFundingModal.tsx`)

**Purpose**: gas-account funding fallback sheet (silent sponsorship failed). Modes: topup / confirming / funded.

⚠ **Standalone `BundlerFundingModal` (AppModal wrapper) is dead code — do not board.** Zero imports of the wrapper anywhere in `src/`; only `BundlerFundingView` is imported, as the in-sheet content swap inside SigningRequestModal (`// src/components/signing/SigningRequestModal.tsx:8` — iOS can't stack modals). The Send path that used the standalone sheet was replaced by TreasuryBootstrapSheet. Everything below specs the live `BundlerFundingView` content.

**Shared header** (centered): 44px circle `accent.soft` with `Fuel 22 accent sw2` · title `text.lg (15) bold` · network chip: `bg.sunken`, `radius.full`, `padding 8/3`, ChainLogo 16 + name `text.xs (10) semibold fg.base`.

**topup**:
- Status line (one honest sentence, informational tone — amber reserved for true failures): `text.sm (11) regular fg.muted` lh20.
- Retry-free row (when retryable): `RefreshCw 13 accent` (or 14 spinner) + `text.sm semibold accent.base`.
- Amount card (fiat-anchored): VelaCard centered `padding 12`: label `text.sm regular fg.subtle`; fiat `≈ $2.40` `text.xl (17) bold` **mono** `fg.base`; token line `0.0012 POL` `text.sm medium mono fg.muted`.
- Address card (tap-to-copy is primary): `bg.sunken`, r12, 1px border, `padding 12`: label UPPERCASE `text.xs semibold fg.muted ls0.5` ↔ `Copy 14 fg.subtle` → `Check 14 accent sw3`; full address mono `text.xs fg.base` lh18, selectable.
- Network hint `text.xs regular fg.subtle`.
- "Open in wallet" secondary VelaButton (EIP-681 deep link; native-asset chains only).
- QR disclosure (collapsed by default): centered toggle `text.sm medium fg.subtle` + chevron 14; QR **132px** on white plate `radius 16` `shadow.sm` `padding 8`.
- Auto-check row: note `text.xs subtle` + "Check now" `text.xs semibold accent.base` (polls every 10s regardless).
- Details disclosure: same toggle style; body `text.sm regular fg.muted` lh20.
- Cancel: plain centered `text.sm medium fg.subtle`; dApp variant copy says "Cancel this transaction".

**confirming** (NEVER styled as an error): centered block `paddingVertical 24`: large accent spinner · `text.base (13) medium fg.base` centered lh22 · auto-check note `text.xs subtle`; cancel below. Degrades to topup after 45s with an honest "pending_unknown" line.

**funded**: centered 56px circle `success.soft` with `Check 28 success sw2.5` · title `text.lg semibold fg.base` · accent "Continue" (auto-advances after 1.2s success beat).

**Penpot axes**: `mode (topup/confirming/funded) × QR (collapsed/open) × retry (none/available/retrying)` — dApp content-swap surface only (standalone wrapper is dead code, see ⚠ above).

---

## D10. ConnectionEventDetailSheet (`ui/ConnectionEventDetailSheet.tsx`)

**Purpose**: "what did I authorize" for a dApp record — kinds: connect / sign_message / sign_typed_data / dapp_tx. IA: identity → signed content → metadata trail.

**Styling**: header pattern; body `paddingHorizontal 20`, `gap 16`.
- Hero (open, no card): 44px circle `accent.soft` with kind icon 22 accent sw2 (`Link2`/`PenLine`/`FileText`/`ArrowLeftRight`) · title `text.lg (15) bold` + dapp row `Globe 13 fg.muted` + origin `text.sm (11) medium fg.muted` · trailing amount `text.lg bold font.display`.
- Off-chain note (message/typed only): `text.sm regular fg.muted` lh18.
- Optional BalanceChangePreview (sign-time simulation replay).
- Signed-content block: SectionLabel + code block `bg.sunken`, `radius 12`, `padding 12`, `gap 8` (NOT a card — no border/shadow): mono `text.sm fg.base` lh19, scrolls at maxHeight 220; plain 32×32 copy icon button bottom-right (`Copy 16 fg.subtle` → `Check 16 success`). Missing content: `text.base regular fg.subtle`.
- Metadata: SectionLabel + DetailRows (app, date, status badge, operation, chain w/ 18px logo, from copy, to explorer, value, hash explorer) with Dividers.

**Penpot axes**: `kind (connect/message/typed/tx) × content (present/missing) × copied`.

---

## D11. CurrencySheet (`ui/CurrencySheet.tsx`)

**Purpose**: display-currency picker — searchable, single-select, applies + closes on tap; opens scrolled to the current selection.

**Styling**: sheet `paddingHorizontal 20`; title centered `text.xl (17) bold` `paddingVertical 8`.
- Search: `bg.sunken`, `radius.full`, `padding 12/8`, `gap 4`; `Search 18 fg.subtle sw2.2`; input `text.lg (15) medium fg.base`; clear `X 18`.
- List `gap 8`; row (⚠ card-style — see §Z-4): `bg.raised`, `radius 16 (xl)`, `1.5px border transparent` → **`accent.base` when selected**, `padding 12`, `gap 12`: symbol circle 40 `bg.sunken` with `text.lg bold fg.base` glyph · code `text.lg (15) semibold` + name `text.sm (11) regular fg.muted` · selected accent `Check 20 sw2.6`.
- Empty: `text.base regular fg.subtle` centered.
- Row a11y role = radio.

**Penpot axes**: `row (default/selected) × search (empty/active/no-match)`.

---

## D12. IdenticonViewerProvider (`ui/IdenticonViewerProvider.tsx`)
Behavioral host only (no visuals): one app-level sheet instance opened from any avatar; mounts on open so it always stacks on top on web; 320ms delayed unmount preserves the exit animation. Not a Penpot component.

## D13. IdenticonViewerSheet (`ui/IdenticonViewerSheet.tsx`)

**Purpose**: large legible identicon view — the address's visual fingerprint.

**Styling**: header pattern; body centered, `paddingTop 12`, `paddingBottom 32`.
- Identicon: `min(56% of width, 220)` px inside a ring: identicon + 12px, circle, `1px border.base`, fill `bg.raised`.
- Name: `text.2xl (20) bold fg.base`, `marginTop 20`.
- Caption: `text.sm (11) regular fg.muted`, centered, lh19, maxWidth 320.
- Copy row: `bg.sunken`, `radius 12`, `padding 12/8`, `gap 4`, `marginTop 24`: `Copy 15 fg.subtle` → `Check 15 success sw2.5`; address mono `text.base fg.muted` centered (2 lines) → copied state: "Copied" `semibold success.base`. Pressed: opacity 0.6.

**Penpot axes**: `copy (default/copied)`.

---

## D14. NetworkFilterSheet (`ui/NetworkFilterSheet.tsx`, sheet part)

**Purpose**: "Select Chain" single-select picker (All or exactly one chain; applies + closes on tap; optional search).

**Styling**: sheet `paddingHorizontal 20`; header pattern with right = search toggle (Search 18 ↔ X 18).
- Search input: `bg.raised`, `1px border.base`, `radius 12`, `padding 12/12`, `text.lg (15) regular`.
- List `gap 8`; rows same card-select recipe as CurrencySheet (`bg.raised`, `radius 16`, `1.5px` transparent→accent border, `padding 12`): "All Networks" row: 40px circle `bg.sunken` `Globe 20 fg.muted` + name `text.lg semibold` + sub "Show every network" `text.sm regular fg.muted`; chain rows: ChainLogo 40 + name + optional subtitle (per-chain count/value); selected accent `Check 20`.
- Row a11y role = radio.

**Penpot axes**: `row (all/chain) × selected (y/n) × search (closed/open)`.

---

## D15. RpcTroubleBanner + RpcFixForm + RpcFixModal (`ui/RpcTroubleBanner.tsx`)

**RpcTroubleBanner** — warning banner when chains' RPCs are down:
- Container: `warning.soft` fill, `radius 12`, `1px warning.border`, `padding 12`, `gap 8`, `marginBottom 12`; entrance fadeInDown once.
- `AlertTriangle 14` in hardcoded `#C07A0A` (⚠ raw hex, see §Z-7) + message `text.sm (11) semibold warning.base` ("X unavailable" / "N networks unavailable").
- Per-chain chip rows: ChainLogo 16 + name `text.sm medium fg.base` + "Fix" `text.sm semibold accent.base`.

**RpcFixForm** — paste-a-working-RPC recovery (renders inside its own modal OR swapped into another sheet):
- Header: `padding 24/16`, bottom hairline; title `text.xl (17) bold` ↔ `X 22`.
- Body `padding 24`, `gap 16`: chain row (ChainLogo 32 + name `lg semibold` + "Chain ID" `sm medium subtle`); warning box (same banner recipe, `Wifi 14 #C07A0A`, text `sm regular warning.base` lh18); label UPPERCASE `sm semibold fg.base ls0.5`; URL input (input recipe, `padding 12/12`); save button ⚠ custom accent button (not VelaButton): `accent.base` fill, `radius 12`, `paddingVertical 12`, `shadow.sm`, label `text.base semibold fg.inverse`, disabled opacity 0.5, spinner when saving.
- Providers block (top hairline): title `base semibold`; hint `sm regular subtle` lh18; provider chips: `bg.sunken`, `radius.full`, `1px border.base`, `padding 12/4`, label `sm medium fg.base` + `ExternalLink 12 fg.subtle` (Alchemy / QuickNode / dRPC / Chainlist).
- Report row: centered `text.sm semibold accent.base` + `ExternalLink 12`.

**Penpot axes**: banner `chains (1/N)`; form `state (default/saving/disabled)`.

---

## D16. SigningReplaySheet (`ui/SigningReplaySheet.tsx`)
Thin wrapper: AppModal hosting the shared `SigningSheet` in **read-only** mode (no approve/reject, replayed sign-time simulation, optional "submitted, waiting" banner if still pending). Visual spec belongs to the signing-flow report; capture here only that the replay is pixel-identical to the live signing sheet minus commit controls.

---

## D17. TransactionDetailSheet (`ui/TransactionDetailSheet.tsx`)

**Purpose**: Activity-row detail. Single tx (send/receive) or batch (split = 1 token→N people / multiSelect = N tokens→1 addr). De-boxed everywhere.

**Header**: pattern; title "Sent"/"Received".
**Hero** (open on page): TokenLogo **52** (batch-multiSelect: 52px circle `bg.sunken` with count `text.base bold` + 20px chain badge ringed 2px `bg.base`) · AmountText `size text.2xl (20) bold font.display` — outgoing `- 1.25` `fg.base`, incoming `+ 1.25` **`success.base`**, unit tail 0.62 in `fg.muted` · fiat `≈ $…` `text.base (13) medium fg.muted` · trailing plain 36px chevron (`ChevronRight 20 fg.subtle sw2.4`) → explorer.
**Counterparty** ("who is this" identity row shared with Send/receipt): ContactAvatar 40 · name `text.lg (15) bold` + RecipientTypeBadge 14 · address `text.sm mono medium fg.muted` · copy 16 → check success. Split shows instead a plain label↔"N recipients" row (`cpShort` `text.lg bold mono`).
**Breakdown** (batch): SectionLabel + rows `paddingVertical 8`: split → ContactAvatar 32 + name/badge/addr + right `- amt SYM` `text.base bold` + fiat `sm regular mono fg.muted`, full-width hairlines; multiSelect → TokenLogo 28 + symbol, hairlines inset 36 (28+8).
**Details**: SectionLabel + DetailRows (date, TxStatusBadge, from copy, to explorer, operation, chain w/ 18px logo, hash explorer) with Dividers.
**Behavior**: while pending, polls the bundler and live-updates the status badge + hash.

**Penpot axes**: `kind (single-out/single-in/split/multiSelect) × status (pending/confirmed/failed) × counterparty (named/address-only)`.

---

## D18. TreasuryBootstrapSheet (`ui/TreasuryBootstrapSheet.tsx`)

**Purpose**: "help start this network's relayer" — bundler treasury below floor; scan-to-pay QR + copy + prominent non-refundable disclaimer + funded-retry.

**Styling**: header pattern (title may wrap 2 lines); body `paddingHorizontal 20`.
- Network identity row (centered): ChainLogo 26 + name `text.lg (15) bold` + `· #chainId` `text.sm medium numeric fg.subtle`.
- Lead: `text.base (13) regular fg.muted` lh21 centered.
- Suggested amount block (centered): label `text.xs (10) semibold fg.subtle` + `~12.5 XDAI` `text.2xl (20) bold numeric fg.base` (suggests 2× the floor).
- QR **140px** on white plate `radius 12` `1px border.base` `padding 8`.
- Address card: `bg.sunken`, r12, 1px border, `padding 16`: label `text.sm medium fg.muted` ↔ copy/check 14; address mono `text.sm medium fg.base`; operator endpoint mono `text.xs regular fg.subtle`.
- Disclaimer card (PROMINENT): `warning.soft` fill, `radius 12`, `padding 16`, `gap 8`: `AlertTriangle 18 warning.base` + `text.sm (11) semibold warning.base` lh20.
- Buttons: primary VelaButton "Copy address" (→ "Copied") + secondary "I've funded — retry" (or "Close").

**Penpot axes**: `footer (retry/close) × copied (y/n)`.

---

# E. Receipt

## E1. TransactionReceipt (`ui/TransactionReceipt.tsx`)

**Purpose**: bank-style full-screen receipt after a send; shareable as an image (native screenshot / web canvas render that mirrors this layout 1:1). Status: submitted / confirmed / failed; kinds: single / split / multiSelect.

**Receipt card**: `bg.raised`, `radius 16 (xl)`, `1px border.base`, clipped.
- **Top hero** (edge-to-edge, state-tinted): SVG vertical gradient from state tint → `bg.raised` at 82% (tints: confirmed `success.soft`, submitted `warning.soft`, failed `error.soft`). Content centered, `gap 4`, `paddingTop 20 / bottom 16`: TokenLogo 52 (multiSelect: up to 3 logos 46px overlapped −16) · status row: state icon 18 sw2.4 (`CheckCircle2`/`Clock`/`XCircle`) + status word `text.lg (15) bold` in state color · meta line `text.xs (10) regular fg.subtle`: `Chain · date[ · total]`.
- **From→To flow** (same identity treatment as confirm screen), `paddingHorizontal 12`:
  - Party row: WalletAvatar/ContactAvatar 38 · name `text.base (13) bold` + addr `text.sm mono medium fg.muted` · amount column right: out `−1.2 ETH` `text.base bold numeric fg.base`, in `+1.2 ETH` `success.base`; fiat `≈ $…` `text.xs regular numeric fg.subtle`.
  - `FlowArrow` connector between parties.
  - split: label `N RECIPIENTS` `text.xs semibold subtle uppercase ls0.6` + numbered scrolling list (maxHeight 260): index `text.xs semibold numeric fg.subtle` (16 min width) + ContactAvatar 32 + RecipientTrust/TypeBadge + `+amount` green.
  - multiSelect: token list indented behind a `1.5px border.strong` left rule (`marginLeft 6`, `paddingLeft 12`): TokenLogo 30 + symbol/chain + amount + fiat.
- **Meta rows** (each with 1px top hairline, `padding 12/8`): UserOp hash (tap-to-copy: mono `text.sm fg.base` + copy/check 13) — available instantly; Tx hash (tap → explorer, `ExternalLink 13 accent`).
- **Settlement block** (top hairline):
  - confirmed: QR **72px** of the explorer URL + hint `text.xs regular fg.subtle`.
  - submitted: hint `text.sm medium fg.muted` centered lh20 + progress module: header row label `text.xs medium fg.subtle` ↔ countdown `00:37` `text.sm bold numeric warning.base` (60s window; then "still confirming" copy); track height 7, `radius 999`, `warning.soft` fill; fill bar `warning.base` (min 2% visible); poll hint `text.xs regular fg.subtle` centered. Progressbar a11y role with value.
  - failed: hint in `error.base` (explorer link still shown — a reverted tx is inspectable).
- **Footer** (top hairline, calm 3-tier signature): app logo 34px circle · "VELA WALLET" `text.sm bold fg.muted letterSpacing 2.5` · "getvela.app" `text.xs regular fg.subtle ls0.5`; `paddingTop 24 / bottom 20`.

**Below the card**: actions row (centered, `gap 24`): icon 18 + label `text.sm medium fg.muted` stacked — Explorer (`ExternalLink`), Share (`Share2`), Save-to-contacts (`BookmarkPlus` → saved: `Check 18 success` + "Saved"). Done button: full-width, fill `fg.base`, `radius 16`, `paddingVertical 16`, label `text.lg semibold fg.inverse` (⚠ duplicates VelaButton primary instead of reusing it).

**Canvas share image**: 390×~var pt @2x, `bg.sunken` page, same card anatomy (documented in code for parity; uses font name "Inter" — see §Z-7).

**Penpot axes**: `status (submitted/confirmed/failed) × kind (single/split/multiSelect) × saveContact (none/available/saved)`.

---

# F. Legacy / template components (⚠ not part of the Vela design language)

These are Expo-template leftovers using the legacy `getThemeColors()` palette, not the token system. Recommend flagging in Penpot as "legacy — do not re-implement", or excluding.

## F1. ThemedText (`themed-text.tsx`)
Types: `default` 16/24 w500 · `title` 48/52 w600 · `subtitle` 32/44 w600 · `small` 14/20 w500 · `smallBold` 14/20 w700 · `link` 14/30 · `linkPrimary` 14/30 **hardcoded `#3c87f7`** · `code` mono 12 (w700 Android / w500 elsewhere). Color from legacy theme (`text`, `textSecondary`, etc.). Only used by Collapsible.

## F2. ThemedView (`themed-view.tsx`)
View with legacy background colors: `background`, `backgroundElement` (`#F0F0F3` light / `#212225` dark), `backgroundSelected` (`#E0E1E6` / `#2E3135`). Only used by Collapsible.

## F3. Collapsible (`ui/collapsible.tsx`)
Disclosure: heading row gap 8, pressed = opacity 0.7 (⚠ not spring); 24×24 `backgroundElement` rounded-12 chevron button (SF Symbol chevron.right, rotates ±90°); content `backgroundElement` panel radius 16, margins 24/16, padding 24; FadeIn 200ms on expand. Uses `Spacing` legacy scale.

## F4. AnimatedIcon + AnimatedSplashOverlay (`animated-icon.tsx` / `.web.tsx`)
Splash-screen animation. Native: full-screen solid **`#208AEF`** overlay scaling from screen-filling to 1 while fading (600ms, elastic 0.7); 128px icon tile with **hardcoded blue gradient `#3C9FFE → #0274DF`**, radius 40; **Expo logo** image 76×71; 201px glow image rotating 7200° over 4 minutes. Web variant: 300ms elastic pop-in, no overlay. ⚠ Entirely Expo-branded and off the Vela palette — must be replaced by a Vela splash before store launch; do NOT carry into the Penpot library as-is.

---

# Z. Conflicts & drift noticed (flag for the design source-of-truth)

1. **DESIGN_SYSTEM.md hex values are stale**: it documents `fg.muted #7A776E`, `fg.subtle #B0ADA5` and (implicitly) bright red error; theme.ts deliberately darkened these for WCAG (`#6E6B62`, `#8C887E`, error `#C62828`). theme.ts is authoritative.
2. **Font zone docs wrong**: DESIGN_SYSTEM says `font.display` = SF Rounded and `font.sans` = System. Reality: everything is **Plus Jakarta Sans** (400/500/600/700); the code export is misleadingly named `inter`. `font.numeric` is just Plus Jakarta Regular — there is no true tabular-figure face; "tabular alignment" relies on the family's figures.
3. **Card-heavy vs de-boxed**: DESIGN_SYSTEM §5.2/§6.5 (VelaCard confirmation cards everywhere) is superseded by DESIGN-LANGUAGE (de-container). Detail sheets, account switcher, fee selector, holdings follow the new language.
4. **Two competing "selected row" conventions**: FeeTokenSelector's comment claims the app-wide picker convention is "accent check only, no filled tint", but CurrencySheet and NetworkFilterSheet still use **raised card rows with a 1.5px accent border** on selection (plus the check). TokenRow's checkbox mode uses an `accent.soft` fill. Penpot needs a ruling on the canonical selected-row treatment.
5. **SectionLabel letterSpacing**: code 0.6 vs DESIGN_SYSTEM's documented 0.8–1.2 (other uppercase micro-labels in sheets do use 0.5–0.8 ad hoc).
6. **AddTokenPanel tab switcher** is an old filled-track segmented control with an **accent-colored active label** — conflicts with both "SegmentedToggle is the only segmented control" and "accent reserved for money-moving actions".
7. **Hardcoded values escaping the token system**: `#C07A0A` warning-icon tint (RpcTroubleBanner + RpcFixForm); `rgba(45,142,95,0.3)` success border (SlideToConfirmButton); `rgba(0,0,0,0.35)` modal backdrops (AppModal/AppAlert); `#FFFFFF` QR plates (intentional); custom networks added via AddNetworkModal get ChainLogo fallback-disc defaults `iconColor '#888888'` / `iconBg '#F0F0F0'` (`// src/screens/settings/SettingsScreen.tsx:658-659`) — fixed light-mode grays baked into stored data, so the disc renders as a bright plate in dark mode; BrowserHistorySheet raw fontWeight + 12px; TransactionReceipt "Done" re-implements VelaButton primary; RpcFixForm save button re-implements VelaButton accent; canvas renderer uses font name "Inter" though the app ships Plus Jakarta Sans.
8. **Entrance animations are iOS-only** (helper returns undefined on Android/web to avoid a blank first frame). Android/web boards should be specced WITHOUT entrance motion; press springs still apply everywhere.
9. **AppAlert visual spec applies to web only** — native shows OS alerts; a future GPUI/native re-implementation must decide whether to adopt the styled dialog on all platforms.
10. **Legacy components** (ThemedText/ThemedView/Collapsible/AnimatedIcon) use a parallel legacy palette + Expo branding; exclude or mark legacy.

---

# Appendix: Penpot variant-axis summary

| Component | Axes |
|---|---|
| VelaButton | variant(primary/secondary/accent) × size(regular/compact) × state(default/pressed/disabled/loading) |
| VelaCard | elevation(default/elevated) |
| SectionLabel | spacing(standalone/inline/first) |
| DetailRow | trailing(none/copy/copied/open) × face(sans/mono/custom) |
| TxStatusBadge | status(pending/confirmed/failed) |
| AmountText | mode(fiat/preformatted) × symbol(full/subordinated/none) × decimals × representation(full/compact) |
| Input recipe (+AutoGrow) | kind(single/multiline) × state(empty/filled/error) |
| Identicon | size |
| WalletAvatar | style(initial/identicon) × size(20/32/38/40/44) |
| SegmentedToggle | segment(active/inactive) × badge × icon |
| SlideToConfirmButton | state(idle/dragging/committed/disabled/loading) |
| VelaRefresh indicator | state(idle/pulling/armed/refreshing) × caption |
| WaveDock | element(bar/send/receive/fab) × state(default/pressed) |
| NetworkFilterButton | selection(all/chain) |
| TokenRow | mode(plain/checkbox) × masked × chip(none/default/copied) × selected × pressed |
| ActivityRow | direction(in/out) × masked × new × time × badge |
| HoldingsList | state(list/empty/no-match) × search(open/closed) |
| TokenSelector | mode(single/sweep) × chip(active/inactive) × list(loading/empty/results) |
| FeeTokenSelector | row(default/selected/pending/insufficient) |
| GasFeeCard | state(estimating/ready/failed/refreshing) × expanded |
| AppModal | mode(pageSheet/fit) × platform |
| AppAlert | role(default/cancel/primary/destructive) × count(1/2/3) |
| AccountSwitcherModal | row(active/inactive) × balance(value/loading/masked) × actions |
| AddTokenPanel | tab(erc20/network) × result(none/found/added/error) × compat(pass/fail) |
| BalanceDetailSheet | sections(networks/tokens/both/empty) × net-row(failed/retrying) |
| BrowserHistorySheet | state(list/empty) |
| BugReportModal | state(compose/steps/preview/sending/success/fallback) |
| BundlerFunding | mode(topup/confirming/funded) × QR × retry × surface |
| ConnectionEventDetailSheet | kind(connect/message/typed/tx) × content × copied |
| CurrencySheet | row(default/selected) × search(empty/active/no-match) |
| IdenticonViewerSheet | copy(default/copied) |
| NetworkFilterSheet | row(all/chain) × selected × search |
| RpcTroubleBanner / FixForm | chains(1/N); form state(default/saving/disabled) |
| TransactionDetailSheet | kind(single-in/out/split/multiSelect) × status × counterparty |
| TreasuryBootstrapSheet | footer(retry/close) × copied |
| TransactionReceipt | status(submitted/confirmed/failed) × kind(single/split/multiSelect) × saveContact |
| Legacy set | mark legacy, exclude from library |
