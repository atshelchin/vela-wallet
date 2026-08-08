# Feature Specification: Onboarding Create/Login Full-State UI & State Gallery (Four Native Shells)

**Feature Branch**: `014-onboarding-flow-ui`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "四端 Onboarding Create/Login 全状态 UI 组件与状态画廊（纯 UI，不接业务）。在 app-android/vela-wallet（Kotlin Compose）、app-ios/VelaWallet（SwiftUI）、app-web/vela-wallet（SvelteKit）、app-desktop/vela-wallet（Rust gpui）四个原生壳中，按 design/onboarding/create（27 张）与 design/onboarding/login（8 张）设计稿实现「创建钱包」与「我已有钱包（登录）」两条流程的全部 UI 状态面板。35 张图只有 4 种模式，必须以可复用组件组装。手机端为 Welcome 屏上的 bottom sheet；web/desktop 在按钮所在栏原位切换面板。真实业务状态先不接入——本特性只验证 UI 组件与页面实现，每端提供 dev-only 状态画廊逐一查看全部状态（含 >3s 倒计时变体、浅/深色）。"

## Design Source of Truth

The 35 mock images under `design/onboarding/create/` (27) and `design/onboarding/login/` (8)
are the authoritative visual reference. They decompose into exactly **four patterns**:

| Pattern | Screens | Anatomy |
| --- | --- | --- |
| **Scaffold** | all | Mobile: drag handle + title + close ×. Desktop/web wide: title + close ×, no handle. Title varies by state: 创建钱包 / 登录 / 跨设备同步 (A12) / 创建钱包 ∕ 登录 (E10). |
| **Form** | A1, A2, A3 | Labeled account-name field → (A3) red inline over-length hint → helper caption → 3 acknowledgment checkbox rows (3rd row wraps inline Privacy Policy / Terms links) → full-width primary CTA with distinct disabled (dim) and enabled states. |
| **Progress** | A4–A8, A4c–A8c, B1, B1c | Create: 5-segment stepped progress bar + "第 N/5 步" caption + status headline + optional sub-caption. Login: single partially-filled bar + headline + sub-caption. `c` variants add a circular elapsed-seconds ring at the headline's right once a step has waited > 3 s (2-digit capable: 8, 19, 41 appear in mocks). |
| **Outcome** | A11–A13, B2–B6, E1–E10, E2x | Status icon badge (success green ✓ / warning amber ! / error red × / timeout clock / recovery-offer blue !) → headline → body → collapsible 技术详情 disclosure (expanded per E2x: error code in red, context line, endpoint line as a code block) → stacked actions: 1 primary + 0–2 secondary. Success (A11, B5) adds a copyable address strip (A11 only) and 进入钱包 primary. |

Yellow/grey annotation strings inside the mocks (e.g. "新增 i18n · onboarding.common.networkBody",
"展开态：同一块板的技术详情打开后", "兜底集合，实现时须把未匹配的异常都归到这里") are
**implementation directives, never UI copy** — they name required i18n keys and explain intent,
and must not be rendered.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every design state is inspectable in a per-platform gallery (Priority: P1)

The founder opens a development-only state gallery on any of the four platforms and steps
through every one of the 35 design states — create form/progress/outcome, login
progress/outcome, all ten error kinds, the > 3 s countdown variants, and the
expanded-details variant — in both light and dark themes, comparing each against the
corresponding mock without triggering any real passkey, network, or storage activity.

**Why this priority**: This is the acceptance channel the feature exists for. The business
state machines are wired later; the only way to validate the UI now is to make every state
reachable on demand.

**Independent Test**: Ship only the gallery with its fixture states on one platform and it
already delivers value: each mock can be visually verified against a live rendering.

**Acceptance Scenarios**:

1. **Given** a debug/dev build of any platform, **When** the gallery is opened, **Then** a
   navigable list presents all create-flow states (A1–A3, A4–A8, A4c–A8c, A11–A13,
   E1–E8, E2x, E10), all login-flow states (B1, B1c, B2–B6, E9, E10), each rendering the
   pattern composition of its mock with representative fixture data.
