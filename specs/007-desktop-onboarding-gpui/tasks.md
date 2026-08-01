# Tasks: Desktop Onboarding in GPUI

**Input**: plan.md, research.md, data-model.md. `[P]` = parallelizable.

## Phase A — Infrastructure

- [x] **T001** Create branch `007-desktop-onboarding-gpui`; commit
  the desktop-relevant `design/onboarding/` assets (D1/D1L mocks, logo
  SVGs, gpui-prompt.md) as the design source of record; web/iOS assets in
  the same folder stay untracked.
- [x] **T002** `app-desktop/vela-wallet/Cargo.toml`: pin gpui via committed
  `Cargo.lock` seeded from gpui-demo (rev `c97b7c0`); add
  `vela-core = { path, features = ["i18n-all"] }`; drop unused `wry`/`serde_json`.
- [x] **T003** Verify toolchain: `cargo build` compiles the dependency graph.

## Phase B — Localization corpus (FR-005/006/007)

- [x] **T004 [P]** Author `en` + `zh` values for the 13 new
  `onboarding.welcome.*` keys (zh verbatim from the mocks).
- [x] **T005 [P]** Produce the other 13 locales' values (translation +
  independent adversarial review per locale, 26-agent workflow), grounded in
  each locale's existing onboarding terminology.
- [x] **T006** Insert the new keys into all 15
  `rust/crates/vela-core/i18n/locales/<lng>/onboarding.json` (pure additions —
  15 × +15/−1 lines, the −1 being the preceding key's comma).
- [x] **T007** `node scripts/gen-i18n.mjs`; regenerated `paths.rs` (1205 → 1218
  paths), 15 catalogs, `resources.ts`, `public/i18n/*.json`; generator tripwire
  constants updated 1205/1141 → 1218/1154 (+13 leaves, branches unchanged;
  `setupPasskeyIndex` was added then removed with its UI block per DV-002).
  SC-005 residency stays in budget: ja+en = 124,183 / 135,345.
- [x] **T008** `cargo test -p vela-core --features i18n-all` green (all
  binaries); `lint:i18n` reports "no new defects"; generator idempotent
  (identical diff hash across two runs) (SC-003).

## Phase C — App modules (FR-002/003/004/008/009)

- [x] **T009 [P]** `src/theme.rs`: `ThemeMode` (env override + appearance
  detect), `Theme` struct, light/dark palettes from research D3, spacing/radius/
  type constants.
- [x] **T010 [P]** `src/loc.rs`: `Loc` wrapper (engine construction, env locale
  ladder, embedded catalog load, `t()` → `SharedString`).
- [x] **T011 [P]** `src/ui/logo.rs`: Vela mark via `PathBuilder` béziers from the
  SVG geometry (D2), hull themed.
- [x] **T012** `src/ui/button.rs`: `VelaButton` primary/secondary with per-theme
  hover/active, capsule geometry, pointer cursor.
- [x] **T013** `src/ui/card.rs`: feature card (numeral, title, body) on theme
  tokens; grid-agnostic (no layout knowledge).
- [x] **T014** `src/onboarding.rs`: page composition per D5 geometry; single
  `Intent` sink (FR-010); divider + link block later removed per DV-002; card
  grid flexes with the window width (user direction).
- [x] **T015** `src/main.rs`: window options (1280×800 design size = minimum,
  transparent titlebar, traffic lights at mock position), appearance observer
  wiring, root view.

## Phase D — Verification

- [x] **T016** SC-001: `cargo build` + `cargo clippy` clean, zero warnings from
  the new code.
- [x] **T017** SC-002/004 — adapted: pixel screenshots are blocked on this
  machine (`CGPreflightScreenCaptureAccess() == false`; Screen Recording not
  granted to the host process — grant it in System Settings → Privacy to
  re-run the screenshot matrix). Evidence recorded instead:
  - SC-004 as unit tests: `loc::tests::welcome_keys_resolve_without_echo`
    proves all 16 welcome keys resolve in en/zh/de/zh-TW/ru with no key echoes
    and no silent English fallback; `zh_matches_the_mock_verbatim` pins the
    mock copy byte-for-byte.
  - Live run: app launched (`VELA_LANG=zh` → "locale resolved to `zh`"), and
    the intents (including CreateWallet / RecoverWallet) fired via real
    clicks in the session log — button and hover/click wiring verified
    interactively.
  - Geometry/palette are compile-time constants traceable to the mock
    measurements in research.md D3/D5.
- [x] **T018** SC-005 as a unit test (`theme::tests::contrast_floor_holds_in_
  both_themes` — 8 pairs × 2 themes); 8-agent adversarial review workflow over
  the staged diff (4 dimensions × verify); findings fixed; final commit.
