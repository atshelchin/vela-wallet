# Results: Contacts UI Components & Preview Galleries

**Branch**: `018-contacts-ui` · **Date**: 2026-08-09

## Delivered

- **i18n** (`7551ebb`): 21 new `contacts.*` leaves × 15 locales, plus two
  value updates (`searchPlaceholder` → 搜索名字、ENS 或地址,
  `emptyHint` → the C3 caption). Path pins 1312 → 1333 / leaves 1234 →
  1255 (no new branches). `gen-i18n` + `lint:i18n` (baseline updated for
  the four new `{{count}}` singles, class A5 — same shape as the existing
  `contacts.groupMembers`) + `verify:i18n` (68,825 comparisons) +
  `cargo test -p vela-core --features i18n-all` green; conformance
  vectors regenerated via `npm run dump:vectors`.
- **Web**: 22 files under `src/lib/contacts/` — 16 components,
  `ContactsHome` (c1/c1s/c1f/c2/c2s/c3/c4/c5/c6), `ContactsDesktop`
  (dc1–dc6 + dc2n), canon fixtures + 42 fixture tests, 11 icons,
  `resolveContactsMessages`, gallery boards (42 stable ids) and
  `[state]` entries for all 16 states × zh/en.
  `check` / `lint` / `test:unit` (163) / `build` / `test:e2e` (41) green;
  all 16 states screenshot-compared against the mocks.
- **Desktop**: `src/contacts/` (strings + canon fixtures + components),
  `Section { Wallet, Contacts }` on the reused three-column shell,
  `PanelId::ContactDetail`, the codebase's first anchored menus
  (`deferred(anchored(...))` for the header ⋯ dropdown and the group-row
  right-click), gallery chips DC1–DC6 + contacts board,
  `VELA_PAGE=contacts`. `cargo check` / `clippy --all-targets` (zero
  warnings) / `cargo test` (37) green.
- **Android**: `feature/contacts/` — 21 files, all C-states,
  `ContactsGalleryScreen` chips + 1.35× text-scale chip, nav routes
  `contacts` / `contacts-gallery`, index rail with haptics + bubble HUD,
  swipe-reveal rows, `ContactsFixturesTest` (10). `testDebugUnitTest`
  (47) + `assembleDebug` green; token-literal scan of the new package
  clean.
- **iOS**: `Components/Contacts/` (10) + `Features/Contacts/` (6) +
  `ContactsGeometry.swift` + `ContactsFixturesTests` (22),
  `VELA_PAGE=contacts|contacts-gallery` with `VELA_STATE` preselect.
  xcodebuild build + full test suite green; `audit-literals.mjs` clean
  (61 files); `gen-tokens.mjs --check` in sync; every mobile state
  screenshot-compared against the mocks on an iPhone 17 Pro simulator.

## Post-implementation correction (orchestrator review)

**Detail hero avatar was inconsistent across platforms and wrong on
three of them.** The four agents shipped 96 (Android), 96 (web mobile),
64 (iOS), 64 (desktop). Measuring the mocks pixel-wise settled it: the
C2 hero circle is **64×64** at the 390-wide frame (y 116–179, x 164–227)
and the DC2 panel avatar is **48×48** (y 81–128, x 900–947). All four
platforms were re-aligned to 64 mobile / 48 desktop, and
`data-model.md` + `research.md` D9 were corrected — the ~96/~64 figure
in the original spec docs was an estimate, not a measurement. Web
`pnpm check`/`test:unit`, desktop `cargo test`, Android
`testDebugUnitTest` re-run green after the change; iOS was already
correct and untouched.

## Open design questions (need the design owner)