2. **Given** any gallery state, **When** the theme is toggled, **Then** the state renders in
   light and dark without hard-coded colors leaking from the other theme.
3. **Given** a release/production build, **When** the app is used normally, **Then** the
   gallery is not reachable.
4. **Given** the countdown-variant states, **When** they are displayed, **Then** the
   elapsed-seconds ring renders with 1- and 2-digit values as in the mocks.

---

### User Story 2 - The flows present correctly on each form factor (Priority: P1)

A user on the Welcome screen taps 创建钱包 or 我已有钱包. On iOS and Android the flow
opens as a bottom sheet over the Welcome screen (drag handle, rounded top, close ×). On
desktop and on web at ≥ 1280 px viewport width, the panel replaces the content of the
column that holds the two buttons, in place, with no modal. On web below 1280 px the
mobile bottom-sheet presentation is used.

**Why this priority**: The container behaviour is a platform-differentiating requirement
stated explicitly by the product owner; getting it wrong invalidates the page structure.

**Independent Test**: With only the Form state implemented, tapping each Welcome button on
each platform demonstrates the correct container (sheet vs in-place swap) and dismissal
back to Welcome.

**Acceptance Scenarios**:

1. **Given** the Welcome screen on iOS or Android, **When** either entry button is
   activated, **Then** a bottom sheet presents the flow's initial state, and close × (or
   the platform's standard sheet dismissal) returns to Welcome unchanged.
2. **Given** the Welcome screen on desktop, or web at ≥ 1280 px, **When** either entry
   button is activated, **Then** the button column swaps in place to the flow panel with
   the rest of the Welcome layout stable (no reflow jump), and close × restores the
   buttons.
3. **Given** web below 1280 px, **When** an entry button is activated, **Then** the
   bottom-sheet presentation is used.
4. **Given** an open flow panel or sheet, **When** the user interacts with form controls
   (typing, checkboxes, disclosure, address copy), **Then** all behaviour is local and
   visual only — no passkey ceremony, network call, persistence, or retry timer runs.

---

### User Story 3 - One authoritative component per capability (Priority: P2)

A maintainer adding a hypothetical new outcome state (say, a new error kind) composes it
from the existing pattern components — scaffold, status badge, disclosure, action stack —
plus new copy, without duplicating layout code. Each capability (scaffold, form field,
acknowledgment row, stepped progress bar, countdown ring, status badge, tech-details
disclosure, action stack, address strip, primary/secondary buttons) has exactly one
implementation per platform.

**Why this priority**: 35 screens hand-written individually would make the later
state-machine wiring and any design correction 35× more expensive. Reuse is the stated
core requirement.

**Independent Test**: Inspect each platform's component inventory: every one of the 35
states' renderings references the shared components; a grep for duplicated pattern layouts
returns one authority each.

**Acceptance Scenarios**:

1. **Given** the implemented flows, **When** the source is inspected, **Then** no state
   panel re-implements a pattern component's layout inline.
2. **Given** the presentation state model, **When** a state fixture is added to the gallery,
   **Then** no new layout code is needed — only a fixture describing pattern inputs.

---

### User Story 4 - Copy flows through the existing i18n pipelines (Priority: P2)

All user-visible strings, including the new ones the mocks annotate (e.g.
`onboarding.common.networkBody`, `onboarding.common.timeoutBody`,
`onboarding.login.statusAwaitingPasskey`, `onboarding.login.statusCancelled`,
`onboarding.login.successTitle` / `successMessage`), resolve through each platform's
existing vela-core-backed localization pipeline, in every locale that pipeline already
ships.

**Why this priority**: The four shells already have working i18n conventions; bypassing
them would create the exact drift this repo has spent prior specs eliminating.

**Independent Test**: Switch the app language on any platform; every flow state renders
localized copy with no hard-coded strings, and no annotation text appears anywhere.

**Acceptance Scenarios**:

1. **Given** any implemented state, **When** its strings are traced, **Then** each comes
   from the platform's localization pipeline, not a literal in view code.
