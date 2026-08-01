# Implementation Plan: Desktop Onboarding in GPUI

**Branch**: `007-desktop-onboarding-gpui` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-desktop-onboarding-gpui/spec.md`

## Summary

Turn the `app-desktop/vela-wallet` hello-world scaffold into a GPUI app rendering
the Onboarding welcome screen from the D1/D1L mocks, on top of the shared core:
theme tokens in one module (light + dark, system-appearance driven), all copy
through `vela-core`'s i18n engine (13 new keys × 15 locales added to the corpus
and regenerated), reusable button/card/logo components, and a page module that
only composes. Research settled the risky parts: gpui is pinned to the
demo-proven rev `c97b7c0` (D1), the logo renders as exact `PathBuilder` béziers
because the default AssetSource silently drops `svg()` (D2), the palette and
geometry are sampled from the mocks rather than eyeballed (D3/D5), and the one
place the dark mock contradicts the input's contrast requirement is recorded as a
deviation, not silently patched (D4).

## Technical Context

**Language/Version**: Rust, edition 2024 (app crate); gpui pinned at zed rev
`c97b7c0` via committed `Cargo.lock` (D1)

**Primary Dependencies**: `gpui`, `gpui_platform` (font-kit feature),
`vela-core` (path dep, feature `i18n-all`). Removed from the scaffold: `wry`,
`serde_json` (unused by this feature; the scaffold's `main.rs` was
`println!("Hello, world!")`)

**Storage**: none. No I/O at runtime beyond env-var reads at startup.

**Testing**: `cargo build` + `cargo clippy` (SC-001); `cargo test -p vela-core`
must stay green after the corpus change (SC-003); visual verification via
screenshots of the running app across {light,dark} × {zh,en,de} (SC-002/SC-004);
token-level contrast computation (SC-005).

**Target Platform**: macOS first (the machine this builds on); no
platform-specific code outside window-chrome options.

**Project Type**: standalone binary crate (not a member of the `rust/` workspace;
path-dependency into it, same as the scaffold already did).

**Performance Goals**: none beyond GPUI defaults — a static screen; no animation
in scope (spec Out-of-scope).

**Constraints**: FR-011 scope discipline — the only files outside
`app-desktop/vela-wallet/` and `specs/007…/` that change are the 15 locale
`onboarding.json` sources and the artefacts `gen-i18n.mjs` regenerates from them
(plus `design/onboarding/` assets, committed as the design source referenced by
this spec).

**Scale/Scope**: ~6 source modules, ~800 lines of new Rust; 13 keys × 15 locales
of new copy; 4 regenerated artefact groups.

## Constitution Check

`.specify/memory/constitution.md` is the unfilled template — no ratified
principles to gate against. Applied the repo's operative conventions instead:
spec-kit document set, generated-files-stay-generated (spec 004), scope
discipline per the feature input.

## Project Structure

```
app-desktop/vela-wallet/
├── Cargo.toml            # gpui pinned, vela-core i18n-all; wry/serde_json dropped
├── Cargo.lock            # committed (D1)
└── src/
    ├── main.rs           # entry: window options, root view
    ├── theme.rs          # ThemeMode + Theme token struct, light()/dark(), detect()
    ├── loc.rs            # Loc: I18n engine wrapper, locale detect, t() -> SharedString
    ├── onboarding.rs     # OnboardingPage: composition, intents, appearance observer
    └── ui/
        ├── mod.rs        # re-exports
        ├── button.rs     # VelaButton: Primary | Secondary, hover/active per theme
        ├── card.rs       # feature_card(theme, n, title, body)
        └── logo.rs       # vela_mark(theme, size): PathBuilder béziers from SVG geometry
```

Module boundaries enforce FR-009: `theme.rs` is the only file naming a color;
`loc.rs` the only file touching `vela_core::i18n`; `ui/*` take `&Theme` +
already-resolved strings (components know nothing about i18n); `onboarding.rs`
alone maps clicks to intents and owns the window-appearance observer;
`main.rs` alone creates the window.

## Phase Log

- **Phase 0 (research)**: complete — [research.md](./research.md) D1–D8.
- **Phase 1 (design)**: complete — [data-model.md](./data-model.md) (token/state
  model), [quickstart.md](./quickstart.md) (build/run/verify),
  [checklists/requirements.md](./checklists/requirements.md).
- **Phase 2 (tasks)**: [tasks.md](./tasks.md) — 18 tasks, T001–T018.
