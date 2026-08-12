# Research: Contacts UI Components & Preview Galleries

**Branch**: `018-contacts-ui` · **Date**: 2026-08-09

Decisions below follow a four-way survey of the existing clients (same
method as spec 015; sources are the platform trees and specs 003/006/
007/009/014/015).

## D1 — Gallery & page plumbing per platform (reuse, don't invent)

| Platform | Mechanism |
|---|---|
| web | extend the spec-015 gallery: `src/routes/[locale]/gallery/[state]` gains `c1…c6, c1s, c1f, c2s, dc1…dc6, dc2n`; gallery root gains contacts component boards. New `src/lib/contacts/{model,fixtures,messages}.ts` mirrors `src/lib/wallet/*`. Mobile states render in the 390×844 frame, desktop states in the ≥1280 stage; `dc2n` renders in a 1024-wide stage to show the overlay-third-column mode. |
| android | new nav routes `contacts` + `contacts-gallery` in `VelaDestinations` (+ `ALL`); launch via the existing `--es vela.startDestination` extra. `ContactsGalleryScreen` copies the spec-015 chip-bar pattern (`GalleryEntry` enum C1…C6, C1S, C1F, C2S, Components) with theme chip + 1.35× text-scale chip (FR precedent H7x via `LocalDensity` fontScale override). |
| ios | `VELA_PAGE` gains `contacts` and `contacts-gallery` branches in `RootView` (`PageOverride`); `ContactsGalleryScreen` copies `Features/Wallet/GalleryScreen.swift` (chip strip + `VELA_STATE` preselect + theme toggle). `#Preview`s per component with `.previewSafe` providers. |
| desktop | reuse `WalletPage` as the shell: add `enum Section { Wallet, Contacts }` (sidebar `nav_row` selected flag derives from it), `PanelId::ContactDetail`, and extend `GalleryTab` with `DC1…DC6` + `ContactsComponents`. `VELA_PAGE=gallery` keeps one gallery for both features (chips grouped); `VELA_PAGE=contacts` opens the plain contacts section. Esc/✕ close and the theme chip come for free. |

Rationale: FR-004 demands ≤2 interactions from gallery root and no new
gallery infrastructure; every platform already has a registration
pattern from 014/015. Alternative (separate contacts gallery page on
desktop) rejected — duplicates the shell and theme plumbing for zero
reviewer benefit.

## D2 — Menu modality per platform

- **Mobile (android/ios/web mobile-width)**: C5/C6 are bottom sheets.
  Android: M3 `ModalBottomSheet(containerColor = bgRaised)` (house
  pattern from `ChainSelectSheet`), content = icon+label rows, optional
  divider + destructive row (`error` color), separate 取消 button.
  iOS: `.sheet` + `presentationDetents` self-measuring content
  (FlowSheet/ChainSelectSheet precedent), same content anatomy.
  Web: reuse `BottomSheet.svelte` with a new menu-rows child.
  One shared component per platform (**ActionMenuSheet**) hosts C5, C6
  and the delete-confirmation variant (title + body + destructive
  confirm + cancel — copy from `contacts.deleteTitle/deleteBody`).
- **Desktop**: first anchored menus in the codebase. gpui:
  `deferred(anchored().position(pt).snap_to_window_with_margin(..))`
  appended last in the page root, dismissed by `on_mouse_down_out` +
  Esc; menu card = `bg_raised`, 12px radius, 1px `divider` border,
  shadow, 44px rows, destructive rows in `error_base`, leading 16px
  glyphs (M1/M2 anatomy). One `menu_card(items)` component renders both
  the header dropdown (anchored under the ⋯ button, right-aligned) and
  the context menu (anchored at cursor from
  `on_mouse_down(MouseButton::Right, …)`).
- **Web desktop-width**: same one visual family — a `Menu.svelte`
  rendered in a positioned overlay; header ⋯ anchors below the button,
  group-row `contextmenu` event anchors at cursor; Esc + outside-click
  dismiss; `role="menu"`/`menuitem` semantics.

## D3 — i18n: reuse the 53 existing `contacts.*` keys; add ~21; update 2 values

