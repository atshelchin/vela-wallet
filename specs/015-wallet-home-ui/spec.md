# Feature Specification: Wallet Home UI Components & Preview Galleries

**Feature Branch**: `015-wallet-home-ui`

**Created**: 2026-08-08

**Status**: Implemented on this branch — see results.md for gates and
recorded deviations

**Input**: User description: "Implement the wallet home UI from
`design/wallet/` on all four clients (`app-android/vela-wallet`,
`app-ios/VelaWallet`, `app-web/vela-wallet`, `app-desktop/vela-wallet`).
The ~13 mocks are compositions of a small set of reusable components —
build those components once per platform and assemble the screens from
them. No real business state or logic yet: every state is driven by
fixtures, and every state must be easy to see and test through a preview
gallery on each platform. Address avatars switch from initial-letter
circles to the Nimiq identicon already implemented in
`rust/crates/vela-core/src/identicon.rs`. On desktop the third column
replaces the mobile bottom-sheet role and is closable. Navigation icons
are solid when selected, outline when not."

## Why

Specs 006–009 proved the shared foundation (tokens, i18n, vela-core
consumption) on each platform using onboarding — a screen that needs no
wallet state. The wallet home is the opposite: it is the screen users
live in, and it is where the component vocabulary of the whole product
gets decided — balance display, activity rows, asset rows, empty/loading
/hidden/error states, sheet vs. third-column modality. Building that
vocabulary once per platform, state-complete and fixture-driven, before
any indexer/RPC exists, means the later "wire up real data" feature is a
data-plumbing change rather than a UI rewrite — and means designers and
engineers can review every state today by opening a gallery instead of
contriving on-chain conditions.

The identicon switch belongs in the same feature because the wallet
header and every activity row draw the avatar: retrofitting it later
would touch every component this feature creates. `vela-core` already
guarantees byte-identical SVG output across platforms; this feature is
where each client finally renders it.

## Design Authority

The mocks in `design/wallet/` are the visual authority for this feature:

| Mock | State it defines |
|------|------------------|
| `H1 钱包 _ 首屏.png` | Mobile home, default (populated) |
| `H1s 钱包 _ 完整滚动内容.png` | Full scroll: day-grouped activity (今天/昨天), six asset rows |
| `H2 钱包 _ 空 · 新钱包.png` | Empty wallet: $0.00, live-listening indicator, two empty states |
| `H3 钱包 _ 加载中.png` | First load: skeleton balance, skeleton rows |
| `H4 钱包 _ 部分代币无价格.png` | Partial price failure: warning line under balance, per-row 无价格 |
| `H5 钱包 _ 余额已隐藏.png` | Privacy mode: balance and all amounts masked as dots |
| `H6 钱包 _ 余额更新中 · 缓存.png` | Cached totals: refreshing status line under balance |
| `H7 钱包 _ 极值 · 长文本大数字.png` | Extremes: long wallet name, $1,234,567.89, −0.0000001 BNB, single-chain filter pill |
| `H7x 钱包 _ 极值 · 字号 1.35×.png` | Same content at 1.35× text scale |
| `H8 钱包 _ 选择链.png` | Chain-select bottom sheet over dimmed home |
| `D1 … 桌面 · 第三栏关闭（默认）.png` | Desktop two visible columns; sidebar nav + network filter + ⌘K search |
| `D2 … 桌面 · 第三栏打开（收款）.png` | Third column: Receive (token picker, QR placeholder, address, copy, warning card) |
| `D3 … 桌面 · 第三栏打开（资产详情）.png` | Third column: Asset detail (balance header, actions, facts, explorer link, per-asset activity) |

Where a mock conflicts with `design-system.md` tokens, the design system
wins and the difference is recorded in the feature's results notes (same
rule as specs 007/009). The wallet mocks are dark-appearance renderings;
components MUST be built from theme tokens so both appearances work, with
dark expected to match the mocks and light derived from the token system.

## The Reusable Component Vocabulary

The thirteen mocks decompose into one shared vocabulary. Names are
normative for this spec (each platform keeps its own naming conventions,
but the mapping must be recorded):

1. **IdenticonAvatar** — Nimiq identicon for a seed (wallet address),
   circular crop, sizes for header (~40dp) and inline row use. Falls back
   to the shared placeholder artwork for invalid seeds. No initial-letter
   rendering anywhere.
2. **WalletHeader** — IdenticonAvatar + wallet name (truncates) +
   disclosure chevron + middle-truncated address; on mobile paired with a
   trailing **NetworkFilterPill**; on desktop it heads the sidebar.
