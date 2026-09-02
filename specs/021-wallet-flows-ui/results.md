# Results: Wallet Flows UI (receive / send / activity / assets)

**Branch**: `021-wallet-flows-ui` · **Date**: 2026-09-02

## Delivered

Four journeys — 收款 / 转账 / 活动 / 资产 — as one component vocabulary
built four times, wired into each client's real navigation. Business
state is deliberately not connected: every panel reads from a canon
fixture, and every fixture reuses spec 015's identity and spec 018's
contact roster so identicon artwork matches across features and clients.

- **i18n** (`b9fcae0e`): 33 new leaves × 15 locales across `receive`,
  `send`, `assets`, `addToken` and `componentsUi`. `gen-i18n` path pin
  1429 → 1462 (1382 leaf + 80 branch); the root jest leaf pin 19,953 →
  20,448. `gen:i18n`, `lint:i18n`, `verify:i18n`, `dump:vectors` and the
  root leaf-count test all green.
- **Web** (`e3436570`): `src/lib/flows/` — 14 UI primitives, 14 screens,
  a `FlowNav` with a real `history.pushState` stack, and prerendered
  states on `/[locale]/wallet`. `qr-pattern.ts` extracted so the
  placeholder and the card share one generator. Spec 015 components
  (`AssetRow`, `BottomSheet`, `ThirdPanel`, `TokenIcon`) extended in
  place, never forked. `check` (721 files, 0 errors) and `test:unit`
  (208) green.
- **Android** (`49c87dab`): `feature/flows/` — models, fixtures, screens,
  host, nav, plus `components/{FlowChrome,FlowRows,FlowBlocks,ScanSurface}`
  and a gallery screen. `AssetRow` gained dimmed/selected/trailing/onClick
  and `TokenIcon` an inline size. `WalletFlowFixturesTest` (17).
- **iOS** (`7d384d8d`): `Features/Flows/` + `Components/Flows/` +
  `WalletFlowGeometry`, reached from `RootView` with a real flow stack.
  `WalletFlowFixturesTests` (19). Verified on an iPhone simulator.
- **Desktop** (`99956ba1`): `src/flows/` — 19 third-column panel states,
  15 components, and a step table. DS1L is a centred modal, not a column:
  a 400 px column is the wrong shape for a viewfinder. `cargo clippy
  --all-targets` clean of anything this feature introduced, `cargo test`
  83 green. **All 19 panels compared against the mocks**, light and a
  dark spot check.

## Defects found by looking at the rendered app

Each of these compiled, typechecked and passed its unit tests first.

**Web**
1. The fee row's token glyph was clipped — a CSS wrapper scaled the
   circle but not the letters. `TokenIcon` gained a real `size` prop;
   the same fix was mirrored to Android and iOS.
2. Sweep rows printed `••••` because `fiat: { kind: 'masked' }` was
   reused where the row has no fiat at all. `AssetFiatModel` gained an
   explicit `{ kind: 'none' }` on all three mobile clients.
3. The desktop fee row and recipient picker were dead affordances — the
   mocks draw the chevron but no panel followed it. Added `dsd2c` /
   `dsd2e` / `dsd2f`.

**Desktop**
4. **The scrim did not dim.** `bg_base.opacity(0.55)` is white over white
   in the light palette, so `VELA_FLOW=DS1` was pixel-identical to the
   plain wallet page. The design system already had
   `color.fixed.backdrop` (rgba(0,0,0,0.35)); the desktop theme now
   carries it. The **sign-out dialog shared the defect and shares the
   fix** — it is spec 015 code, changed deliberately.
5. **Nine text sizes read `text_badge_glyph()`** — 26 px, the glyph
   inside an 88 px status disc. The fee row was drawing its ticker
   larger than the circle around it, and a recipient card's ordinal at
   twice its intended size.
6. **Cards were white where the mocks are warm grey.** Sampled off the
   light mocks, every field and card in these panels is `#f5f3ef`
   against the column's `#fafaf8`. Eleven call sites moved to
   `bg_sunken`; `bg_raised` stays for what sits *on* one of those.