The corpus already covers: 通讯录 `contacts.title`, 分组
`contacts.sectionGroups`, `{{count}} 人` `contacts.groupMembers`, 新建分组
`contacts.groupNew`, 编辑分组 `contacts.groupEdit`, 删除分组
`contacts.groupDelete`, 新建联系人 `contacts.addTitle`, 添加联系人
`contacts.addContact`, 还没有联系人 `contacts.empty`, 取消
`contacts.cancel`, 地址 `contacts.addressLabel`, 名称 `contacts.nameLabel`,
删除联系人？/{{name}} 将从通讯录中移除。 `contacts.deleteTitle/deleteBody`,
导出通讯录 `contacts.exportTitle` (mobile C5 row), 没有匹配…
`contacts.noResults`. Shared keys reused from spec 015's map:
已发送/已收到 `history.labelSent/labelReceived`, 全部 `history.filterAll`,
转账/收款 `componentsUi.dock.send/receive`, 复制地址
`componentsUi.identiconViewer.copyAddress`, nav labels
`componentsUi.mainNav.*`, sidebar network/search strings as in 015.

**Value updates (all 15 locales, byte-neutral-ish)**:
- `contacts.searchPlaceholder`: 搜索名称或地址 → **搜索名字、ENS 或地址**
  (C1/DC1 placeholder; en "Search name, ENS, or address").
- `contacts.emptyHint`: → **添加常用地址，转账时不再反复粘贴。也可以从文件导入现有通讯录。**
  (C3/DC3 caption; the old value described a not-yet-built auto-history
  behaviour).

**New keys** (2-segment, under the existing `contacts` branch; zh values
verbatim from the mocks; full 15-locale table in
[contracts/i18n-keys.md](contracts/i18n-keys.md)):

| Key | zh |
|---|---|
| `contacts.manage` | 管理 |
| `contacts.sectionContacts` | 联系人 |
| `contacts.countPeople` | {{count}} 位 |
| `contacts.membersCount` | {{count}} 位成员 |
| `contacts.allContacts` | 全部联系人 |
| `contacts.addMember` | 添加成员 |
| `contacts.batchSend` | 群发转账 |
| `contacts.batchSendHint` | 向本组 {{count}} 人转账，金额可分别设置。 |
| `contacts.batchSendHintTitled` | 群发转账：向本组 {{count}} 人转账，金额可分别设置。 |
| `contacts.importFile` | 从文件导入 |
| `contacts.importAll` | 导入通讯录 |
| `contacts.exportAll` | 导出全部通讯录 |
| `contacts.importGroup` | 导入到本组 |
| `contacts.exportGroup` | 导出本组 |
| `contacts.groupRename` | 重命名分组 |
| `contacts.moveGroup` | 移入分组 |
| `contacts.recentActivity` | 最近往来 |
| `contacts.viewAllActivity` | 查看全部往来 |
| `contacts.deleteContact` | 删除联系人 |
| `contacts.actionQr` | 二维码 |
| `contacts.edit` | 编辑 |

**Russian byte budget**: the u16 catalog pin trips at 65,536 bytes per
locale value blob; ru sits at 64,614 (~922 bytes headroom). The ~21 new
ru values are budgeted ≈700–850 bytes; if `gen-i18n.mjs` trips, shorten
the ru copy (translator freedom) — do **not** widen the offset type in
this feature. Pins in `scripts/gen-i18n.mjs` (PATHS/leaf/branch counts)
are bumped with a ledger comment, per convention. Plural forms follow
the corpus's existing `_one/_other` shape only where already used;
`countPeople`/`membersCount`/`batchSendHint` are single-key `{{count}}`
templates like the existing `contacts.groupMembers`.

## D4 — A–Z index rail (mobile only)

- **Android**: `Column` of letters in a fixed-width rail;
  `pointerInput` vertical drag maps y→letter; bubble HUD as an offset
  `Popup`/overlay box near the touch point (fade 120/80ms tokens);
  `LocalHapticFeedback.performHapticFeedback(SegmentTick)` (fallback
  `TextHandleMove`) once per crossed letter; `LazyListState.scrollToItem`
  jump (no smooth scroll — SPEC says direct positioning). Reduced
  motion: `LocalReducedMotion`-style check per house pattern (015 pulse
  uses it) → no bubble animation.
- **iOS**: `DragGesture(minimumDistance: 0)` on the rail;
  `UISelectionFeedbackGenerator.selectionChanged()` per letter;
  `ScrollViewReader.scrollTo(letter-anchor)`; bubble via overlay aligned
  to the finger's y. `accessibilityReduceMotion` degrades.
- **Web**: pointer events (`pointerdown/move` + capture), no haptics
  (FR-009 allows), bubble element with the same fade tokens; letters
  with no section jump to nearest existing section (shared rule).
- The rail renders the full A–Z + # alphabet regardless of which
  sections exist (mock C1 shows the full rail with only A–H populated).