3. **NetworkFilterPill** — two variants: all-networks (three overlapping
   chain dots + label 全部网络) and single-chain (one dot + chain name);
   both with disclosure chevron.
4. **BalanceDisplay** — label line (总余额 · USD), hero amount with
   de-emphasised decimals, plus exactly one of these states: `normal`,
   `zero-live` (green pulsing dot + 实时·监听收款中), `loading`
   (skeleton block), `hidden` (six dots + eye-off toggle), and an
   optional **BalanceStatusLine** slot.
5. **BalanceStatusLine** — one-line tappable status under the amount:
   `warning` (⚠ 部分代币无法获取价格。 + chevron) or `refreshing`
   (↻ 部分余额仍在更新。 + chevron).
6. **ActionButtonRow** — 收款 / 转账 / 扫码. Mobile: three equal cards
   (icon above label). Desktop: three wide pill buttons (icon + label
   inline). Icons: receive ↙, send ↗, scan viewfinder.
7. **SectionHeader** — title (活动 / 资产 / 交易记录) + trailing text
   action with chevron (全部 › / 添加 ›).
8. **ActivityRow** — leading circle icon (direction glyph) with a small
   chain-dot badge, title (已发送 / 已收到 / dApp 交易), subtitle
   (counterparty, dApp · chain, desktop adds · time), trailing signed
   amount (+green / −foreground) with unit. Supports `masked` variant
   (amount as dots). Rows group under **DayLabel** (今天 / 昨天).
9. **AssetRow** — TokenIcon with chain-dot badge, symbol + chain name,
   trailing balance + fiat line. Variants: `no-price` (fiat line replaced
   by orange 无价格), `masked`, long-value truncation behaviour.
10. **TokenIcon** — circular token glyph (fixture-supplied ticker
    lettermark) + bottom-trailing chain dot badge.
11. **EmptyState** — outline icon, title, caption (暂无交易记录 /
    存入您的第一笔资产), used inside sections.
12. **SkeletonRow / SkeletonBlock** — loading placeholders matching row
    geometry.
13. **TabBar** (mobile only) — 钱包 / 通讯录 / 探索 / 设置. Selected item:
    solid icon + accent tint; unselected: outline icon + muted tint.
14. **BottomSheet** (mobile only) — drag handle, title row with trailing
    icon slot (search), content slot; scrim over home.
15. **ChainFilterList** — rows of (chain dot, name, per-chain asset
    count) with a checkmark on the active row; 所有网络 row first. Used
    inside the mobile sheet (H8) and the desktop sidebar 网络 section.
16. **Sidebar** (desktop only) — WalletHeader, nav list (solid icon when
    selected + raised row background; outline icon otherwise), 网络
    section (ChainFilterList), pinned search field (搜索或执行 ⌘K).
17. **ThirdPanel** (desktop only) — the desktop replacement for the
    mobile bottom sheet: fixed-width right column with title + close ✕,
    hosting interchangeable content. This feature ships two contents:
    **ReceivePanel** (token dropdown row, **QRPlaceholder**, receive
    address box in mono, copy-address button, warning card 接收前请注意)
    and **AssetDetailPanel** (token header with balance, 转账/收款
    buttons, fact rows 名称/价格/合约/精度, 在浏览器中查看 › link,
    交易记录 section reusing ActivityRow).
18. **QRPlaceholder** — deterministic fake QR pattern with caption
    演示占位图案 · 不可扫描. Explicitly not a scannable code.

## User Scenarios & Testing

### User Story 1 - Browse every mobile wallet-home state in a gallery (Priority: P1)

A developer or designer opens the platform's preview gallery
(Android, iOS, web) and switches between the nine mobile states —
default, full scroll, empty, loading, partial-price, hidden, refreshing,
extremes, extremes at 1.35× text scale — plus the chain-select sheet.
Each state visually matches its `H*` mock without any network, wallet, or
business logic running.

**Why this priority**: The state-complete home screen is the deliverable;
the gallery is how it is reviewed and regression-checked. Everything else
(desktop layout, identicon) composes into it.

**Independent Test**: Open the gallery on one platform, walk all states,
compare side-by-side with the mocks.

**Acceptance Scenarios**:

1. **Given** the gallery, **when** each of the H1–H8 fixture states is
   selected, **then** the rendered screen reproduces the corresponding
   mock's structure and content (fixture text and numbers match the mocks
   verbatim, including 大表哥, $1,383.28, −2 POL, +120 USDT, CAKE 无价格,
   这是一个非常长, −0.0000001 BNB).
2. **Given** the hidden state (H5), **when** it renders, **then** the
   hero balance, every activity amount and every asset amount are masked
   as dot glyphs while units (POL, USDT) stay visible.