2. **Given** the mock annotation strings, **When** the UI renders any state, **Then** none
   of them appear.

---

### Edge Cases

- **Light theme has no mocks**: all 35 mocks are dark; light rendering derives from the
  existing token pairs (Welcome light mocks W1L/D1L set the tone). No dark value may be
  hard-coded where a token pair exists.
- **Address overflow**: the success address strip must truncate a 42-character 0x address
  gracefully (mock shows tail truncation) while the copy affordance stays visible;
  copying gives visual "copied" feedback and copies the full untruncated address.
- **Acknowledgment row wrapping**: the third row's inline links wrap across lines (the
  known e2e click-target lesson from spec 011); links must remain individually activatable
  without toggling the checkbox.
- **Over-length name**: the red hint line (A3) appears without shifting the field above it
  out of view and coexists with the helper caption below.
- **Sheet height varies by state**: content-hugging sheets (B1 is much shorter than A1);
  transitions between states inside one open sheet must not snap to a fixed tallest
  height.
- **Countdown ring digits**: 1- and 2-digit values must fit the ring without resizing it.
- **Disclosure expansion**: expanding 技术详情 grows the panel/sheet in place (E2 → E2x)
  and pushes the action stack down; collapsed is the default on every entry to a state.
- **Desktop/web in-place swap stability**: the Welcome hero/branding column must not move
  when the button column swaps content, including for the tallest state (A1) and after
  disclosure expansion.
- **Keyboard on mobile form**: focusing the name field must keep the field and the primary
  CTA visible per each platform's standard keyboard-avoidance behaviour.
- **Dismissal mid-progress (pure UI phase)**: close × is always available as in the mocks;
  in this feature it simply closes/restores Welcome (no business consequence to model
  yet).

## Requirements *(mandatory)*

### Functional Requirements

#### Coverage and fidelity

- **FR-001**: Each of the four platform shells MUST be able to render every one of the 35
  design states (state inventory below), composed from the four patterns, with layout,
  hierarchy, iconography, and emphasis matching the corresponding mock in dark theme and
  a token-derived equivalent in light theme.
- **FR-002**: The mock annotation strings (i18n-key directives and designer notes) MUST NOT
  be rendered in any state.
- **FR-003**: The success state A11 MUST render the wallet address in a copyable strip;
  activating copy MUST copy the full address and show transient confirmation feedback.
- **FR-004**: The 技术详情 disclosure MUST default to collapsed, expand to show a code
  block containing an error code line (error-colored), a context line, and an
  endpoint/detail line (per E2x), and be present on every Outcome state that the mocks
  show with a disclosure.

#### Reusable composition

- **FR-005**: Each platform MUST implement the four patterns as reusable components with
  exactly one authoritative implementation per capability: scaffold (sheet/panel), name
  field with label/hint/caption, acknowledgment row (with inline-link support), stepped
  progress bar (segmented and single-bar modes), countdown ring, status badge (5 icon
  variants), technical-details disclosure, action stack (primary + up to 2 secondary),
  address strip, and buttons (reusing each platform's existing button component where one
  exists).
- **FR-006**: State panels MUST be assembled from these components; no state may
  re-implement a pattern's layout inline.

#### Presentation containers

- **FR-007**: On iOS and Android the flows MUST present as a bottom sheet over the Welcome
  screen with drag handle, rounded top corners, and close ×, hugging content height per
  state.
- **FR-008**: On desktop, and on web at viewport width ≥ 1280 px, activating an entry
  button MUST swap the flow panel into the Welcome button column in place, with no modal
  and no layout shift of the surrounding Welcome content; close × MUST restore the
  buttons.
- **FR-009**: On web below 1280 px the mobile bottom-sheet presentation MUST be used.

#### Presentation state model (wiring-ready, but not wired)