## D5 — Swipe actions & delete confirm

Real gesture on the two touch platforms; fixture-forced state on all
three mobile-rendering platforms so the gallery can show it statically:
- Android: `AnchoredDraggable` row offset revealing a 转账 (accent) +
  删除 (error) action pair; C1S fixture pins `revealedIndex` so the
  state renders without gesturing.
- iOS: horizontal `DragGesture` with anchor points (no `List`, so no
  built-in `swipeActions`); same fixture override.
- Web: no gesture — the `c1s` fixture renders the revealed offsets
  (recorded as a platform note; touch-web gesture is out of scope).
- 删除 from swipe or detail always raises ActionMenuSheet's
  delete-confirm variant (`c2s` state); "confirming" in the gallery
  just logs the action id (014 action-sink pattern).

## D6 — Desktop narrow-overlay (<1120) is a web-only live behaviour

The desktop app's minimum window is 1280×800 (`WINDOW_W/H`), so the
<1120 rule from the desktop SPEC sheet cannot be reached by resizing
the native window. Decision: implement the overlay-third-column as a
**fixture state** (`dc2n`) — web renders it live via a media query in
`ContactsDesktop.svelte` *and* as a pinned 1024-wide gallery stage; the
native desktop app records "min-width ≥1280 ⇒ overlay mode unreachable"
in results.md and does not implement it. GroupRail `drop-target` and
row `hover/selected` raised states are static component-board variants
everywhere (drag interactions themselves are out of scope per spec
Assumptions).

## D7 — Fixtures are the single canon; addresses are pinned

`data-model.md` defines the canon once; each platform ports it
(`ContactsFixtures.kt/.swift`, `fixtures.ts`, `fixtures.rs`).
Identicon seeds must be full addresses (seeds pass through
`normalize_seed`; never call-site lowercase — spec 003 rule). The mocks
only disclose Alice's full address (C2). For the other seven contacts
the canon **pins invented 40-hex addresses whose first/last four hex
chars match the mock's truncated display** (e.g. 阿豪 `0x77Bd…4F02` →
`0x77Bd59A302cC93D23dB0d0BA6a45C6830EF74F02`). Consequence: identicon
artwork will not pixel-match the mock renders for those contacts —
recorded once here and in results.md; cross-platform identicon parity
(SC-003) is unaffected because all platforms share the canon seeds.
Alice's detail activity mirrors the 015 wallet fixture entry (已收到
+50 USDC · 昨天 20:15 · Ethereum) so the two features tell one story.

## D8 — Icons: extend the shared lucide corpus (~10 glyphs)

Same regime as 015 D2 rev 2: lucide v1.11.0, 24×24, stroke 2, extracted
from `node_modules`, never retyped. New utility glyphs (contract:
[contracts/icons.json](contracts/icons.json)): `user-round-plus`
(header add + 新建联系人 row), `users-round` outline reused (group tile
already exists as nav glyph; rail rows reuse it), `folder-plus`
(新建分组), `download` (import rows), `upload` (export rows), `pencil`
(edit), `trash-2` (删除分组/delete), `ellipsis` (⋯ header button),
`qr-code` (二维码 action), `plus` (添加成员 ghost row), `chevron-left`
(mobile back). Per platform they land in `icons.ts` (web IconDef),
`VelaIcons.kt` (ImageVector), `LucideIcons.swift` (glyph corpus),
`icons.rs` (svg bodies) — all four from the same lucide source.

## D9 — Theme deltas: none in tokens; named metrics only

No new colors enter `docs/design-tokens.json`. Surfaces map to existing
tokens: menu/sheet card = `bg.raised`, group tile & search well =
`bg.sunken`, hairlines = `border.base`/`divider`, destructive =
`error.base`, selected/hover rows = `bg.raised` wash (015 mapping).
New named metrics per platform (desktop `theme.rs` consts, android
`VelaSizing`/feature `Metrics`, ios `WalletGeometry`-style
`ContactsGeometry`, web CSS from existing `--space/--size` vars):
groups-rail width (216 measured from DC1), menu width/row height
(220×44 from M1/M2), index-rail width, detail hero avatar **64 (mobile,
measured in C2) / 48 (desktop, measured in DC2)** — an earlier estimate of
96/64 shipped briefly and was corrected on all four platforms after the
mocks were measured pixel-wise, motion constants (sheet 250ms, column 240/200ms,
crossfade 150ms, hover 120ms, bubble 120/80ms) named in each platform's
motion layer per FR-011.
