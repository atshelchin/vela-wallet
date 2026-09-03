# Feature Specification: Web Live Shell — Settings & Contacts on the Core

**Feature Branch**: `024-web-live-shell`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "web-live-shell: 让 app-web/vela-wallet（SvelteKit）的 Settings 与 Contacts 两个界面从 fixture 驱动变为 vela-core Crux 机器驱动（network_admin、display_currency、contacts 三台机器），并建立后续 20 台机器接线全部复用的通用管线：gen-core-types 增加 app-web 输出镜像、wasm-client 通用化（loadCore + 22 个 Core 类导出）、effect-loop/json-shell 提升到 $lib/core、IndexedDB 版 AsyncStorage 形状存储层。纯存储零网络（RPC 相关磁贴留 fixture 标注 live in 025）。新增 /[locale]/contacts 路由与 Contacts 组件回调交互面。本 spec 显式取代 017 FR-202（native keeps TypeScript，已被 019 废除）；explore/dapp 浏览器维持 web 端排除（spec 022 决定）。移植参考：Expo src/services/wallet-state-core/ 的 executor/session/resident 模式与 src/services/storage.ts、contacts.ts。验证：全门禁 + Playwright 持久化用例（三引擎 IndexedDB）+ Welcome 零 wasm 请求与 Worker 无 wasm 既有断言保持。"

## Why

Every business rule of the wallet already lives in vela-core: 24 Crux machines,
~973 green tests. The web client runs exactly three of them (create, login,
session). Everything else a signed-in person sees — the settings they change,
the contacts they keep — is a fixture: a picture that forgets.

This feature is the first of three that make the web client *live*, and it is
deliberately the smallest: the two screens chosen here (`Settings`, `Contacts`)
are governed by machines that need **storage only — zero network**. That lets
this spec pay the one-time cost of the *paved road* — the generic pipeline that
every later machine reuses unchanged — while the hardest new surface is a
browser-local database, not an RPC layer. Spec 025 (read path: balances,
activity, receive) and spec 026 (money path: send, signing) each add exactly
one further class of infrastructure on top of what this spec proves.

**Supersession**: spec 017's FR-202 ("native keeps its TypeScript logic;
`vela-core-uniffi` stays crux-free") is hereby retired, completing what spec
019 started when it linked crux into uniffi. The program of record is now: all
four clients drive the same Rust machines; shells hold rendering and I/O only.
No new TypeScript business logic is written on any platform.