- **FR-010**: Each platform MUST define a presentation state model (enum plus fields) whose
  naming aligns with the CreateWallet/Login ViewModels of
  `specs/011-crux-onboarding-state/data-model.md` (`stage`, `name`, `name_too_long`,
  `can_submit`, `submit_label`, `busy`, `status`, `address`, `sync_error_detail`, …),
  extended with the mock-driven outcome taxonomy: `network`, `server`, `timeout`,
  `cancelled_setup`, `cancelled_verify`, `unsupported`, `incompatible`,
  `not_discoverable`, `account_not_found`, `unknown`.
- **FR-011**: The UI in this feature MUST NOT invoke any business behaviour: no
  passkey/WebAuthn ceremony, no index-service or other network call, no persistence, no
  retry/backoff timing. Interactive behaviour is limited to local visual state: text
  input and its over-length hint, checkbox toggling and derived CTA enablement,
  disclosure expand/collapse, address copy feedback, countdown ring display, and
  button-press callbacks that at most switch fixture states or dismiss.
- **FR-012**: The existing Expo React Native app and the web Crux-driven onboarding flows
  MUST remain untouched by this feature.

#### State gallery

- **FR-013**: Each platform MUST provide a development-only gallery that lists all 35
  states grouped by flow (create / login), renders each from a fixture, and allows
  switching theme (light/dark). The gallery MUST NOT be reachable in release builds.
- **FR-014**: Gallery fixtures MUST cover the countdown variants (A4c–A8c, B1c) and the
  expanded-disclosure variant (E2x) as directly selectable entries.

#### Localization and tokens

- **FR-015**: All user-visible copy MUST resolve through each platform's existing
  vela-core-backed localization pipeline in all locales that pipeline ships; the new keys
  annotated in the mocks MUST be added to the shared source of truth used by all four
  shells.
- **FR-016**: All colors, typography, spacing, and radii MUST come from each platform's
  existing design-token pipeline; no hard-coded visual constants in state panels or
  pattern components.
- **FR-017**: Interactive elements (buttons, checkboxes, close, links, copy) MUST expose
  accessible labels via each platform's standard accessibility mechanism.

#### Verification

- **FR-018**: All four platforms MUST build/typecheck cleanly with the feature included
  (Android assemble/compile, iOS build, web check/build, desktop cargo check/build).

### State Inventory

| Code | Flow | Pattern | Distinguishing inputs |
| --- | --- | --- | --- |
| A1 | create | Form | empty name, 0/3 acks, CTA disabled |
| A2 | create | Form | valid name, 3/3 acks, CTA enabled |
| A3 | create | Form | over-length name, red hint, CTA disabled |
| A4–A8 | create | Progress | steps 1–5 of 5; step-specific headline; A4 has sub-caption 请在系统弹窗中确认 |
| A4c–A8c | create | Progress | same + elapsed-seconds ring |
| A11 | create | Outcome | success ✓, 12-network body, address strip, 进入钱包 |
| A12 | create | Outcome | title 跨设备同步, warning !, 同步失败, actions: 重试上传 / 修改索引服务地址 / 上报这个错误 |
| A13 | create | Outcome | warning !, 验证一直失败?, actions: 完成验证 / 用新的通行密钥重新开始 / 返回 |
| E1 | create | Outcome | error ×, 网络连接不稳定, actions: 重试 / 取消 |
| E2 / E2x | create | Outcome | error ×, 服务暂时不可用, 3 actions; E2x = disclosure expanded (E_SERVER / 第 5 步同步公钥；以及登录 / HTTP 503 · p256-index.getvela.app) |
| E3 | create | Outcome | timeout clock, 等待超时, 60 秒没有响应 body, actions: 重试 / 返回 |
| E4 | create | Outcome | neutral !, 设置已取消, actions: 重新创建钱包 / 返回 |
| E5 | create | Outcome | neutral !, 验证已取消, actions: 重试验证 / 返回 |
| E6 | create | Outcome | error ×, 设备不支持, actions: 前往系统设置开启生物识别 / 返回 |
| E7 | create | Outcome | error ×, 设备不兼容, actions: 前往系统设置切换密码管理器 / 返回 |
| E8 | create | Outcome | warning !, 通行密钥未能同步, actions: 重新创建钱包 / 前往系统设置切换密码管理器 / 返回 |
| B1 / B1c | login | Progress | single bar, 正在等待通行密钥, Face ID/指纹 sub-caption; B1c adds ring |
| B2 | login | Outcome | recovery blue !, 找回钱包, actions: 立即找回 / 暂时不用 |
| B3 | login | Outcome | error ×, 未能完成找回, actions: 重试 / 返回 |
| B4 | login | Outcome | error ×, 登录失败, actions: 重试 / 上报这个错误 / 返回 |
| B5 | login | Outcome | success ✓, 登录成功, 进入钱包 (no address strip) |
| B6 | login | Outcome | neutral !, 登录已取消, actions: 重试登录 / 返回 |
| E9 | login | Outcome | title 登录, error ×, 未找到账户, actions: 创建新钱包 / 修改索引服务地址 / 返回 |
| E10 | shared | Outcome | title 创建钱包 ∕ 登录, error ×, 出错了 (catch-all), actions: 重试 / 上报这个错误 / 返回 |

