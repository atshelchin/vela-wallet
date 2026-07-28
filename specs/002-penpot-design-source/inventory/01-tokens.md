# Vela Wallet — Design Token System (Report 01)

Complete token inventory for rebuilding the design source-of-truth in Penpot. Every value is read directly from source. Suggested Penpot token names are given in each table.

**Authority order (per task brief + repo state):**
1. `src/constants/theme.ts` — the single source of truth for runtime values (its header says so). Exact values below come from here.
2. `docs/DESIGN-LANGUAGE.md` — the CONFIRMED current visual language ("quiet, typographic, de-containered"). Overrides #3 where they conflict.
3. `DESIGN_SYSTEM.md` (repo root) — older, card-heavy guidance. Several values in it are STALE (see §17 Conflicts).

Other sources read: `src/constants/color-scheme.ts`, `src/constants/text-scale.ts`, `src/constants/entering.ts`, `src/global.css`, `app.json`, `app.config.js`, and the token-encoding primitives `VelaButton`, `VelaCard`, `SegmentedToggle`, `SectionLabel`, `DetailRow` (Divider), `ScreenContainer`, `WaveDock`, `AmountText`, `AppModal`.

There is **no Tailwind / NativeWind**. Styling is pure RN StyleSheet via a `createStyles()` wrapper (see §14). `src/global.css` is web-only page-level CSS (focus ring, phone frame, font stacks).

---

## 1. Proposed Penpot token sets

| Penpot set | Contents |
|---|---|
| `color` | §2 semantic colors, light + dark themes |
| `color.fixed` | §3 mode-independent colors (shadow ink, backdrop, focus ring, web frame, splash) |
| `typography` | §5 families, §6 sizes, §7 weights, §8 line-height, §9 letter-spacing |
| `space` | §10 spacing scale |
| `radius` | §11 radius scale |
| `border` | §12 border widths |
| `shadow` | §13 elevation |
| `motion` | §15 durations, springs, press scales, entrances |
| `opacity` | §16 opacity conventions |
| `icon` | §18 icon sizes + stroke widths |
| `size` | §19 hit targets, §20 layout metrics |

---

## 2. Color — semantic tokens (light + dark)

Defined in `theme.ts` as `LIGHT_COLORS` / `DARK_COLORS`; the exported `color` object is mutated in place by `rebuildColors(isDark)` (see §21 for the dark-mode mechanism). **Rule: components never use raw hex — only `color.*` tokens** (DESIGN-LANGUAGE.md principle 9).

### 2.1 Foreground (text/icon hierarchy)

| Penpot token | Light | Dark | Usage |
|---|---|---|---|
| `color.fg.base` | `#1A1A18` | `#E8E6E1` | Primary text, icons; also primary-button fill |
| `color.fg.muted` | `#6E6B62` | `#9A9790` | Secondary text, descriptions, row labels |
| `color.fg.subtle` | `#8C887E` | `#85827A` | Tertiary text, placeholders, timestamps, disabled labels, SectionLabel ink |
| `color.fg.inverse` | `#FFFFFF` | `#1A1A18` | Text/icons on filled (fg.base / accent) surfaces |

Contrast rationale baked into the values (source comments): light `muted` ≥ 4.5:1 body text on `bg.base`; light `subtle` ≥ 3:1 for placeholders; dark `subtle` lightened from `#6A6760` (≈2.96:1) to clear the 3:1 floor.

### 2.2 Background layers

| Penpot token | Light | Dark | Usage |
|---|---|---|---|
| `color.bg.base` | `#FAFAF8` | `#141412` | Page background (content sits directly on it — de-containered) |
| `color.bg.raised` | `#FFFFFF` | `#1E1E1B` | Sheets/modals, WaveDock bar, floating chips, inputs |
| `color.bg.sunken` | `#F5F3EF` | `#0F0F0D` | Inset areas, soft filter pills, address boxes |

Dark-mode inversion gotcha (encoded in WaveDock comment): in dark mode `sunken` is *darker* than `raised`, so "sunken-on-raised" nearly vanishes (~1.15:1). Secondary pills on a raised bar therefore use `bg.base` + `border.strong` instead of `sunken`.

### 2.3 Accent + semantic statuses

