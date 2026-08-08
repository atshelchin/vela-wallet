# Research: Wallet Home UI Components & Preview Galleries

**Branch**: `015-wallet-home-ui` · **Date**: 2026-08-08

Decisions below were made after a four-way survey of the existing clients
(the survey facts are summarized inline; sources are the platform trees
themselves and specs 003/006/007/008/009/010/012).

## D1 — Identicon rendering route per platform

**Problem**: `vela-core` emits the identicon as an SVG *string*
(`identicon_svg_circular`). Only the web DOM can render that natively.
The artwork fragments use `<path>`, `<circle>`, `<ellipse>`, `<g>`,
stroked shapes (`stroke`, `stroke-width`, caps/joins) — checked in
`identicon_features.rs` — so a hand-written "mini SVG parser" per
platform is rejected outright (three lossy parsers guarding a
verification signal).

**Decision**:
- **Rust**: add an optional `identicon-raster` feature to `vela-core`
  exposing `identicon_png(seed, size_px) -> Vec<u8>` (resvg + tiny-skia
  rasterization of the circular SVG). Off by default → the wasm build
  and its 1.09 MB base64 artifact are untouched.
- **Android / iOS**: `vela-core-uniffi` enables the feature and exports
  `identiconPng(seed, sizePx)`. Kotlin decodes via `BitmapFactory`,
  Swift via `UIImage(data:)`. Committed bindings are regenerated with the
  existing scripts (`rust/scripts/smoke-kotlin.sh`,
  `rust/scripts/build-ios-xcframework.sh`).
- **Desktop**: direct crate dep already exists; enable the feature and
  decode with the already-present `image` crate into a gpui
  `RenderImage` (same presentation path the Lottie launch animation
  uses). gpui's `svg()` is a monochrome-mask renderer with a null
  AssetSource at rev c97b7c0 — unusable for multi-color identicons.
- **Web**: no wasm change. Fixture identicons are computed at build time
  (`identiconSvgCircular` from `rust/pkg-web`, imported from a
  `.server.ts` module exactly like the i18n engine) and inlined with
  `{@html}`. Gallery routes are prerendered, so the deployed Worker
  stays wasm-free (the `welcome-ssr` e2e enforces this).

Seeds always pass through `normalize_seed` (rust) /
`identiconNormalizeSeed` (bindings) — spec 003's cross-platform-drift
rule. Placeholder artwork (`IDENTICON_PLACEHOLDER`) is the failure
fallback everywhere.

**Alternatives rejected**: per-platform SVG libraries (AndroidSVG,
exyte/SVGView) — two new third-party deps, two more renderers to drift;
generic `rasterizeSvg(svg, w, h)` over FFI — wider surface than the
feature needs.

## D2 — Icon set (solid selected / outline unselected) — REV 2

Rev 2 (2026-08-08, user direction): **lucide everywhere, all four
platforms.** The first cut used Material Symbols for the nav pairs and
SF Symbols on iOS; Material's outlined style is chunky filled-outline
and read as "solid" (user caught it on the web tab bar), and the mock's
thin glyphs are lucide.

- Unselected nav + all utility glyphs: verbatim lucide v1.11 stroke defs
  (24×24, stroke 2, round caps/joins; ISC; extracted from the repo's
  `node_modules`, never retyped from memory).
- Selected nav (solid): fills derived from the same lucide geometry —
  explore = disc + needle cutout (evenodd), settings = closed gear fill
  + hole (evenodd), contacts = filled front body/head with the two
  back-person arcs kept stroked, wallet = a slot-notched silhouette
  anchored to lucide's coordinates (verified against the H1 mock in a
  side-by-side render before shipping).
- Per platform: web inline `<svg>` (a `mixed` IconDef renders
  per-element fill/stroke); android `ImageVector` via PathParser
  (per-path fill/stroke params, `PathFillType.EvenOdd`); desktop resvg
  rasters of per-element-painted templates; **iOS renders the same
  corpus through vela-core's `rasterizeSvgPng`** (template UIImage,
  tinted by `.foregroundStyle`) — SF Symbols retired from the wallet
  surfaces so the four platforms draw identical glyphs.

## D3 — i18n: reuse the existing corpus; add 13 keys

The RN wallet already put the wallet-home vocabulary in the corpus, and
the zh values match the mocks verbatim (总余额, 实时 · 监听收款中,
部分余额仍在更新。, 部分代币无法获取价格。, 无价格, 收款/转账/扫码,
资产/添加, 全部, dApp 交易, 选择链/所有网络, 接收前请注意,
同一地址，通用于全部 {{count}} 个网络, 名称/价格/合约/精度/交易记录/
在浏览器中查看, 原生代币, 暂无交易记录 …). Key map (normative):