1. **Index rail length.** All four platforms render the full A–Z + #
   (27 entries) per research D4; mock C1 shows a condensed rail
   (≈13 letters: A B C D F H L M S T W Z #). The platforms agree with
   each other, so this is a single decision, not drift. Recommendation:
   follow the mock — a mostly-dead 27-letter rail over 8 contacts reads
   worse than the condensed one.
2. **Row avatar 40 vs 36.** Contact rows reuse spec-015's 40 dp avatar;
   both C1 and DC1 measure **36**. Kept at 40 for cross-feature
   consistency (SC-006 reuse) — say the word and it becomes a
   contacts-local 36.
3. **CTA shape (iOS).** `VelaButton` renders capsules; C3/C4 mock CTAs
   read as ~12 pt rounded rects. Reused the single authoritative control
   rather than forking a second button shape.

## Recorded deviations (documented choices, no action needed)

1. **Identicon artwork ≠ mock avatars.** The mocks draw stylised
   pixel-art; the apps render the real vela-core Nimiq identicon. For
   the seven contacts whose full addresses are pinned inventions
   (research D7) the artwork additionally cannot match by construction.
   Cross-platform parity (SC-003) holds — every client seeds from the
   same canon strings through `normalize_seed`.
2. **Eight-contact roster vs DC1's seven rows.** The canon ships 妈妈
   under an extra M section (spec Assumptions); the 8 位 count is
   therefore honest and the mock's row list is one short.
3. **`dc2n` narrow overlay is web-only.** The native desktop window
   minimum is 1280×800, so the <1120 state is unreachable there
   (research D6). `DESKTOP_STATES` on desktop pins the six reachable
   ids; the web build has both the live media-query overlay and the
   pinned 1024 stage.
4. **No swipe gesture on web** (research D5). `c1s` renders the revealed
   state statically, and the revealed row yields trailing width instead
   of translating content off the leading edge — a full 144 px translate
   pushed the avatar and name outside the 390 px frame.
5. **Android swipe uses `draggable` + `Animatable`**, not
   `AnchoredDraggable` (same 250 ms ease-out reveal; the anchored API's
   recent constructor churn was not worth the build risk).
6. **Spec-015 components were extended in place, never duplicated**
   (SC-006): `SectionHeader` gained a note/chevron toggle, `Identicon`
   gained the two detail sizes, `BottomSheet` gained `hideTitle`,
   `ActionButtonRow` gained an item-list form, `WalletTabBar` (iOS)
   gained `selected`/`onSelect`, `EmptyState` (Android) gained a CTA
   slot. All original signatures and call sites still compile and pass.
7. **Web adds 11 `WEB_ADDITIONS` tokens** (overlay breakpoint, the six
   motion constants FR-011 requires, two identicon sizes, rail/menu
   widths). `docs/design-tokens.json` — shared with the other three
   platforms — was not touched, per research D9. The literal audit now
   allows exactly two px literals (1280, 1120), both pinned to
   `tokens.ts` exports and both only on `@media` lines; the scan set was
   extended to `src/lib/contacts/**`.
8. **Addresses render in the platform monospace** on Android via a new
   `VelaMonoFontFamily` projection (no mono face is bundled — DV-004 of
   spec 015 still holds).
9. **Desktop DC2 address uses the 11 px label size**, not the 13 px mono
   address size, so all 42 characters fit one line inside the 400 px
   third column as the mock shows.
10. **Menu elevation on desktop uses gpui's `.shadow_lg()`** — the theme
    layer defines no shadow token and hand-rolling one would put literal
    hsla values in feature code.
11. **Unmocked edge cases** resolved uniformly and pinned in fixtures:
    search-empty reuses `EmptyState` with `contacts.noResults`; empty
    group disables the pinned 群发转账 CTA with a re-counted caption;
    "contact with no activity" ships on Android/desktop (Inbox glyph in
    the 最近往来 section) but not on web, where no fixture exercises it.
12. **Contact-row right-click** (转账/收款/复制地址/编辑/移入分组/删除)
    renders as a desktop component-board fixture only, per data-model.md;
    group-row right-click is live (DC6).
13. **Android swipe-action labels are white on the accent/error fills.**
    Against the dark-mode error fill (#F87171) that pairing is below AA.
    The state is not mocked, so it is recorded rather than re-toned.
14. **Back-chevron a11y label (Android)** reuses `onboarding.common.back`
    — the contacts namespace has no generic 返回 and the mock's chevron
    is unlabelled; no new corpus key was added for it.
15. **Gallery chrome collision (web).** The fixed top-right spec-015
    Controls overlap the desktop header's 添加联系人 / ⋯ at 1280. Pre-
    existing chrome, not introduced here; DC5's dropdown still opens
    correctly.

## Verification gaps (need a human with hardware)

- **Desktop**: no rendered comparison against DC1–DC6. `screencapture`
  is denied on this host (no Screen Recording TCC) and the app is an
  interactive gpui window. Run
  `VELA_PAGE=gallery VELA_LANG=zh VELA_THEME=dark cargo run` from
  `app-desktop/vela-wallet` and walk the DC chips.
- **Android**: no device comparison against C1–C6. No physical device
  was attached and the Pixel_7_API_34 AVD started but never registered
  with adb (5554/5555 refused). Everything is verified at source +
  fixture-test level. Walk it with
  `adb shell am start -n app.getvela.wallet/.MainActivity --es vela.startDestination contacts-gallery`.
- **ru i18n headroom**: the Russian catalog value blob is now
  **65,386 / 65,536 bytes** (~150 bytes left). The next feature that
  touches the corpus must widen `Offset` to u32 in `catalog.rs` first —
  `gen-i18n.mjs` will hard-fail otherwise.

## Gate summary

| Platform | Gates | Result |
|---|---|---|
| core/i18n | gen:i18n, lint:i18n, verify:i18n, cargo test (i18n-all), dump:vectors | pass |
| web | check, lint, test:unit (163), build, test:e2e (41) | pass |
| desktop | cargo check, clippy --all-targets, cargo test (37) | pass |
| android | testDebugUnitTest (47), assembleDebug, literal scan | pass |
| ios | xcodebuild build, xcodebuild test, audit-literals, gen-tokens --check | pass |

Visual passes: web (all 16 states) and iOS (all mobile states) done;
desktop and Android pending the hardware notes above.
