# Results: Wallet Home UI Components & Preview Galleries

**Branch**: `015-wallet-home-ui` · **Date**: 2026-08-08

## Delivered

- **i18n** (`1ac905b`): 14 new leaves in existing namespaces × 15
  locales; tripwire 1245 → 1263; corpus lint + 67,790-comparison parity
  suite green. Everything else the mocks say was already in the corpus,
  zh verbatim.
- **Core** (`88be2e9`): `identicon-raster` feature (resvg → PNG) with
  size cap + tests; `identiconPng`/`identiconPlaceholderPng` over
  uniffi; Kotlin bindings + Swift bindings/xcframework regenerated;
  40,890 Kotlin conformance cases green; wasm graph verified resvg-free;
  identicon parity suite: 200,482 seeds byte-identical.
- **Web** (`c3393c6`): 20 components, all 13 states, gallery routes,
  fixture unit tests; `check`/`lint`/`test:unit`/`build` green; worker
  wasm-free; H1/H5/H8/D2 eyeballed against the mocks in Chrome (dark +
  light).
- **Desktop** (`8c34d28`): three-column wallet with closable third
  panel (Receive / Asset detail, ✕ + Esc), `VELA_PAGE=wallet|gallery`,
  gallery chips + component + identicon boards; 22 tests green; smoke
  run clean. Screenshots are impossible from the agent host (no Screen
  Recording TCC) — visual pass is the user's.
- **Android** (`957e38f`): all 10 H-states + gallery route
  (`vela.startDestination` extra), identicon via `identiconPng`;
  `testDebugUnitTest` + `assembleDebug` green; states verified on a
  Pixel 7 API 34 emulator against the mocks (zh per-app locale, dark +
  light).
- **iOS** (`fb998ac`): all 10 H-states + gallery (`VELA_PAGE`, plus a
  `VELA_STATE` preselect for headless screenshots), identicon via
  `identiconPng` behind an environment-injectable provider; 13 new
  fixture tests; `audit-literals.mjs` + xcodebuild build/test green on
  an iPhone 17 Pro simulator; every state screenshot-compared against
  the mocks.

## Recorded deviations (design system wins / documented choices)

1. **Avatars are identicons, not lettermarks** — the mocks still show a
   "大" letter circle; spec FR-006 mandates the switch. Every platform
   renders vela-core's rasterization/SVG of the same bytes.
2. **H7x content** — the H7x mock scales *default* content; data-model
   (canonical) defines H7x = H7 extreme fixture at 1.35×, and all
   platforms follow data-model.
3. **iOS icons are SF Symbols** (research.md D2): platform-idiomatic
   solid/outline pairing instead of the shared corpus glyph geometry.
4. **Desktop dark sidebar** uses `bg_base` + divider (light uses
   `bg_sunken`): spec-007's dark `bg_sunken` (0x262622) is lighter than
   the canvas, which would invert the mock's hierarchy.
5. **Desktop titlebar chrome** (drag strip/window controls from the
   onboarding page) is not replicated on the wallet/gallery pages —
   Linux CSD users move the window from the onboarding entry; the
   gallery is a dev surface. macOS/Windows native paths unaffected.
6. **Android dApp subtitle can truncate** at default width because the
   title/amount columns split 1:1 so H7's 1,234,567.8901 never clips
   (mock's narrower amount column shows the subtitle fully).
7. **Gallery chrome strings** (state chip labels, seed captions) are
   untranslated technical identifiers; gallery is unreachable from
   production navigation (FR-004).
8. **Web `LaunchAnimation.svelte` reformat** — pre-existing prettier
   drift surfaced by the fresh install; formatted in `c3393c6`.
9. **Number/date strings ship pre-formatted in fixtures** (spec
   assumption): 今天 14:02 composes day-word + literal clock; 8月1日 is
   literal fixture data.
10. **iOS audit gate amended narrowly** — quoted `0x…` tokens (fixture
    wallet addresses) no longer trip the hex-color rule; numeric
    `0xAARRGGBB` and `"#RRGGBB"` remain caught, and `WalletGeometry.`
    joined the sanctioned prefixes (reviewed: a scoping fix, not a
    weakening).
11. **iOS H1 shows only the first two activity rows** (per data-model's
    H1 description) where web/Android render the full model and rely on
    the 844 pt viewport to clip — same visible result at frame height.
12. **QR finder squares are 7×7 with an off ring** (the web reference
    algorithm all platforms ported); data-model.md's "5×5" wording was
    imprecise.

## Gates summary

| Gate | Result |
|---|---|
| `node scripts/gen-i18n.mjs` + `lint:i18n` + `verify:i18n` | green |
| `cargo test -p vela-core --features i18n-all` / `identicon-raster` | green |
| `rust/scripts/smoke-kotlin.sh` (conformance via bindings) | green |
| `npm run verify:identicon` | green (200,482 seeds) |
| web `pnpm check && pnpm lint && pnpm test:unit && pnpm build` | green |
| desktop `cargo test` (22) + smoke run | green |
| android `testDebugUnitTest` + `assembleDebug` + emulator walkthrough | green |
| ios `audit-literals` + xcodebuild build/test + sim screenshots | green |