7. **The back chevron sat on its own row** under the close button. The
   mocks draw one bar — chevron, title, close — with a hairline under
   it. `panel_scaffold` gained a leading slot and an optional rule.
8. **DSD4L printed its headline twice**, once as the bar's title. The
   send column keeps the journey's name across its steps.
9. **The QR card's cut-out mark followed the theme**, so the dark
   palette punched a dark hole in a code a camera still has to read. It
   is now drawn against `Theme::light()`, which the card always is.
10. **The dot cluster in the chain pill measured zero** and painted over
    the label beside it — negative margins, and the row does not report
    the width it paints. The cluster's width is now stated.
11. **DT1L's chain pill and add action were missing** outright, and
    DT4L's empty card put its CTA above the question it answers.
12. **DSD1L's title said "Select Token"** where the mock says 转账, and
    its multi-send CTA was a full ghost button where the mock has a
    quiet centred link.
13. **DT3L printed "USDT · Network 6 · Ethereum"** — `label_network`
    where the mock says 精度 (decimals).

## Recorded deviations (documented choices, no action needed)

1. **Desktop hosts 19 of the 30 states by design.** The share card, the
   mobile network-filter pill, the identicon viewer, the sweep selector
   and the searched-to-empty variants are mobile-matrix states.
   `FlowStrings` still resolves their vocabulary, carries an
   `#[allow(dead_code)]` and says why — deleting the unread ones would
   make the next desktop panel re-derive them.
2. **`VELA_FLOW=DSD2`** opens the window straight onto one panel. Same
   dev-seam family as `VELA_GALLERY_STATE`; it is also the only way a
   shell with no Accessibility grant can screenshot a state it cannot
   click to.
3. **Recipient names render in the monospace face on all four clients**,
   including when the value is a saved contact's name. The slot holds an
   address whenever no contact matched, and one face keeps the column
   aligned. Consistent across clients, so it is one decision to revisit,
   not drift.
4. **Token glyphs truncate to three characters** (`USDT` → `USD`) on all
   four clients — spec 015's `TokenIcon` rule. The third column of the
   mocks shows four; the middle column shows three, as we do.
5. **`FlowPanel::step` is the only place that knows where a step leads.**
   An affordance is live exactly when the mocks draw a destination, and
   `every_panel_is_reachable_or_a_named_variant` walks every entry and
   step to prove no panel is gallery-only except four named content
   variants (DR3, DA3, DT4, DT3b).
6. **`section_header` was split, not duplicated**, so the assets
   header's title and its 添加 action can lead to two different panels
   without two different-looking headers.

## Open items

1. **`send.batchBadAddress` reads badly in English.** The mock glues the
   marker onto the truncated address — 中文 `0x12zz…错误` works, English
   `0x12zz…Invalid address` reads like part of the address. Same string
   on all four clients; changing it is a corpus edit across 15 locales,
   so it is the design owner's call.
2. **`assets.emptyCaption` says "Tap here"** on the desktop panel, where
   there is nothing to tap. Shared mobile-first copy.
3. **Android has had no device pass.** Source, fixtures and
   `testDebugUnitTest` only. The Xiaomi alioth loop is the way to do it.
4. **Web e2e is inherited-red**: 30 Welcome failures trace to spec 020's
   first-run intro gate hiding `.headline` while those tests never pass
   the `skipIntro` hook. Present at `de343e7f` and `62f4598c`, untouched
   by this branch.

## Gate summary

| Platform | Gates | Result |
|---|---|---|
| core/i18n | gen:i18n, lint:i18n, verify:i18n, dump:vectors, root leaf pin | pass |
| web | check (721 files), test:unit (208) | pass |
| desktop | cargo build, clippy --all-targets, cargo test (83) | pass |
| android | testDebugUnitTest (17 new), assembleDebug | pass |
| ios | xcodebuild build + test (19 new) | pass |

Visual passes: web (browser), iOS (simulator), desktop (all 19 panels,
light + dark spot check). Android outstanding.