3. **Given** the loading state (H3), **then** skeleton geometry follows
   the mock (balance block, two activity rows, three asset rows) and no
   real amounts appear.
4. **Given** the extreme state (H7), **then** the long wallet name
   truncates with an ellipsis without pushing the network pill off-screen,
   and 1,234,567.8901 / −0.0000001 render fully without clipping.
5. **Given** the 1.35× state (H7x), **then** the same fixture renders at
   scaled type with no text clipped and no overlapping rows.
6. **Given** the chain-select state (H8), **then** a sheet (mobile
   platforms) lists 所有网络 ✓ 8, followed by six chains with counts,
   over a dimmed home screen.

---

### User Story 2 - Desktop three-column layout with closable third panel (Priority: P2)

On desktop the same vocabulary assembles into sidebar + content column.
Opening 收款 or an asset row opens the third column (the desktop
equivalent of the mobile sheet); ✕ closes it; switching content swaps the
panel in place. A desktop gallery exposes D1/D2/D3 states plus the
mobile-shared component states.

**Why this priority**: The third-column pattern is the desktop-defining
interaction of this feature; it reuses everything US1 builds.

**Independent Test**: Launch the desktop gallery, toggle the third panel
through closed → receive → asset detail, compare with D1–D3.

**Acceptance Scenarios**:

1. **Given** the default desktop state, **then** the layout shows the
   sidebar (nav with 钱包 selected — solid icon + raised row; others
   outline) and the content column per D1, with no third column.
2. **Given** the receive state, **then** a third column opens per D2
   (token dropdown, QR placeholder with 不可扫描 caption, full address in
   mono, copy button, warning card) while the content column remains
   interactive and merely narrows.
3. **Given** the asset-detail state (BNB fixture), **then** the third
   column matches D3, and its 交易记录 rows are the same ActivityRow
   component used in the content column, with timestamps.
4. **Given** an open third column, **when** ✕ (or Esc) is activated,
   **then** the layout returns to D1.

---

### User Story 3 - Identicon avatars everywhere (Priority: P2)

Every place a wallet/account avatar appears — wallet header, desktop
sidebar — renders the Nimiq identicon derived from the address through
the shared `vela-core` implementation. Initial-letter avatars are gone
from these surfaces. The gallery includes an identicon board rendering a
fixed set of seeds so cross-platform identity can be eyeballed.

**Why this priority**: The avatar is a verification signal; it must land
with the components rather than after them. It has no dependency on US2.

**Independent Test**: Render the identicon board on two platforms with
the same seeds; the artwork must be visibly identical pairwise.

**Acceptance Scenarios**:

1. **Given** the fixture address `0x14fB1f3a9C8e2D5b7A0f4E6c1B8d3A9e2F5D1eA5c`
   (header fixture), **then** the header avatar is its identicon — not a
   letter — on all four platforms, and matches across platforms.
2. **Given** an invalid/empty seed, **then** the shared placeholder
   artwork renders instead of a crash or a blank.