### Key Entities

- **Presentation State**: One flow's renderable condition — pattern selection plus that
  pattern's inputs (headline key, body key, badge variant, actions, progress step, flags
  such as `name_too_long`, `busy`, disclosure content). Field naming aligned with the
  spec-011 ViewModels so a later crux mapping is mechanical.
- **State Fixture**: A named, gallery-selectable instantiation of a Presentation State with
  representative data (e.g. the A11 address, the E2x detail lines), one per inventory
  code.
- **Pattern Component**: One of the four reusable UI patterns (Scaffold, Form, Progress,
  Outcome) and its constituent atoms; one authority per capability per platform.
- **Outcome Taxonomy**: The ten error/result kinds extending the spec-011 `FailureKind`,
  each carrying badge variant, copy keys, and action set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 35 inventory states are selectable and correctly rendered in the
  gallery on all four platforms (140 renderings), verified by a walkthrough against the
  mocks.
- **SC-002**: Both themes render every state with no illegible or unthemed element; dark
  matches the mocks, light is fully token-derived.
- **SC-003**: A reviewer can identify exactly one implementation of each pattern capability
  per platform; no state panel contains a duplicated pattern layout.
- **SC-004**: New-code inspection finds zero passkey, network, or storage calls in the new
  UI modules on any platform.
- **SC-005**: All four platform builds/typechecks pass; existing test suites remain green
  (Expo app and web Crux flows untouched).
- **SC-006**: Every user-visible string in the new UI resolves through the localization
  pipeline in every shipped locale; zero mock-annotation strings appear.
- **SC-007**: The later business wiring requires only implementing a mapping from the
  crux ViewModels to the Presentation State — demonstrated now by a documented field
  correspondence table for each flow.

## Assumptions

- The dark mocks are authoritative; light theme derives from existing token pairs with the
  Welcome light mocks as tonal reference. Small platform-native divergences (system font
  metrics, native sheet physics, focus rings) are acceptable where the design system
  already accepts them.
- The countdown-ring variants exist for all five create steps and the login wait
  (A4c–A8c, B1c); the ">3 s" appearance rule is a presentational convention displayed in
  the gallery via explicit variant fixtures — no real elapsed-time measurement is wired
  in this feature.
- Chinese copy shown in the mocks is the zh source of truth; other locales follow the
  existing translation conventions of the shared i18n pipeline (machine translation
  pending human review is the repo's accepted precedent).
- The E-series shares one visual pattern between flows: E1–E8 surface under the create
  flow, E9 under login, E10 under both; the gallery groups them accordingly.
- Entry-button behaviour on Welcome is in scope only as far as opening/closing the
  container with the flow's initial state (form for create, awaiting-passkey progress for
  login as fixture); real flow progression arrives with the future wiring feature.
- Each platform's existing Welcome screen (specs 006–009) is the host surface; its layout
  is adjusted only as needed to host the in-place swap on desktop/web-wide.
- `vela-core` i18n catalogs are the shared copy source all four shells already consume;
  adding the new keys there (plus per-platform regeneration) is the intended single point
  of truth.
