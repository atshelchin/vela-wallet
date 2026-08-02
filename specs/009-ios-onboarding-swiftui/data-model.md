# Data Model: iOS Onboarding in SwiftUI

No persistent data (spec assumption; 006/007 parity). Everything below is
in-memory state or generated value tables.

## Token model (DesignSystem)

```
Tokens (GENERATED from docs/design-tokens.json — struct of static constants)
├── core: space 0…48, text 10…40, weight 400…700, radius 0…9999,
│         leading, opacity, motion durations, shadows, layout (screenPaddingX,
│         frameW/H), border widths, letterSpacing
├── light: semantic colors (bg.base/raised/sunken, fg.base/muted/subtle/inverse,
│          accent.base/soft, success/warning/error/info.base/soft,
│          border.base/strong, fixed.*)
└── dark:  same shape, color-dark set

Theme (hand-written resolver)
├── init(colorScheme) → picks Tokens.light | Tokens.dark        (exactly one set)
├── additions: onAccent, controlSm/Md/Lg (36/44/52), mock-measured
│              welcome-screen constants — each entry cites design-system.md
└── exposed to views via SwiftUI Environment

TypeRole (Typography.swift): display / title / body / tagline / label / button
  → (font: PlusJakartaSans weight + size from core.text, lineHeight from
     core.leading); Dynamic Type scales relative to the token size.
```

Invariants: `Tokens.swift` is the only generated file and the only file
containing raw values; `Theme`/`Typography` compose tokens and the documented
additions; no other file names a color, size, radius, shadow, font or duration
(SC-003 literal audit).

## Locale state (Localization)

```
Loc (@Observable, single instance owned by App layer)
├── engine: VelaCore.I18n          — created once: I18n(fallbackJson: en bytes)
├── resolved: String               — LanguageState.resolvedLanguage after
│                                    changeLanguage(mapped preferred language)
├── t(_ key: String, vars…) → String   — the only translation call site
└── resolution: VELA_LANG override → Locale.preferredLanguages.first
                → shared.ts mapping (D6) → engine ladder [active, "en"]
```

States: `unloaded → fallbackReady (en) → localeReady (≤2 resident catalogs)`.
Failure mode: missing key returns the key itself (visible echo = FR-005
failure signal); a catalog that fails to load leaves `fallbackReady` (English
screen, never mixed).

## Onboarding view state (Features/Onboarding)

```
WelcomeModel (@Observable)
├── cards: [FeatureCard]           — 6 items, fixed order, built once from Loc
│     FeatureCard { index: Int, numeral: "0\(index+1)", title, body }   (strings pre-resolved)
├── currentPage: Int ∈ 0…5        — carousel position; clamped, no wrap (US2)
└── intent(_: OnboardingIntent)    — single sink (FR-010)

OnboardingIntent = .createWallet | .importWallet

AppRoute (App layer, NavigationStack path)
= .createWalletPlaceholder | .importWalletPlaceholder
```

Transitions: swipe / dot tap → `currentPage` (animated, `motion.base`);
CTA press → `intent` → append matching `AppRoute`; back pops to Welcome.
Relaunch resets everything (`currentPage = 0`), nothing persisted.

## Bundled resources

| Resource | Count | Source of truth | Sync gate |
|---|---|---|---|
| `<lng>.json` at the app-bundle root | 15 | `public/i18n/*.json` (gen-i18n.mjs) | `gen-catalog-filelists.mjs --check` |
| `DesignSystem/Tokens.swift` | 1 | `docs/design-tokens.json` | `gen-tokens.mjs --check` |
| `DesignSystem/Fonts/*.ttf` | 4 | `@expo-google-fonts/plus-jakarta-sans` | copied once + OFL license |
| `VelaCoreKit/Sources/VelaCore/*.swift` | 1 | `vela-core-uniffi` crate | rebuild script; regen = no diff |
