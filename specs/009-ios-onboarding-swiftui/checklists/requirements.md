# Checklist: Requirements & Quality Gates

Verification gates in the 007 house style; the original spec-quality
checklist (all-pass) lives in this file's git history.

## CHK-SCOPE (FR-011 / SC-006)
- [x] `git diff --name-only 270e851..HEAD | cut -d/ -f1 | sort -u` →
  `.specify app-ios design rust specs` only. `.specify` = feature.json
  pointer (speckit mechanics); `design` = committing the previously
  untracked `ios-prompt.md`; `rust` = the new
  `rust/scripts/build-ios-xcframework.sh` only — no crate/source edits.
- [x] Zero i18n corpus changes: no new keys, no locale-file edits, no
  regenerated artefacts (FR-006 reuse-only held; placeholder titles reuse
  the CTA keys).

## CHK-TOKENS (FR-002 / SC-003)
- [x] `node app-ios/scripts/gen-tokens.mjs --check` → "tokens in sync".
- [x] `node app-ios/scripts/sync-catalogs.mjs --check` → "catalogs in sync
  (15 files)".
- [x] `node app-ios/scripts/audit-literals.mjs` → "clean (11 files scanned)"
  after moving 7 preview-block literals onto `Tokens.Space.*`. DesignSystem/
  is the sanctioned exempt layer; additions (`Interaction.pressedOpacity`,
  `WelcomeGeometry.*`, `Control` sizes, `onAccent`) each cite their
  design-system.md license inline.

## CHK-I18N (FR-005/006/007 / SC-004)
- [x] Engine smoke tests pin zh verbatim (`创建钱包`, `您的密钥，您的资产`),
  en fallback for unsupported preferred languages (`ar`, `hi`), de catalog
  non-echo/non-English, and unknown-key echo as the failure signal.
- [x] 27 locale-mapping fixtures (shared.ts semantics): zh-Hans/Hant/HK/MO
  routing, es→es-MX, pt→pt-BR, legacy in→id, fr-CA→fr, unsupported→en.
- [x] Screenshot matrix {dark,light} × {zh,en,de}: every string switches,
  no `onboarding.…` echo visible (scratchpad evidence; re-runnable via
  quickstart's SIMCTL_CHILD_ recipe).

## CHK-CONTRAST (SC-005) — computed from generated tokens, both themes
- [x] fgBase/bgBase ≥ 4.5 ; fgMuted/bgBase ≥ 4.5 ; fgMuted/bgRaised ≥ 4.5
- [x] fgBase/bgRaised ≥ 4.5 (card title + DV-001 secondary label)
- [x] fgSubtle/bgRaised ≥ 3.0 (numeral, decorative-adjacent)
- [x] onAccent/accentBase ≥ 3.0 (DV-004 brand-accent pairing, floor pinned)

## CHK-STATES (FR-004)
- [x] VelaButton pressed state (opacity via `Interaction.pressedOpacity`,
  `motion.fast` ease) and disabled state (`opacity.disabled` 0.45) defined
  once in `VelaButtonStyle`, both kinds, both themes (previews en/zh,
  light/dark).
- [x] Pager dots: ≥24 pt hit areas, accent active pill vs subtle inactive,
  `isSelected` trait + "N/6" labels; CTAs at `Control.lg` 52 pt ≥ 44 pt
  touch floor.

## CHK-VISUAL (FR-001 / SC-002) — vs W1/W1L at 390×844
- [x] dark/zh vs `W1 Welcome _ default.png`, light/zh vs `W1L`: layout order
  (brand row → tagline → card → dots → CTA stack), card radius 16 / padding
  20 / raised surface, pill CTAs at 52 pt, palette spot-checks (bg #141412 /
  #FAFAF8, raised #1E1E1B / #FFFFFF, accent #E8572A, hull themed
  #DED5CE/#554B46) — anchor deltas ≤ ~25 pt on the flexible spacers.
- [x] de long-copy edge case: card band grows (4-line body), nothing clips,
  CTAs stay on-screen.

## CHK-TESTS (FR-012 / SC-001)
- [x] `xcodebuild test` (iPhone 17 Pro, iOS 26.2 sim): 40 passed, 0 failed —
  39 Swift Testing unit cases + 1 XCUITest end-to-end smoke (swipe paging,
  dot jump, both CTA navigations + back).
- [x] Every component ships a light+dark `#Preview`.