| Penpot token | Light | Dark | Usage |
|---|---|---|---|
| `color.accent.base` | `#E8572A` | `#E8572A` (same) | THE single accent: primary money-moving CTAs, active/truly-primary states, brand. Reserved — restraint principle |
| `color.accent.soft` | `#FFF0EB` | `#2C1A12` | Accent-tinted backgrounds (avatars, badges) |
| `color.success.base` | `#2D8E5F` | `#3DA872` | Confirmations, success states, active connection dots |
| `color.success.soft` | `#EDFAF2` | `#132A1E` | Success-tinted backgrounds |
| `color.warning.base` | `#92600A` | `#D4A54A` | Warning text/icons |
| `color.warning.soft` | `#FFF8F0` | `#2A2010` | Warning banner backgrounds |
| `color.warning.border` | `#F0DCC8` | `#3D3020` | Warning banner border (only status group with a border sub-token) |
| `color.error.base` | `#C62828` | `#F87171` | Danger text, destructive actions. Light value deliberately deep (was `#EF4444`, 3.44:1 — now ≥4.5:1 on `error.soft` and on white; white-on-base = 5.6:1 for destructive buttons) |
| `color.error.soft` | `#FEF2F2` | `#2D1515` | Error-tinted backgrounds |
| `color.info.base` | `#4267F4` | `#5A7CF6` | Network/informational UI |
| `color.info.soft` | `#EDF0FF` | `#131B33` | Info-tinted backgrounds |

### 2.4 Borders / dividers

| Penpot token | Light | Dark | Usage |
|---|---|---|---|
| `color.border.base` | `#ECEBE4` | `#2C2C28` | Hairline dividers (1px), default card border, WaveDock top hairline, input borders |
| `color.border.strong` | `#D8D6CE` | `#3E3E38` | Secondary-button outline, floating-chip edge, secondary dock pill |

### 2.5 Legacy dynamic colors (`getThemeColors()` / `useTheme()` — legacy accessor, still live)

| Legacy key | Light | Dark | Maps to |
|---|---|---|---|
| `text` | = `fg.base` | = `fg.base` | — |
| `background` | = `bg.base` | = `bg.base` | — |
| `backgroundElement` | `#F0F0F3` | `#212225` | Off-palette cool grays; legacy only |
| `backgroundSelected` | `#E0E1E6` | `#2E3135` | Off-palette cool grays; legacy only |
| `textSecondary` | = `fg.muted` | = `fg.muted` | — |

Recommendation for Penpot: do **not** promote `backgroundElement`/`backgroundSelected` to tokens; they are legacy leftovers (used only via `use-theme.ts`).

---

## 3. Color — fixed (mode-independent) values

| Penpot token (suggested) | Value | Where |
|---|---|---|
| `color.fixed.shadowInk` | `#1A1A18` | `shadowColor` of all three shadow tokens — deliberately fixed dark in BOTH modes ("fg.base would become a white glow in dark mode") |
| `color.fixed.backdrop` | `rgba(0,0,0,0.35)` | AppModal `fit`-sheet backdrop (3 uses); one legacy `rgba(0,0,0,0.4)` exists elsewhere |
| `color.fixed.focusRingInner` | `#FAFAF8` light / `#141412` dark (2px) | Web keyboard focus ring inner "gap" ring (global.css) |
| `color.fixed.focusRingOuter` | `#E8572A` (4px) | Web keyboard focus ring outer ring — accent, both modes |
| `color.fixed.desktopCanvas` | `#E8E8E8` | Desktop-web page background around the phone frame |
| `color.fixed.desktopFrameShadow` | `0 8px 40px rgba(0,0,0,0.15)` | Desktop-web phone frame |
| `color.fixed.splashBg` | `#1A1A18` | Native splash screen background (both modes), splash image width 180 |
| `color.fixed.androidAdaptiveIconBg` | `#0A1929` | Android adaptive icon background — navy, OFF-PALETTE legacy (flagged) |
| `color.fixed.webThemeColor` | light `#FAFAF8` / dark `#141412` | `<meta name="theme-color">` + mobile-web body bleed (JS-managed, CSS fallback in global.css) |

### 3.1 Hex-alpha suffix convention

Tinted fills are made by appending a 2-digit hex alpha to a token: observed suffixes `'40'` (25% — `error.base+'40'`, `success.base+'40'`) and `'12'` (7% — `accent.base+'12'`). Penpot: model as color-with-opacity variants (e.g. `color.error.base@25`).