**Standing exclusions** (recorded, not revisited): the web client ships no
Explore tab and no in-app dApp browser (spec 022 founder decision — a browser
tab cannot host another site's dApp); RPC-health information inside Settings
stays fixture-fed until spec 025 introduces the network layer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Settings that remember (Priority: P1)

A signed-in person opens Settings, changes their display currency, adds a
custom network, edits it, removes it — and every one of those choices is real:
it survives a reload, it survives closing the browser, and what the screen
shows is exactly what the wallet core has ruled, not a staged picture.

**Why this priority**: Settings is the cheapest full-chain proof that a drawn
screen can go live — the route, the identity overlay, and (as of spec 023) the
entire visual surface already exist. Proving the pipeline here de-risks every
later screen, and "my preferences persist" is the first believable signal to a
user that this app is an application and not a demo.

**Independent Test**: Open `/{locale}/settings` in a browser with a wallet
established, change the display currency, add + edit + remove a custom
network, reload after each step; the state persists and matches what was
entered. No network requests are made by any of these actions.

**Acceptance Scenarios**:

1. **Given** a signed-in wallet, **When** the person changes the display
   currency and reloads the page, **Then** the chosen currency is still
   selected and is the one the settings screen displays.
2. **Given** a signed-in wallet, **When** the person adds a custom network
   with a duplicate chain id of a built-in network, **Then** the add is
   refused with the same rule and message discipline the core's tests pin —
   the screen cannot accept what the core forbids.
3. **Given** a custom network was added and the browser was fully closed,
   **When** the person returns to Settings, **Then** the network is still
   there with every field intact.
4. **Given** the settings screen before the wallet core has answered,
   **When** the page is served (prerendered HTML, no script), **Then** it
   shows a neutral waiting surface — never another person's data, never
   fixture data posing as the visitor's own.
5. **Given** any of the 15 supported locales, **When** Settings is opened,
   **Then** all live-wired copy renders in that locale from the shared corpus.

---

### User Story 2 - A real address book (Priority: P2)

A person opens the Contacts tab (which today silently does nothing on web),
adds a contact with a name and address, organises contacts into groups,
edits, deletes — and their address book is durable and consistent: the same
book on the mobile layout and the desktop layout, still there tomorrow.

**Why this priority**: Contacts is the first screen that must gain an
*interaction surface* (the drawn components are pure pictures today) and the
first to prove durable structured storage. It is 1:1 with a single core
machine, making it the cleanest architectural template for every later
screen — but it depends on the same pipeline Story 1 proves, so it lands
second.

**Independent Test**: Navigate to Contacts from the wallet tab bar, perform
add / edit / group / delete operations, reload between operations; the book
persists and the list ordering, grouping, and dedup behaviour match the core's
rules (the same rules its 44 Rust tests pin).

**Acceptance Scenarios**:

1. **Given** an empty address book, **When** the person opens Contacts,
   **Then** the empty state invites them to add a contact, and adding one
   with a valid address shows it in the list immediately.
2. **Given** a saved contact, **When** the browser is closed and reopened,
   **Then** the contact is still present with name, address, and group
   membership intact.
3. **Given** contacts in several groups, **When** the person filters by
   group, **Then** the list shows exactly the members the core rules say
   belong to that group.
4. **Given** an invalid address, **When** the person tries to save it,
   **Then** the save is refused by the core's validation — the screen offers
   no way around it.
5. **Given** the same wallet on a narrow window and a wide window, **When**
   the person switches between them, **Then** both layouts present the same
   book (one source of truth, two presentations).
6. **Given** a deleted contact, **When** the person deletes it and reloads,
   **Then** it does not return (deletion is durable, honouring the core's
   tombstone rules).

---

### User Story 3 - The paved road (Priority: P3)

A maintainer wiring the *next* machine (spec 025's balances, spec 026's send)
adds no new plumbing: the generated types, the core loader, the effect loop,
the storage layer, and the screen-wiring pattern established here are reused
verbatim — one new machine costs one executor, one store, one builder, and
nothing else.

**Why this priority**: This is the enabling investment. It has no direct user
value of its own — its value is that stories 1–2 of *this* spec and every
screen of the next two specs are all instances of one pattern instead of five
inventions.

**Independent Test**: The wiring for `display_currency` (the smallest machine)
is added after the pipeline exists using only per-machine files (no edits to
shared plumbing), and the app's existing quality gates all stay green.

**Acceptance Scenarios**:

1. **Given** the generalised pipeline, **When** the three machines of this
   spec are wired, **Then** each adds only its own executor, store, builder,
   and route wiring — no machine-specific branches appear in shared code.
2. **Given** the shipped web bundle before and after this feature, **When**
   the core artifact is measured, **Then** its size is unchanged (all
   machines were already aboard) and remains under the recorded ceiling.
3. **Given** the existing onboarding and session flows, **When** this
   feature lands, **Then** their behaviour and their tests are unchanged.

---

### Edge Cases

- **Durable storage unavailable** (private browsing, storage denied, quota
  exhausted): operations answer with the failure variants the core already
  models — the screen shows the core's ruling; nothing is silently dropped
  and the app does not crash. Data entered in such a session may not
  survive it, and nothing pretends otherwise.
- **Two tabs open on the same wallet**: last write wins at the storage layer;
  a tab never crashes on data another tab wrote; a reload converges on the
  stored state. (Cross-tab live sync is out of scope and recorded below.)
- **A late answer to an abandoned question**: results arriving after the
  person has navigated away or restarted a flow are discarded by the core's
  staleness rules — never applied to the wrong state.
- **Prerendered HTML with scripts disabled**: settings and contacts pages
  render their static frame and waiting state; no fixture data is presented
  as the visitor's own.
- **A locale adds longer strings** (German/Russian): the live screens inherit
  the drawn components' existing overflow behaviour; no new copy may be
  hard-coded outside the corpus.
- **Deep link to `/{locale}/contacts` with no wallet established**: the
  route guard sends the visitor to Welcome, exactly as the wallet and
  settings routes already do.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Settings live)**: The settings screen's business state — display
  currency and network administration (list, add, edit, remove of custom
  networks, with the built-in registry's rules) — MUST be decided by the
  wallet core's machines and rendered from their views. Fixture data may
  remain only on the RPC-health surfaces explicitly marked as deferred to
  the read-path feature.
- **FR-002 (Contacts live)**: The contacts screen MUST become reachable from
  the app's navigation on both mobile and desktop layouts, and its full
  lifecycle — create, edit, delete, group membership, list presentation —
  MUST be decided by the wallet core's contacts machine.
- **FR-003 (Durability)**: Choices made on these screens MUST survive page
  reload and full browser restart on the same device and browser profile.
- **FR-004 (Core decides, shell performs)**: No business rule — validation,
  dedup, ordering, tombstones, refusal messages — may be implemented or
  duplicated in web code. The shell's job is rendering, storage I/O, and
  event dispatch; every operation the core requests is answered, and
  expected failures are answered as the core's failure variants, never
  thrown past it.
- **FR-005 (One pattern)**: All three machines MUST be wired through the same
  shared pipeline (types generation, core loading, effect loop, storage),
  with per-machine code limited to: an operation executor, a view store, a
  display builder, and route/component bindings.
- **FR-006 (Drawn UI is the UI)**: The existing drawn components and their
  display models remain the single visual source. Live wiring feeds them by
  building the same display models from core views; the fixture builders
  remain canon for the galleries. Where components lack an interaction
  surface (contacts), callbacks are added without moving any decision into
  the components.
- **FR-007 (Localisation)**: All user-visible copy on the live screens MUST
  come from the shared 15-locale corpus through the established build-time
  pipeline; no hard-coded strings. New keys follow the full corpus process.
- **FR-008 (Prerender safety)**: Every touched route MUST remain prerendered
  for all 15 locales, render a neutral waiting state before the core has
  ruled, and never present fixture or third-party data as the visitor's own.
- **FR-009 (Standing budgets hold)**: The Welcome page still requests no
  core artifact; the deployed worker still contains none; the shipped core
  artifact's size is unchanged by this feature; onboarding/session storage
  keys and behaviour are untouched.
- **FR-010 (Supersession on record)**: This spec retires 017 FR-202. Native
  shells are out of scope here, but no work in this feature may assume or
  recreate a TypeScript-owns-business-logic arrangement anywhere.
- **FR-011 (Quality gates)**: The app's full local gate suite (checks, lint
  including the visual-literal audit extended to every new directory, unit
  tests, build, end-to-end) MUST pass, with new end-to-end coverage for the
  persistence scenarios of stories 1–2 across the three browser engines.