3. **Given** the identicon board fixture seeds, **then** each platform
   renders the same avatar per seed (spot-check by eye; byte-level parity
   is already enforced by vela-core's conformance suite).

---

### User Story 4 - Localized, token-pure components (Priority: P3)

All user-visible strings go through the existing i18n capability (the
mocks are zh; en must also resolve), and all styling goes through theme
tokens. Switching locale or appearance in the gallery re-renders
correctly.

**Why this priority**: Same discipline specs 006–009 established;
cheaper to keep than to regain. Deferred only below the visible
deliverables.

**Acceptance Scenarios**:

1. **Given** any gallery state, **when** locale switches zh ↔ en,
   **then** every string changes and no key leaks to screen.
2. **Given** component source, **then** no hardcoded color/spacing/font
   values appear in page code (tokens only), matching each platform's
   established token layer.

### Edge Cases

- Wallet name longer than the available width (H7) — truncate, never
  wrap, never push trailing controls out.
- Amounts with more digits than the column (1,234,567.8901) — the
  balance column may widen at the expense of the name column, but must
  not overlap it.
- Hidden mode combined with no-price rows: masked dots win; the 无价格
  marker is not shown while masked (mock H5 shows plain dot rows).
- Text scale 1.35× with the extreme fixture — nothing clips; rows grow
  vertically.
- Third panel open while content column narrows below its minimum — the
  activity/asset lists reflow; the third panel keeps a fixed width.
- Identicon seed empty/whitespace → placeholder artwork (vela-core
  behaviour), never an exception surfaced to UI.
- Gallery must function fully offline (fixtures only).

## Requirements

### Functional Requirements

- **FR-001**: Each platform MUST provide the component vocabulary above
  as individually reusable units (one authoritative implementation per
  component per platform; screens compose components, never re-implement
  them).
- **FR-002**: The mobile wallet home screen MUST be assembled from those
  components and render all nine H-states from fixtures alone.
- **FR-003**: The desktop wallet screen MUST implement the three-column
  layout with a closable third panel hosting Receive and Asset-detail
  contents (D1–D3), reusing the shared vocabulary for all list/row/
  balance elements.
- **FR-004**: Every platform MUST ship a preview gallery enumerating (a)
  each component with its variants, and (b) the full-screen states; each
  entry reachable in ≤ 2 interactions from the gallery root. The gallery
  MUST be excluded from or clearly separated in production navigation.
- **FR-005**: All screen states MUST be driven by a fixture model (plain
  data, display-ready strings); components MUST NOT fetch, poll, format
  prices, or derive business state.
- **FR-006**: Avatars for wallet identities MUST render the Nimiq
  identicon via each platform's existing `vela-core` consumption route;
  initial-letter avatar code paths for these surfaces MUST be removed or
  bypassed. Seeds MUST be normalized through vela-core's
  `normalize_seed` semantics (no call-site lowercasing).
- **FR-007**: Navigation items (mobile tab bar, desktop sidebar) MUST
  use solid icon style when selected and outline style when unselected,
  consistently sourced from each platform's icon set.
- **FR-008**: Balance and amount masking (hidden mode) MUST be a render
  variant of the same components, not separate screens.
- **FR-009**: The QR area MUST render a deterministic placeholder
  pattern labeled 演示占位图案 · 不可扫描 — real QR encoding is out of
  scope.
- **FR-010**: All strings via the platform's i18n layer with zh and en
  resolving; all styling via theme tokens (both appearances build, dark
  matches the mocks).
- **FR-011**: The gallery MUST offer a text-scale control (at least 1.0×
  and 1.35×) on platforms where the mocks define it (all mobile) so H7x
  is reproducible.
- **FR-012**: Fixture content MUST mirror the mocks verbatim so visual
  diffing against `design/wallet/` is meaningful.

### Key Entities

- **WalletFixture**: name, address (display + full), identicon seed,
  balance state (normal/zero-live/loading/hidden), hero amount parts
  (integer, decimals, currency label), optional status line
  (warning/refreshing), network filter (all + count, or single chain).
- **ActivityFixture**: day-grouped entries — kind (sent/received/dapp),
  title, subtitle, optional time, signed display amount, unit, direction
  color, chain badge color, masked flag.
- **AssetFixture**: ticker, chain name, chain badge color, display
  balance, fiat line (value / none+无价格 / masked).
- **ChainFixture**: name, dot color, asset count, selected flag.
- **PanelFixture** (desktop): which third-panel content (none / receive
  / asset detail) plus content-specific fields (address, facts, warning
  copy, per-asset activity).

## Success Criteria

### Measurable Outcomes

- **SC-001**: For each of the 13 mocks there exists a gallery state on
  the corresponding platform(s) that a reviewer can open and match
  against the mock; a full walkthrough of all states on one platform
  takes under 3 minutes.
- **SC-002**: Zero business-logic imports (network, storage, price
  formatting) in the new component/screen modules — verified by reading
  the module dependency list per platform.
- **SC-003**: The same seed list renders identical identicons on all
  four platforms (visual check; vela-core conformance suite remains
  green).
- **SC-004**: Each platform builds green with the feature included
  (existing test suites still pass; new components carry previews/tests
  per that platform's established convention).
- **SC-005**: A later "connect real data" feature would replace only the
  fixture layer: components consume plain display models exclusively
  (checked by reviewing component inputs for absence of service types).

## Assumptions

- The wallet mocks are dark-appearance; light appearance derives from
  the token system and is not separately mocked for these screens.
- 通讯录 / 探索 / 设置 destinations are out of scope; nav items render
  and select but only 钱包 has content.
- Mobile 收款/转账/扫码 taps do not navigate anywhere yet on Android/
  iOS/web (no destination mocks except desktop's third panel).
- The H8 sheet on web renders with the web app's existing modal/sheet
  pattern at mobile widths; desktop web uses the third column per D-mocks
  when the viewport is desktop-sized (matching the desktop app's
  pattern) — desktop-web parity beyond that is not required.
- Number/date strings ship pre-formatted inside fixtures; real
  formatting rules arrive with real data in a later feature.
- Existing per-platform catalog/preview mechanisms are reused where they
  exist (e.g. the iOS catalog from spec 010); a platform without one gains
  a minimal gallery entry point.