---

## 4. Typography — overview

Single UI typeface: **Plus Jakarta Sans** (400/500/600/700), loaded at runtime via `@expo-google-fonts` `useFonts` in `app/_layout.tsx`. The theme export is still *named* `inter` (rename avoidance) but points at Plus Jakarta files. Monospace stays platform-native. Identical rendering across iOS/Android is a stated goal.

Note/flag: `app.json` also bundles `Inter-Regular/Medium/SemiBold/Bold.ttf` via the expo-font plugin — apparently a legacy leftover; runtime styles reference only `PlusJakartaSans_*`.

## 5. Font families / zones

| Penpot token | iOS | Android | Web | Usage |
|---|---|---|---|---|
| `font.sans` | PlusJakartaSans_400Regular | same | same (CSS fallback stack below) | All UI text |
| `font.display` | PlusJakartaSans_700Bold | same | same | Hero numbers (balance), large headings |
| `font.mono` | `Menlo` | `monospace` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace` (`--font-mono`) | Addresses, hashes, technical values |
| `font.numeric` | PlusJakartaSans_400Regular | same | same | Balance/fiat columns (Plus Jakarta has tabular figures) |

Weight-specific family files (Android ignores `fontWeight` when `fontFamily` is set, so each weight is its own family; the `inter.*` shorthand sets BOTH family and weight):

| Penpot token | fontFamily | fontWeight |
|---|---|---|
| `font.family.regular` | PlusJakartaSans_400Regular | 400 |
| `font.family.medium` | PlusJakartaSans_500Medium | 500 |
| `font.family.semibold` | PlusJakartaSans_600SemiBold | 600 |
| `font.family.bold` | PlusJakartaSans_700Bold | 700 |

Web CSS variables (global.css, web-only): `--font-display: 'Plus Jakarta Sans', PlusJakartaSans_400Regular, Spline Sans, Inter, ui-sans-serif, system-ui, sans-serif, …emoji fonts`; `--font-rounded: 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif`; `--font-serif: Georgia, 'Times New Roman', serif`. A legacy `Fonts` export (`system-ui`/`ui-serif`/`ui-rounded`/`ui-monospace` on iOS; `normal`/`serif`/`monospace` elsewhere) exists in theme.ts — legacy, do not tokenize.

## 6. Type size scale (base px, BEFORE scaling)

Rendered size = `round(base × userScaleFactor × webBoost)` — see §14. Bases:

| Penpot token | Base px | Usage (per DESIGN_SYSTEM, still accurate) |
|---|---|---|
| `text.xs` | 10 | Badges, timestamps |
| `text.sm` | 11 | Section labels, secondary info, chain names |
| `text.base` | 13 | Body, form labels, list items, DetailRow label+value, SegmentedToggle labels |
| `text.lg` | 15 | Row titles, VelaButton label, token symbols |
| `text.xl` | 17 | Screen/nav titles; WaveDock pill labels (large-text size chosen so white-on-accent clears WCAG 3:1) |
| `text.2xl` | 20 | Page titles |
| `text.3xl` | 26 | Step titles (Send flow) |
| `text.4xl` | 32 | Hero balance on token detail |
| `text.5xl` | 40 | Splash/onboarding reserved |

Raw (non-token) font sizes must go through `scaleFont(n)` = `round(n × webBoost)` so they get the web boost too.

## 7. Weights

| Penpot token | Value | Usage |
|---|---|---|
| `weight.regular` | 400 | Body, hints, secondary values |
| `weight.medium` | 500 | Mono text (addresses), form values |
| `weight.semibold` | 600 | Row titles, button labels, section headers |
| `weight.bold` | 700 | Page titles, hero numbers, brand |

## 8. Line height (multipliers)

| Penpot token | Value |
|---|---|
| `leading.none` | 1 |
| `leading.tight` | 1.2 |
| `leading.normal` | 1.4 |
| `leading.relaxed` | 1.6 |
| (AmountText hero) | 1.12 — hardcoded `lineHeight = round(size × 1.12)` |

## 9. Letter spacing

| Context | Value |
|---|---|
| `SectionLabel` (the canonical uppercase section heading) | **0.6** + `textTransform: uppercase` |
| DESIGN_SYSTEM.md claims 0.8–1.2 for section headers and 0.8 for form labels | STALE vs the shipped SectionLabel (0.6) — see §17 |

SectionLabel full spec (the one section heading of the de-boxed language): `text.sm`, semibold, `fg.subtle`, letterSpacing 0.6, uppercase, marginTop `space.2xl` (20), marginBottom `space.md` (8).

---

## 10. Spacing scale (4px base grid)

| Penpot token | px | Common usage |
|---|---|---|
| `space.0` | 0 | — |
| `space.xs` | 2 | Inline icon gaps, SegmentedToggle track gap |
| `space.sm` | 4 | Tight gaps, chip padding, dock row gap |
| `space.md` | 8 | Standard gap, icon-to-text, SegmentedToggle vertical padding |
| `space.lg` | 12 | Row padding (DetailRow vertical), section gaps, VelaButton compact vertical |
| `space.xl` | 16 | Card/input padding, VelaButton vertical, SegmentedToggle horizontal |
| `space.2xl` | 20 | Large card padding, SectionLabel top margin |
| `space.3xl` | 24 | **Screen horizontal padding** (ScreenContainer), section margins |
| `space.4xl` | 32 | Major section breaks |
| `space.5xl` | 48 | Empty-state top padding |

Legacy `Spacing` export (`half:2, one:4, two:8, three:16, four:24, five:32, six:64`) is used only by `components/ui/collapsible.tsx` — legacy, do not tokenize.

## 11. Radius scale

| Penpot token | px | Usage |
|---|---|---|
| `radius.none` | 0 | — |
| `radius.sm` | 4 | — |
| `radius.md` | 8 | — |
| `radius.lg` | 12 | Inputs |
| `radius.xl` | 16 | VelaButton, VelaCard, WaveDock pills |
| `radius.2xl` | 20 | Bottom-sheet top corners (AppModal `fit`), desktop-web phone frame |
| `radius.full` | 9999 | Pills/chips (filter chips, SegmentedToggle chip), circles |

Circles (avatars, ChainLogo, Scan FAB) use `size / 2`.

## 12. Border widths

| Penpot token | Value | Usage |
|---|---|---|
| `border.hairline` | 1 | Dividers (`Divider` = height 1, `color.border.base`), VelaCard default border, WaveDock top hairline + pill borders, SegmentedToggle chip, inputs |
| `border.emphasis` | 1.5 | VelaButton `secondary` outline (`color.border.strong`) — only non-1px border in the system |

Hairline divider rule (DESIGN-LANGUAGE.md): between de-boxed rows, 1px `color.border.base`, **inset past the leading icon** (`marginLeft: icon + gap`) so it aligns under the text, Apple-Wallet style.

## 13. Shadows / elevation

`shadowColor` is fixed `#1A1A18` in both modes (see §3).

