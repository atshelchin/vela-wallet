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
- **Android** (`49c87dab`, device fixes `5495c9d0`): `feature/flows/` —
  models, fixtures, screens, host, nav, plus
  `components/{FlowChrome,FlowRows,FlowBlocks,ScanSurface}` and a gallery
  screen. `AssetRow` gained dimmed/selected/trailing/onClick and
  `TokenIcon` an inline size. `WalletFlowFixturesTest` (17) +
  `DeveloperRoutesTest`. **Device pass done** on a Xiaomi alioth
  (`9d5f42fb`): **all 30 states walked**, plus spec 015's H1 and H7 to
  place the activity-row finding below.
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

## Defects found on the device (Android, `5495c9d0`)

The same rule as the desktop list: each of these compiled, typechecked
and passed `testDebugUnitTest` first.

14. **The flows gallery was unreachable.** `flows-gallery` was accepted
    by the `vela.startDestination` extra but missing from
    `DEVELOPER_ROUTES`, so the session guard bounced it to Welcome before
    it painted — on a device with no wallet, which is every device a
    fixture gallery is useful on. The comment above that set warns about
    exactly this failure. `DeveloperRoutesTest` now asserts every
    launchable gallery route is exempt.
15. **R1's subtitle was missing on three of four clients.** Android and
    iOS carried `subtitle` in the model and a comment calling it "the
    whole idea", and drew neither. Web hid it under a
    `.chrome .subtitle { display: none }` whose comment claimed the phone
    frame printed it — `FlowScreen` has no subtitle slot, so nothing did.
    Only the desktop panel showed it. Fixed on all three; verified on
    device, simulator and in the browser.
16. **The last row ran under the navigation bar.** `FlowScaffold` gave
    its footer `navigationBarsPadding()`; screens with no footer — R1
    among them — got no bottom inset at all, so the eighth network sat
    behind the gesture bar.
17. **Two-line titles collided.** Nine large texts had no explicit
    leading, so 发送多个代币 wrapped at 360 dp and drew its second line
    through its first. Each now takes the leading its role calls for.
18. **The add-a-token link was blue** (`info-base`) on all three mobile
    clients. T1 and DT1L both draw it centred and muted under the list —
    the way out of "my token is missing", not an action competing with
    the rows. Fixed on web, Android and iOS (`4be8f5a3`); the desktop
    panel was already corrected in the panel pass.

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
6. **T4's empty card orders its CTA differently on mobile and desktop**,
   because the two mocks do. T4 puts 添加代币 above the "已经收到代币但没有
   显示?" question; DT4L puts it below. Each client follows its own mock.
7. **`vela.flowState=SD2B`** opens the Android gallery straight onto one
   state, beside the existing route extra. Same reason as `VELA_FLOW` on
   the desktop: a thirty-state chip strip walked by hand is not a
   repeatable device pass.
8. **SD1's title and CTA differ from DSD1L's, because the mocks do.**
   The phone says 选择代币 with a full ghost button; the desktop panel
   says 转账 with a quiet centred link. Same for T4's empty-card CTA
   order. Each client follows its own mock rather than the other's.
9. **`section_header` was split, not duplicated**, so the assets
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
3. **S1's scanner follows the theme on all four clients**, so in the
   light palette the viewfinder surround is near-white. Every mobile mock
   in `design/wallet-2` is drawn dark, so they cannot say whether a
   scanner should be fixed-dark the way the QR card is fixed-light. The
   four clients agree with each other; it is one decision to make, not
   drift.
4. **SD1B's title wraps to two lines at 360 dp** where the 392-wide mock
   fits one. The leading now makes that legible rather than overlapping;
   whether to drop the title a size on narrow phones is a design call.
5. **The shared `ActivityRow` truncates its subtitle on a 360 dp phone,
   and the timestamp is what it drops.** A1 shows 来自 0x9F3c…21aE · …
   where the mock shows · 11:20. The cause is in spec 015's row
   (`feature/wallet/components/ActivityRow.kt`): the amount sits in a
   `Modifier.weight(1f)` box beside a `weight(1f)` text column, so the
   amount reserves half the row however short it is. **Pre-existing and
   worse on the wallet home** — H1 on the device drops the time from
   every row and elides `PancakeSwap · BNB…`; H7's extreme amounts fit
   inside half the row without ever using the wrap the comment there
   describes. Left alone deliberately: it is spec 015's component, shared
   with a shipped screen, and re-proportioning it needs H1–H8 re-checked.
   Recommended fix is `weight(1f, fill = false)` on the amount or a
   capped width, so a short amount stops reserving space it does not use.
6. **Local gradle JDK**: `org.gradle.configuration-cache=true` plus a
   stale daemon picks up the VS Code Red Hat JRE, which has no `jlink`,
   and `assembleDebug` dies in `JdkImageTransform`. Build with
   `JAVA_HOME=<Android Studio>/Contents/jbr/Contents/Home` and
   `--no-configuration-cache`. Environment, not product.
7. **Web e2e is inherited-red**: 30 Welcome failures trace to spec 020's
   first-run intro gate hiding `.headline` while those tests never pass
   the `skipIntro` hook. Present at `de343e7f` and `62f4598c`, untouched
   by this branch.

## Gate summary

| Platform | Gates | Result |
|---|---|---|
| core/i18n | gen:i18n, lint:i18n, verify:i18n, dump:vectors, root leaf pin | pass |
| web | check (721 files), test:unit (208) | pass |
| desktop | cargo build, clippy --all-targets, cargo test (83) | pass |
| android | testDebugUnitTest, assembleDebug, device walkthrough | pass |
| ios | xcodebuild build + test (19 new) | pass |

Visual passes, and exactly what each covered:

- **desktop** — all 19 panels via `VELA_FLOW`, light, plus a dark spot
  check on DR2/DSD2.
- **android** — all 30 states on a Xiaomi alioth via `vela.flowState`,
  light, plus spec 015's H1/H7 for the activity-row finding.
- **ios** — the flow states on an iPhone 17 Pro simulator, light.
- **web** — the flows screens and the `d1`/`r1` gallery states in a
  browser. The signed-in `/[locale]/wallet` route itself was checked at
  desktop width for the shell chain (sidebar full height, third column
  beside it), not walked state by state.