### Key Entities

- **Contact**: a saved counterparty — name, address, optional group
  memberships; subject to the core's validation, dedup, and tombstone rules.
- **Contact Group**: a named collection of contacts; membership decided by
  the core.
- **Custom Network**: a user-added network definition (name, chain id,
  endpoints, explorer link) layered over the built-in registry; add/edit/
  remove rules owned by the core.
- **Display Currency**: the person's chosen fiat presentation currency;
  seeded and constrained by the core's rules.
- **Stored Record**: the durable browser-side representation of the above,
  written and read only at the core's request.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can change display currency and manage a custom
  network end-to-end, and 100% of those changes survive reload and browser
  restart (verified automatically on three browser engines).
- **SC-002**: A person can build an address book of at least 100 contacts
  across at least 5 groups with add/edit/group/delete all functioning, and
  the book survives restart intact.
- **SC-003**: Contacts is reachable from the app's navigation on both
  layouts; the "tab that does nothing" is gone.
- **SC-004**: Zero business rules implemented in web code for these domains
  — every validation/ordering/refusal behaviour observed on screen is
  traceable to a core machine rule covered by the core's existing tests.
- **SC-005**: The shipped core artifact byte size is unchanged; Welcome
  still triggers zero core-artifact requests; the deployed worker remains
  free of it.
- **SC-006**: All 15 locales render the live screens with zero untranslated
  keys; the corpus gates pass.
- **SC-007**: The complete pre-existing gate suite passes unchanged (no
  test weakened, no assertion removed), plus the new persistence e2e suite.
- **SC-008**: Wiring the third machine (`display_currency`) after the first
  two touches zero shared-plumbing files — measured by the diff of that
  change.

## Assumptions

- Single-device, single-profile durability is the promise of this feature;
  cross-device sync and cross-tab live updates are out of scope.
- The Expo client's wiring (`src/services/wallet-state-core/`) and services
  (`src/services/storage.ts`, `contacts.ts`) are the porting reference and
  remain untouched; ported files carry provenance headers until the Expo
  app retires.
- The contacts corpus (spec 018) and settings corpus (spec 023) already
  cover most needed copy; only interaction-state gaps require new keys.
- RPC-health tiles in Settings remain fixture-fed and visibly consistent;
  they go live in the read-path feature (025).
- Browser support target is the three engines already in the e2e matrix
  (Chromium, Firefox, WebKit); IndexedDB is available in all three, and the
  storage layer treats its absence as an answered failure, not a crash.
- `ext_cache` (extension cache clearing) continues to be answered as a
  no-op on web, as the session wiring already does.