| Penpot token | offset | opacity | blur (shadowRadius) | Android elevation | Usage |
|---|---|---|---|---|---|
| `shadow.sm` | 0,1 | 0.04 | 3 | 1 | VelaCard default, VelaButton (primary/accent), SegmentedToggle floating chip |
| `shadow.md` | 0,2 | 0.06 | 8 | 3 | Elevated cards, Scan FAB |
| `shadow.lg` | 0,4 | 0.08 | 16 | 6 | Rare/hero elevation |

Design-language caveat: shadows are for genuinely distinct floating surfaces; the de-containered language forbids shadowed "card piles."

---

## 14. Text-scaling system (how sizes actually resolve)

- **6 user levels** (Settings slider/stepper), stored in AsyncStorage (`vela.textScale`), default `standard` on BOTH platforms:

| Level key | Label | Factor |
|---|---|---|
| compact | Compact | 0.82 |
| small | Small | 0.91 |
| standard | Standard | 1.0 |
| comfortable | Comfortable | 1.10 |
| large | Large | 1.22 |
| xlarge | Extra Large | 1.35 |

- **Web boost:** on web only, ALL text is additionally multiplied by **1.2** (`WEB_TEXT_BOOST`) — a stand-in for OS text magnification the browser can't expose. Native multiplier is 1.
- **Native OS scaling stacks on top:** `allowFontScaling` stays default-true, so the device's OS text size multiplies the app factor again on iOS/Android (deliberate — "KEEP native OS scaling").
- Final size = `Math.round(base × levelFactor × webBoost)` (× OS scale on native at render).
- **`createStyles()` concept** (Penpot-relevant behavior, not RN trivia): styles are authored as factories over the mutable `text`/`color` tokens; a global `_styleVersion` increments on any text-scale or color-mode change, and a Proxy lazily rebuilds the StyleSheet on next read. `useStyles()` is the hook variant for instant same-frame updates (used where the user adjusts scale live). Consequence for design: **every text style in the app must survive 0.82×–1.62× (1.35 × OS scale) without breaking layout**; DESIGN_SYSTEM's test rule is "test at min and max scale."
- Web-only floor: on coarse-pointer web, inputs/textareas/selects are floored at **16px** to prevent iOS Safari auto-zoom (except the dynamic `amount-input`, always ≥17px).

