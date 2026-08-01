# Quickstart: Desktop Onboarding in GPUI

## Build & run

```bash
cd app-desktop/vela-wallet
cargo run                      # system appearance + system/env locale
VELA_THEME=dark cargo run      # force dark
VELA_THEME=light VELA_LANG=zh cargo run   # light + Simplified Chinese
VELA_LANG=de cargo run         # any of the 15 supported tags; unknown → en
```

The window opens at 1280×800 (the mocks' logical size), which is also the
minimum; wider windows flex the card grid (see below).

## Verify against the mocks

- Light: compare with `design/onboarding/D1L Welcome _ desktop light.png`
- Dark: compare with `design/onboarding/D1 Welcome _ desktop dark.png`
- Flip macOS System Settings → Appearance while the app runs: it restyles live
  (unless `VELA_THEME` pinned it).
- Hover the two buttons: primary darkens, secondary fills sunken; both show a
  pointer cursor. Click each: the chosen intent is logged to stderr (navigation
  is a later feature).
- Resize the window wider: the action panel keeps its width; the three cards in
  each row widen equally (204 px is the floor at the 1280 minimum).

## Localization corpus round-trip

After editing any `rust/crates/vela-core/i18n/locales/**` file:

```bash
node scripts/gen-i18n.mjs      # regenerates paths.rs, catalogs, resources.ts, public/i18n
git diff --stat                # regenerated artefacts must be committed as-is
cargo test -p vela-core --features i18n-all   # conformance corpus stays green
```

`gen-i18n.mjs` fails loudly if the 15 locales' key sets diverge — add new keys to
every locale in the same change.
