# Data Model: Desktop Onboarding in GPUI

No persistent data. Three in-memory models:

## Theme

```
ThemeMode = Light | Dark
  detect(window):  VELA_THEME override → window.appearance() → Light

Theme {
  // backgrounds
  bg_base, bg_raised, bg_sunken,
  // foreground ladder
  fg_base, fg_muted, fg_subtle, fg_inverse,
  // brand + states
  accent, accent_hover, accent_active,
  // structure
  border_card, outline_strong, divider,
  // logo
  logo_sail_a, logo_sail_b, logo_hull,
  // elevation
  card_shadow: BoxShadow params (y, blur, alpha),
}
Theme::of(mode) -> &'static Theme   // the two palettes from research.md D3
```

Numeric tokens are named module constants on the 4 px grid except where the
mock says otherwise (card gap 14, title→body 6): insets 96/32/84, rhythm
104/56/40/24, card 140-min/16-pad/16-radius, buttons 52 & 48 (capsule ⇒
radius = h/2), type scale 12/13/16/26/42 with weights per DESIGN_SYSTEM §2.3.

Invariants:
- Every color pair listed in checklists/requirements.md CHK-CONTRAST meets
  4.5:1 (body) / 3:1 (large) in **both** palettes.
- `accent` identical across modes (mock-verified); interaction states derive
  darker in light mode and stay ≥ the base's contrast for white labels.

## Localization

```
Loc {
  engine: vela_core::i18n::I18n,   // en pinned fallback + one active catalog
}
Loc::from_env()    // VELA_LANG → LC_ALL → LC_MESSAGES → LANG → "en"
loc.t("onboarding.welcome.<leaf>") -> SharedString
```

Key inventory used by the screen (all under `onboarding.welcome.`):

| Key | Screen role |
|---|---|
| `desktopTagline` | hero tagline (one line, no trailing period) |
| `featureNoMnemonicTitle/Body` | card 01 |
| `featureOneAddressTitle/Body` | card 02 |
| `featureOpenSourceTitle/Body` | card 03 |
| `featureKeyCustodyTitle/Body` | card 04 |
| `featureSafeContractTitle/Body` | card 05 |
| `featureStablecoinGasTitle/Body` | card 06 |
| `createWallet` | primary CTA (pre-existing key) |
| `alreadyHaveWallet` | secondary CTA (pre-existing key) |

Non-localized renders: card numerals `format!("{:02}", n)`; wordmark
"Vela Wallet" (proper name, FR-005).

## Page state

```
OnboardingPage {
  theme_mode: ThemeMode,     // updated by observe_window_appearance
  loc: Loc,                  // immutable after construction
}

Intent = CreateWallet | RecoverWallet
on_intent(Intent)            // single sink (FR-010); this release: structured log
```

Hover/active state is not modeled — gpui's `.hover()`/`.active()` style layers
own it, which is what keeps interaction feedback in the component layer.