## 15. Motion

### 15.1 Duration tokens

| Penpot token | ms |
|---|---|
| `motion.fast` | 150 |
| `motion.normal` | 250 |
| `motion.slow` | 400 |

### 15.2 Springs (react-native-reanimated `withSpring` configs)

| Penpot token | damping | stiffness | mass | Usage |
|---|---|---|---|---|
| `motion.spring` | 15 | 150 | 0.8 | ALL press feedback; SegmentedToggle chip slide/resize |
| `motion.springGentle` | 20 | 120 | 1 | Gentler layout springs |

### 15.3 Press-scale values (always spring, never timing, for interactive feedback)

| Element | Scale |
|---|---|
| Buttons (VelaButton, dock pills) | 0.97 |
| List rows (TokenRow etc.) | 0.98 |
| Scan FAB (small round target) | 0.92 |

Press-in is paired with `hapticLight()`; segment selection fires `hapticSelection()` — haptic + spring is the standard "premium feedback" pair.

### 15.4 Entrance animations (`entering.ts`)

| Helper | Defaults | Platform |
|---|---|---|
| `fadeIn(delay, duration)` | delay 0, duration 300 | **iOS only** — returns `undefined` on Android (blank-frame flicker guard) and web behaves as Android path |
| `fadeInDown` | delay 0, duration 300 | iOS only |
| `fadeInUp` | delay 0, duration 400 | iOS only |

Rules (both docs agree): stagger = `delay: N × 40–50ms` per item/section; total entrance ≤ 500ms; entrances must play **once** (gated with a `hasEntered` ref — never replay on re-render); no bounce/elastic easing; max 2 animated properties per element; >500ms allowed only on splash.

### 15.5 Modal/sheet motion (AppModal)

| Phase | Value |
|---|---|
| `fit` sheet slide-in + backdrop fade-in | timing 220ms |
| fade-out | timing 180ms |
| drag-dismiss slide-out | timing 200ms |
| Full-height native sheet | system `pageSheet` slide |

### 15.6 Continuous/status loops (observed configs)

| Where | Config |
|---|---|
| Connections spinner | rotate loop, 900ms linear, infinite |
| Balance shimmer | 1150ms inOut(quad), infinite |
| QR scan line / slide-to-confirm nudge | withRepeat loops (component-specific) |
| DESIGN_SYSTEM status pulse spec | opacity 0.3 ↔ 1.0, 800ms each way |

## 16. Opacity conventions

| Penpot token | Value | Usage |
|---|---|---|
| `opacity.disabled` | **0.45** | VelaButton disabled/loading (the canonical disabled treatment) |
| `opacity.dim` | 0.4 | Secondary dimming (4 uses) |
| `opacity.backdrop` | 0.35 | Sheet backdrop black |
| misc | 0.5 / 0.6 / 0.7 / 0.8 / 0.92 | Scattered one-offs (overlays on imagery, pressed hints) |

Pressed state is expressed by **scale spring, not opacity** (VelaButton has no pressed-opacity).

---

## 17. Icons

Library: **Lucide** (`lucide-react-native`) exclusively — never emoji/text as icons.

### 17.1 Size usage distribution (observed, count of uses)