| UI element | Existing key |
|---|---|
| 总余额 label | `home.totalBalance` |
| 实时 · 监听收款中 | `home.liveIndicator` |
| 部分余额仍在更新。 | `home.balanceStale` |
| 部分代币无法获取价格。 | `home.balanceUnpriced` |
| 无价格 | `home.balanceDetailNoPrice` |
| 收款 / 转账 / 扫码 | `componentsUi.dock.{receive,send,scan}` |
| 活动 | `home.tabActivity` |
| 资产 / 添加 | `assets.sectionTitle` / `assets.addToken` |
| 全部 | `history.filterAll` |
| dApp 交易 | `history.txLabelDappTx` |
| 选择链 / 所有网络 | `componentsUi.networkFilter.{selectChain,allNetworks}` |
| 空活动 title/body | `home.emptyNoActivity` / `home.emptySubtitle` |
| 空资产 title/body | `assets.emptyTitle` / `assets.emptySubtext` |
| 收款面板 title | `receive.title` |
| 接收前请注意 + body + reminder | `receive.warning{Title,Body,Reminder}` |
| 同一地址通用于 N 网络 | `receive.networksLine` |
| 链 ID 行 | `receive.networkDetail` |
| 复制地址 | `componentsUi.identiconViewer.copyAddress` |
| 资产详情 facts | `tokenDetail.{labelName,labelPrice,priceValue,labelContract,labelDecimals,labelTransactions,viewOnExplorer}` |
| 原生代币 | `addToken.labelNativeToken` |
| 转账/收款 (detail actions) | `tokenDetail.{send,receive}` |
| 网络 (sidebar section) | `settingsModals.network.modalTitle` |
| 隐藏/显示余额 a11y | `home.a11y{Hide,Show}Balance` |

**New keys** (added to existing namespaces, all 15 locales, then
`node scripts/gen-i18n.mjs` + tripwire-constant bump +
`cargo test -p vela-core --features i18n-all`):

- `componentsUi.mainNav.{wallet,contacts,explore,settings}` — 钱包 /
  通讯录 / 探索 / 设置
- `componentsUi.dayGroup.{today,yesterday}` — 今天 / 昨天
- `componentsUi.commandBar.placeholder` — 搜索或执行
- `componentsUi.qrPlaceholder.caption` — 演示占位图案 · 不可扫描
- `componentsUi.networkFilter.pillAll` — 全部网络 (pill label; the sheet
  row keeps `allNetworks` 所有网络)
- `receive.addressLabel` — 你的收款地址
- `history.{labelSent,labelReceived}` — bare 已发送 / 已收到 (existing
  `txLabelSent` interpolates a symbol; the home rows don't)
- `history.{toName,fromName}` — 至 {{name}} / 来自 {{name}} (existing
  subtitles append `· {{networkName}}`; the mobile rows don't)

Fixture *content* (wallet name 大表哥, token tickers, counterparties,
amounts, times) is data, not translation — it stays verbatim across
locales per spec FR-012.

## D4 — Gallery entry point per platform

| Platform | Mechanism | Rationale |
|---|---|---|
| web | `/[locale]/gallery` (component boards) + `/[locale]/gallery/[state]` (full screens), prerendered, no nav link from user pages | matches the locale-scoped routing + prerender contract |
| android | new nav routes `wallet`/`gallery` in `VelaNavHost`; launch override via intent extra `vela.startDestination` (precedent: `vela.skipLaunchAnimation`); `adb shell am start -n app.getvela.wallet/.MainActivity --es vela.startDestination gallery` | no debug source set exists; extras keep prod nav untouched |
| ios | env `VELA_PAGE=wallet\|gallery` branching in `RootView` (precedent: `VELA_THEME`, `VELA_LANG`), plus `#Preview`s per component | same launch-override idiom the sim screenshot matrix already uses |
| desktop | env `VELA_PAGE=wallet\|gallery` in `main.rs` (precedent: `VELA_THEME`); default stays onboarding | one-window app, no router to hook into |

Galleries carry a state switcher (the 9 mobile states / 3 desktop
states), a locale toggle (zh/en at minimum), an appearance toggle, and —
mobile platforms — a text-scale toggle (1.0× / 1.35×) per FR-011.

## D5 — Desktop third column

`PanelState = None | Receive | AssetDetail(asset)` owned by the wallet
page. Fixed width 400 px (measured from D2/D3: sidebar 240 + content
fluid + panel 400 at 1280 window). ✕ button and Esc close it. Opening a
different content swaps in place (D2 → D3 without passing through
None). The mobile bottom sheet (H8) and the third column are the same
role — chain filtering on desktop happens in the sidebar list instead,
so the desktop build does not implement a sheet.

## D6 — Theme deltas

The wallet mocks read on the existing dark tokens (`bg.base #141412`,
`bg.raised #1E1E1B`, `accent #E8572A`, success/warning/dark variants
already exported). No new colors enter `docs/design-tokens.json`; where
a mock surface has no token (e.g. sidebar selected-row wash, desktop
search field), platforms derive from existing tokens (`bg.sunken`,
`border.base`) and record the mapping in code next to the component.
Desktop's `theme.rs` grows wallet-layout consts (sidebar width 240,
panel width 400, row heights) following its "only module with magic
numbers" rule.

## D7 — Fixtures are the single canon

`data-model.md` defines the canonical fixture set once (verbatim mock
content). Each platform ports it into its own types
(`WalletFixtures.kt` / `WalletFixtures.swift` / `fixtures.ts` /
`fixtures.rs`). Components never see anything richer than these display
models (spec SC-005).