| Penpot token (suggested) | px | Count | Typical role |
|---|---|---|---|
| `icon.xs` | 12–13 | 41 | Inline meta glyphs, badges |
| `icon.sm` | 14–15 | 76 | DetailRow copy/open affordances, inline row glyphs |
| `icon.base` | 16 | 60 | List secondary icons |
| `icon.md` | 18 | 78 | **Most common** — row leading icons, nav icons |
| `icon.lg` | 20–22 | 76 | Action buttons, dock pill icons (22) |
| `icon.xl` | 26–28 | 21 | Scan FAB (26), empty-state icons |
| `icon.2xl` | 30–32 | 15 | Empty-state/heroes |
| `icon.3xl` | 36–44 | 20 | Feature heroes, avatars |
| larger | 46–72 | 9 | One-off illustrations |
| non-icon | 120–200 | 6 | QR codes / identicon viewer sizes, not icons |

### 17.2 Stroke widths

| Penpot token | Value | Count | Role |
|---|---|---|---|
| `icon.stroke.base` | 2 | 212 | Default |
| `icon.stroke.bold` | 2.2–2.6 | 77 | Emphasis (small sizes keep legibility; dock icons 2.2, copied-check 2.6) |
| `icon.stroke.heavy` | 3 | 7 | Tiny glyphs |
| `icon.stroke.light` | 1.5 | 3 | Large decorative icons |

Empty-state pattern: 28–32px icon inside a **56px** `bg.sunken` circle.

## 18. Hit targets

| Convention | Value |
|---|---|
| Minimum touch target | **≥ 44×44** (WCAG 2.5.8; DESIGN-LANGUAGE mandates it for plain icon buttons — size or hitSlop) |
| Default `hitSlop` | **8** (81 of ~102 uses) |
| Variants | 6 (8×), 10 (7×), 12 (7×), 16 (1×), plus a few object-form top/bottom-only slops |
| SegmentedToggle segment | `minHeight: 44` explicit |
| Every pressable | `accessibilityRole="button"` + translated label; selected controls expose `accessibilityState.selected` |

## 19. Layout metrics

| Penpot token (suggested) | Value | Source |
|---|---|---|
| `layout.screenPaddingX` | 24 (`space.3xl`) | ScreenContainer horizontal padding; safe-area edges default `['top']`; bg `color.bg.base` |
| `layout.maxContentWidth` | 800 | `MaxContentWidth` |
| `layout.dockBarHeight` | **86** + bottom safe-area inset | `DOCK_BAR_HEIGHT` (WaveDock). The system tab bar is hidden (`tabBarStyle: display none`) — WaveDock IS the bottom bar |
| `layout.scanFabSize` | 56 (circle, overhangs the bar top by 28) | WaveDock `SCAN_SIZE` |
| `layout.dockRowPaddingX` | 12 (`space.lg`), gap 4 (`space.sm`), scan slot = 56 + 8 | WaveDock |
| `layout.bottomTabInset` (legacy) | iOS 50 / Android 80 | `BottomTabInset` — legacy scroll-clearance constant; real clearance now = dockBarHeight + inset |
| `layout.webPhoneFrame` | 390 × 844, radius 20, canvas `#E8E8E8`, shadow `0 8px 40px rgba(0,0,0,0.15)` | Desktop web (≥500px) constrains the app to an iPhone-sized frame; mobile web (<500px) is full-bleed |
| Sheet top radius | `radius.2xl` (20), top corners only | AppModal `fit` |

## 20. Component-encoded token facts (needed for Penpot variants)

These are the primitives’ exact token bindings — full component specs belong to the components report, but these values ARE tokens in practice:

- **VelaButton** — variants: `primary` = fill `color.fg.base` (charcoal in light / light-sand in dark), text `fg.inverse`, `shadow.sm`; `accent` = fill `accent.base`, text `fg.inverse`, `shadow.sm`; `secondary` = transparent fill, 1.5px `border.strong`, text `fg.base`, no shadow. Padding vertical 16 (`space.xl`); compact = vertical 12 / horizontal 20. Text `text.lg` semibold (compact: `text.base`). Radius `radius.xl`. Disabled/loading opacity 0.45; loading swaps text for ActivityIndicator in the text color. Press scale 0.97 spring.
- **VelaCard** — `bg.raised`, `radius.xl`, 1px `border.base`, `shadow.sm`; `elevated` = border transparent + `shadow.md`. No self padding. (Use sparingly per de-container language.)
- **SegmentedToggle** — transparent track, gap 2; floating active chip = `bg.raised` + 1px `border.strong` + `shadow.sm` + `radius.full`, springs position AND width (`motion.spring`); labels `text.base` semibold, inactive `fg.muted` → active `fg.base` (color-only change, never weight); badge = 18px round, `fg.base` fill, `text.xs` bold `fg.inverse`, minWidth 18, paddingX 5.
- **DetailRow / Divider** — row paddingY 12, gap 12; label `text.base` regular `fg.muted`; value `text.base` semibold `fg.base` (mono option = `font.mono`); affordance icons 14px; Divider = 1px `border.base`.
- **AmountText** (atomic-number display) — hero number typography constants: default `tailScale` **0.56** (decimals + unit subordinated), `symbolScale` ≈ **0.58** when the currency symbol is subordinated (design-language principle 5), `minScale` 0.6 (shrink floor before switching to compact notation, e.g. $1.23M), width-fit estimate 0.6em/char, lineHeight ×1.12, single line by default.
- **WaveDock** — bar `bg.raised` + 1px top `border.base`; Send pill = accent fill (`accent.base` bg+border), label `text.xl` bold `fg.inverse`; Receive pill = `bg.base` + `border.strong`, label `text.xl` semibold `fg.base`; pill paddingY 16, radius `radius.xl`, icon 22/2.2; Scan FAB 56px circle `bg.raised` + `border.base` + `shadow.md`, icon 26/2.

## 21. Dark-mode mechanism (behavioral spec)

- Preference: `auto | light | dark` (Settings), stored `vela.colorScheme`, default `auto` (follows OS).
- Resolution: `auto` → OS scheme; concrete otherwise. Applied to native Appearance API (status bar/keyboard/system dialogs) and, on web, to `<meta name="theme-color">` + body background (mobile widths only).
- Token flip: `rebuildColors(isDark)` mutates the shared `color` object in place and bumps the style version; the navigation Stack remounts (`key={resolved}`) so every screen re-renders with the new palette. Design consequence: **every screen must be authored against semantic tokens only; there is no per-component dark styling.**
- Web focus ring adapts via `prefers-color-scheme` (inner ring color swaps `#FAFAF8`/`#141412`).
- Accent `#E8572A` is identical in both modes; shadows keep fixed dark ink in both modes.

---

## 22. Conflicts / stale values flagged (DESIGN_SYSTEM.md vs shipped code)

| # | Topic | DESIGN_SYSTEM.md says | Actual (authoritative) |
|---|---|---|---|
| 1 | `fg.muted` / `fg.subtle` (light) | `#7A776E` / `#B0ADA5` | `#6E6B62` / `#8C887E` (WCAG fix in theme.ts) |
| 2 | `font.display` | SF Rounded (iOS) / System (Android) | PlusJakartaSans_700Bold everywhere |
| 3 | `font.sans` | "System" | Plus Jakarta Sans 400 |
| 4 | Text scale range | 0.85×–1.28× | 0.82×–1.35× (6 levels) + web ×1.2 boost |
| 5 | Tab bar | iOS 60 / Android 56 + inset | System tab bar hidden; WaveDock bar 86 + inset (legacy `BottomTabInset` iOS 50 / Android 80 still exported) |
| 6 | Section-header letterSpacing | 0.8–1.2 | SectionLabel ships 0.6 |
| 7 | error.base | (implied `#EF4444` era) | `#C62828` light / `#F87171` dark |
| 8 | Card-heavy guidance (VelaCard everywhere, confirmation cards, `bg.raised` "cards") | — | OVERRIDDEN by DESIGN-LANGUAGE.md: de-containered, hairline dividers, open heroes; cards only for sheets/warning gates/selected options |
| 9 | Secondary button border | "border" (implied 1px) | 1.5px `border.strong` |
| 10 | Text scale defaults | (text-scale.ts header comment says iOS standard / Android comfortable) | Code sets `standard` on both platforms — the file's own header comment is stale |
| 11 | Fonts bundled in app.json | Inter TTFs | Runtime loads Plus Jakarta from @expo-google-fonts; Inter TTFs appear unused |
| 12 | SegmentedToggle chip | DESIGN-LANGUAGE says "soft bg.sunken chip, no border" | Shipped chip is `bg.raised` + `border.strong` + `shadow.sm` (bg.sunken measured ~1.04:1 — invisible; WCAG 1.4.1 fix). Newer code wins |
