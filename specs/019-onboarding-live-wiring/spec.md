# Feature Specification: Live Onboarding — Create & Sign In Wired to the Core, in the v2 Flow

**Feature Branch**: `019-onboarding-live-wiring`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "接通真实 onboarding：把「创建钱包」与「登录钱包」从纯 UI 变成可用功能，在 app-web/vela-wallet（SvelteKit）、app-ios/VelaWallet（SwiftUI）、app-android/vela-wallet（Kotlin Compose）、app-desktop/vela-wallet（Rust gpui）四端同时落地。业务规则不重写：全部来自 vela-core 已有的两台 Crux 状态机 create_wallet.rs 与 login.rs，共享词汇在 shell.rs；每端只实现一个 executor 执行副作用并渲染 ViewModel，失败一律转成结果变体而非异常。UI/UX 权威是 design/onboarding-new 的 v2 设计，它整页分步（welcome → 名称 → 添加通行密钥列表 → 生成进度 → 完成），错误用底部弹层；v2 全面取代 spec 014 的容器，并新增「添加通行密钥」列表屏。同时把 session.rs 接到四端。核心两处修改：ACK_COUNT 4→2，加钥匙加上来源 KeyMethod。passkey 通路：web 用浏览器 WebAuthn；iOS 用 ASAuthorization；Android 用 CredentialManager；desktop 用 CTAP2 over USB HID 直连。不含 caBLE 扫码/BLE/NFC/CCID 与 iOS/Android 的自建 CTAP 通路（留给 020）。"

## Why

Every rule this feature needs already exists and is already tested. `create_wallet.rs`
and `login.rs` have carried the whole of wallet creation and sign-in — the founding key
set, the "address = f(all keys)" derivation, the publish-before-enter ordering, the
one-signature candidate match, the on-device two-signature recovery — since spec 011,
with ~88 passing tests. Spec 014 then built the create/login screens on all four native
shells and deliberately forbade them from doing anything (FR-011), with field names
chosen to match the core's ViewModels.

So the wallet has rules that no client can run, and clients that render states nothing
produces. On iOS, Android and desktop a person literally cannot create a wallet. That is
the gap this feature closes, and it is the last one between the four rewritten clients
and a usable product.

Two things changed since 014 and must land with the wiring rather than after it. First,
the design was redone: the v2 flow is a full-page stepped journey rather than a sheet or
an in-column panel, and it adds a screen 014 never had — the founding-key list, which is
the only place a multi-key wallet can be assembled, because the address freezes the
moment the set does. Second, the founder ruled that a wallet whose only key path runs
through an operating system's passkey service is a wallet a lapsed domain can padlock;
the escape hatch is a passkey path the app owns end to end. This feature takes the first
step of that — the desktop client, which has no system passkey service at all, talks
CTAP2 straight to a security key — and leaves the full five-platform unification to 020.

## Design Authority

`design/onboarding-new/Vela Wallet Onboarding.html` is the authoritative UI. It is a
bundled offline page; the rendered design is the inlined `text/x-dc` template plus the
two token blocks (`:root` and `[data-theme="dark"]`). Its values resolve 1:1 onto the
existing token source `docs/design-tokens.json` — `--accent #E8572A` is
`color.accent.base`, `--success`/`--warning`/`--error` are the corresponding status
tokens — so this feature introduces **no new design tokens**.

Five screens plus one overlay pattern:

| Screen | Content | Backed by |
| --- | --- | --- |
| **Welcome** | Mark + `VELA WALLET` wordmark, hero 「谁也关不掉的<br>以太坊钱包」, sub 「用通行密钥签名，密钥留在你的设备里。」, primary 创建钱包 / secondary 我已有钱包 | shell step + `LoginView` |
| **Name** | Account-name field, two static assurances, one agreement checkbox, 继续 | `CreateView` stage `form` |
| **Keys** | Title flips 添加通行密钥 ⇄ 再加一把才能创建; `n / 7` counter; one row per founding key (icon, name, provider line, badge 已同步 / 仅本机 / 硬件); accent-soft warning strip while blocked; `+ 添加通行密钥` opening the three add methods; primary CTA flips 创建钱包 ⇄ 先添加第 2 把密钥 | `CreateView` stage `add_keys` |
| **Progress** | 正在生成钱包, `DERIVING ADDRESS` + percentage, three task rows (校验通行密钥公钥 / 推导账户地址 / 写入密钥索引) | `CreateView` `busy` + `status` |
| **Done** | Success tick + 钱包已创建, identicon + wallet name + mono address card, key list, 进入钱包 | `CreateView` stage `created` |
| **Error sheet** | Bottom sheet on mobile (drag handle, top-rounded), centred 400px card on desktop; title, body, one primary + one secondary action | `PromptKind` / outcome catalog |

Frames: desktop 1000×680 with a centred 620px (welcome) / 440px (flow) column; mobile
390×820, single column, buttons stacked. Both themes are first-class.

Two design facts that are **not** in the v2 file and come from the same design set's
desktop mocks (`DN4`, `DN5`), which the founder confirmed still apply:

- The `+ 添加通行密钥` control expands **in place** into three labelled methods:
  这台电脑（Touch ID 或 Windows Hello）· 手机或平板（扫码，用附近设备创建）· USB 安全密钥（插入后轻触）.
- The key list carries the line 「钱包地址由这组密钥决定，创建后不能再增减。」 above the CTA.

The state map `design/onboarding-new/Onboarding 状态机地图.html` is authoritative for
behaviour, and it names its own source of truth: `create_wallet.rs`, `login.rs`,
`shell.rs`. Where the map and the Rust disagree, the Rust wins.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A person creates a wallet and lands inside it (Priority: P1)

Someone opens Vela Wallet for the first time on any of the four clients. They choose
创建钱包, name the wallet, accept the two acknowledgements, and are walked through
minting their founding passkeys. When the set is complete the app derives the address,
publishes the key group, saves the account, shows the address, and lets them enter the
wallet.

**Why this priority**: Without it three of the four clients have no way to produce a
wallet at all. Everything else in the product is downstream of an account existing.

**Independent Test**: On one client, with no stored state, run the journey end to end and
finish holding a real address that the wallet home then displays.

**Acceptance Scenarios**:

1. **Given** a client with no stored account, **When** the person completes the create
   journey, **Then** a wallet address is derived from the full founding key set, the key
   group is published on-chain before the account is saved, and the account is readable
   by the wallet home.
2. **Given** the name screen, **When** either acknowledgement is unchecked or the name
   exceeds the handle budget, **Then** 继续 is unavailable and an over-length name is
   flagged inline.
3. **Given** the same founding key set entered on any two of the four clients, **When**
   each derives its address, **Then** the two addresses are identical.
4. **Given** the progress screen, **When** the core reports each stage, **Then** the three
   task rows advance in step with it rather than on a timer.
5. **Given** the done screen, **When** the person activates 进入钱包, **Then** they arrive
   at the wallet home with the wallet's real name and address shown.

---

### User Story 2 - A returning person signs in, even on a client that has never seen them (Priority: P1)

Someone who already has a Vela wallet chooses 我已有钱包. If this client already knows one
of their passkeys they are in immediately. If not, one signature is enough in the common
case: the assertion yields two candidate public keys and the on-chain registry recognises
the real one, from which the whole founding group — and therefore the address — is
rebuilt. Only when neither this client nor the registry recognises the key are they asked
to consent to on-device recovery and sign a second time.

**Why this priority**: A wallet you cannot re-enter from a second device is not
self-custodial in any useful sense, and it is the specific promise the multi-key design
was built to keep.

**Independent Test**: Create a wallet on client A, then sign in on a freshly installed
client B and arrive at the same address without ever touching client A's storage.

**Acceptance Scenarios**:

1. **Given** a client that already stores an account whose founding set contains the
   presented credential, **When** the person signs in, **Then** they enter without any
   network call.
2. **Given** a client with no stored account and a key the registry knows, **When** the
   person signs in, **Then** the full founding group is fetched, the address is recomputed
   from the whole set and cross-checked against the group's recorded address, and they
   enter — having signed exactly once.
3. **Given** a recomputed address that does not match the group's record, **When** the
   check fails, **Then** sign-in is refused with an explanation rather than entering a
   guessed address.
4. **Given** a key neither this client nor the registry recognises, **When** the person is
   offered on-device recovery and declines, **Then** nothing is stored or changed.
5. **Given** the same situation and they accept, **When** they sign a second time, **Then**
   the two assertions must pin down exactly one public key or recovery fails closed.

---

### User Story 3 - The wallet is still there after the app is closed (Priority: P1)

Having created or entered a wallet, the person quits the app and reopens it. They are
still signed in, on the wallet home, looking at the same wallet.

**Why this priority**: Without it neither of the first two stories can even be verified by
hand — every test run would start from scratch — and the product would appear to lose the
wallet on every launch.

**Independent Test**: Complete story 1, force-quit, relaunch, and observe the same address
without re-authenticating.

**Acceptance Scenarios**:

1. **Given** a completed onboarding, **When** the app is force-quit and relaunched,
   **Then** it opens on the wallet home with the same wallet selected.
2. **Given** no stored account, **When** the app launches, **Then** it opens on Welcome and
   the wallet routes are not reachable.
3. **Given** a stored account, **When** the person signs out, **Then** the stored wallet is
   cleared and the app returns to Welcome.

---

### User Story 4 - The founding key set cannot be assembled unsafely (Priority: P2)

While adding keys, the person sees exactly which of their keys are backed up and which
live only on this device, cannot exceed seven, cannot silently replace a key the address
already depends on, and cannot finish with a single un-backed-up key.

**Why this priority**: These are the invariants that make the address trustworthy and the
wallet recoverable. They are already enforced by the core; this story is about the client
never letting a person walk into a state the core will refuse, and explaining why.

**Independent Test**: On one client, mint a single device-bound key and confirm the flow
blocks with the explanation and unblocks the moment a second key is added.

**Acceptance Scenarios**:

1. **Given** exactly one founding key that is not backed up to a sync fabric, **When** the
   person tries to finish, **Then** the flow blocks, the title becomes 再加一把才能创建, the
   warning strip explains the loss risk, and the CTA reads 先添加第 2 把密钥.
2. **Given** any second key — even another device-bound one — **When** it is added, **Then**
   finishing is allowed.
3. **Given** an authenticator that already holds one of this wallet's founding keys, **When**
   the person tries to add it again, **Then** it is refused with an explanation and the
   existing set is untouched.
4. **Given** seven founding keys, **When** the person opens the add control, **Then** adding
   is unavailable and the reason is shown.
5. **Given** a key whose membership confirmation was cancelled, **When** the list renders,
   **Then** that row alone offers a retry and finishing stays unavailable until it succeeds.
6. **Given** the add control, **When** it is opened, **Then** the three methods are listed,
   and the cross-device scan method is visibly unavailable with a stated reason.

---

### User Story 5 - Every failure is legible and recoverable (Priority: P2)

When a passkey prompt is dismissed, a device has no usable credential, the index cannot be
reached, or the on-chain publish fails, the person sees a plain explanation and a way
forward — never a dead end, a silent no-op, or a raw error.

**Why this priority**: Onboarding is where trust is either earned or lost, and passkey
ceremonies fail routinely for benign reasons. The core already classifies every failure;
this story is about surfacing that classification.

**Independent Test**: Dismiss the passkey prompt at each ceremony on one client and
confirm the flow returns to a sensible state with drafts intact and an explanation shown.

**Acceptance Scenarios**:

1. **Given** the first registration, **When** the person dismisses the prompt, **Then** the
   flow returns to the name screen with the entered name preserved and a cancelled status
   shown, without an alert.
2. **Given** an added key's registration, **When** the person dismisses the prompt, **Then**
   the flow returns to the key list with the existing keys intact.
3. **Given** a device with no usable credential, **When** the person signs in, **Then** the
   error sheet offers 换一台设备登录 and 创建新钱包.
4. **Given** the index server failing three consecutive health probes, **When** the Welcome
   screen is shown, **Then** the endpoint settings surface with a warning, and sign-in is
   still attempted rather than blocked.
5. **Given** a publish that fails after the keys are minted, **When** the failure lands,
   **Then** the flow shows a retry screen with the full key set and drafts preserved,
   technical details available, and retry resuming at the publish rather than at
   registration.
6. **Given** any error sheet, **When** it is dismissed or its secondary action is taken,
   **Then** the flow returns to a state the person can act from.

---

### User Story 6 - Every v2 state is inspectable without touching hardware (Priority: P3)

A developer or reviewer opens the per-client state gallery and steps through every screen
and every failure state of the v2 flow, in both themes, without triggering a passkey
prompt, a network call, or a write.

**Why this priority**: The 014 galleries are the established acceptance channel for design
fidelity and they will otherwise rot into showing a design that no longer ships.

**Independent Test**: Open the gallery on one client and reach every v2 state listed in
the design authority table plus the full failure catalog.

**Acceptance Scenarios**:

1. **Given** a development build of any client, **When** the gallery is opened, **Then**
   every v2 screen and every failure state is reachable with fixture data.
2. **Given** any gallery state, **When** the theme is toggled, **Then** it renders correctly
   in both without colours leaking from the other theme.
3. **Given** a release build, **When** the app is used normally, **Then** the gallery is not
   reachable.

---

### Edge Cases

- A wallet name that fits on screen but exceeds the passkey handle budget once combined
  with a per-key label — the per-key display name degrades to the label alone rather than
  failing.
- A person who abandons the flow after minting keys but before publishing, then relaunches:
  the pending record written before the first publish attempt must make the interrupted
  creation resumable rather than orphaning minted keys.
- A late result from an abandoned attempt arriving after the person has restarted the flow
  — it must be discarded rather than contaminating the new attempt.
- Sign-in against a key the registry knows but that belongs to no group (a pre-group,
  single-key wallet) — resolves directly without a group fetch.
- A wallet whose name is unrecoverable from the credential handle — falls back to the
  legacy index lookup, then to a default label, never to a failure.
- The index health probe running while a sign-in attempt is in flight — the two must not
  cancel each other.
- On desktop, no security key present, or one present that cannot do the required
  ceremony — must be stated plainly, not surfaced as a generic failure.
- A person who has an existing wallet created before this feature, whose stored account
  predates the multi-key shape — must still open, and must not be "repaired" into a
  different single-key address.

## Requirements *(mandatory)*

### Functional Requirements

**Where decisions live**

- **FR-001**: All create and sign-in rules MUST come from the existing core state machines.
  No client may re-implement, duplicate, or override a transition, a validation, or a
  failure classification.
- **FR-002**: Each client MUST perform side effects in exactly one place, covering every
  operation the core can request, and MUST report every failure back to the core as a
  described outcome rather than as an unhandled error — so that what a failure *means* is
  decided once, in the core, and never per client.
- **FR-003**: Clients MUST render from the core's view model on every update, and MUST NOT
  hold flow state of their own beyond presentation concerns.
- **FR-004**: A result belonging to an abandoned attempt MUST be discarded.

**The acknowledgements**

- **FR-005**: The name screen MUST present exactly two acknowledgements the person must
  accept: that the private keys are held by their own device's credential manager and
  cannot be recovered by Vela, and that they agree to the privacy policy and terms.
  Everything else on that screen is explanatory copy, not a gate.
- **FR-006**: The two policy documents MUST be reachable from the second acknowledgement.

**The founding key set**

- **FR-007**: Keys MUST be addable only during creation, never after, and the client MUST
  state this on the key screen.
- **FR-008**: The key list MUST show, per key, its name, its provider/method line, and
  whether it is backed up to a sync fabric or exists only on this device.
- **FR-009**: The client MUST offer three add methods — this device, a nearby device via
  scan, and a USB security key — and MUST present the scan method as unavailable in this
  feature with a stated reason.
- **FR-010**: The chosen add method MUST reach the core, so that both the ceremony the
  client runs and the provider line the row shows follow from the person's choice.
- **FR-011**: Adding a key MUST exclude the wallet's already-registered founding keys so an
  authenticator cannot silently replace one.
- **FR-012**: The flow MUST refuse to finish while any key's membership confirmation is
  outstanding, and MUST offer a per-key retry for exactly the outstanding one.
- **FR-013**: The flow MUST refuse to finish when the sole founding key is not backed up,
  and MUST explain the reason in the person's own terms.

**Publishing and entering**

- **FR-014**: The account MUST NOT be saved and the wallet MUST NOT be enterable until the
  key group's on-chain publish has landed.
- **FR-015**: A record of the pending publish MUST be written before the first publish
  attempt and removed after it lands.
- **FR-016**: A failed publish MUST lead to a retry screen that preserves the full key set,
  exposes the underlying error as technical detail, and resumes at the publish.
- **FR-017**: The address MUST NOT be shown before the wallet is real.

**Session**

- **FR-018**: On completion the wallet MUST be handed to the app's session, persisted, and
  restored on the next launch without re-authentication.
- **FR-019**: Wallet routes MUST be unreachable while no wallet is established, and Welcome
  MUST be unreachable while one is.
- **FR-020**: Signing out MUST clear the stored wallet and return to Welcome.
- **FR-021**: Stored account records MUST remain compatible with those written by the
  currently shipping web app, including records that predate the multi-key shape, and MUST
  carry the full founding key set on every read and write.

**Presentation**

- **FR-022**: The create and sign-in flows MUST follow the v2 design on all four clients:
  a full-page stepped journey with a back affordance and a segmented progress indicator,
  with failures presented in a bottom sheet on mobile and a centred card on desktop.
- **FR-023**: The progress screen's task rows MUST advance from the core's reported stage,
  not from elapsed time.
- **FR-024**: All colour, spacing, radius, type and shadow values MUST come from the shared
  token source; no new tokens are introduced.
- **FR-025**: No user-visible string may be hard-coded; all copy MUST resolve through the
  shared translation corpus in all supported locales.
- **FR-026**: Each client MUST keep a development-only gallery covering every v2 state in
  both themes, unreachable in release builds.

**Passkey paths**

- **FR-027**: Each client MUST use a passkey path that actually works on that platform, and
  MUST NOT require the person to install anything beyond what the platform or their own
  security key already provides.
- **FR-028**: On desktop, where no system passkey service is available, the app MUST talk to
  an external security key directly, and MUST tell the person plainly when none is present.
- **FR-029**: A minted passkey MUST prove it can sign before it is counted as a founding key.

**Not breaking what ships**

- **FR-030**: The currently shipping web client MUST continue to build, pass its tests, and
  create and sign in successfully after the core changes this feature makes.

### Key Entities

- **Founding key set**: One to seven passkeys minted during creation, in canonical founding
  order. Its membership determines the wallet address; freezing it is irreversible.
- **Founding key**: One passkey — its credential, its public key, its per-key label, whether
  it is backed up, which method created it, and whether it has proved group membership.
- **Add method**: How a founding key is minted — this device, a nearby device via scan, or a
  USB security key. Determines the ceremony and the row's provider line.
- **Acknowledgement**: One of the two gates a person must accept before creation begins.
- **Key group**: The founding key set as published on-chain; the only way a client that has
  never seen a wallet can rebuild a multi-key address.
- **Pending publish record**: Written before the first publish attempt so an interrupted
  creation is resumable.
- **Account**: The persisted wallet — name, address, and the full founding key set.
- **Session**: Which account is active and whether a wallet is established at all.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On all four clients, a person with no prior state can create a wallet and
  reach the wallet home showing its real address.
- **SC-002**: On all four clients, a person can sign in on a client that has never stored
  their account and arrive at the same address, signing once in the common case.
- **SC-003**: A founding key set entered on any two clients derives byte-identical
  addresses, matching the recorded multi-key reference wallet.
- **SC-004**: On all four clients, force-quitting and relaunching after onboarding returns
  the person to the same wallet without re-authentication.
- **SC-005**: Every failure listed in the failure catalog is reachable in each client's
  gallery and renders the v2 presentation in both themes; none produces a crash, a silent
  no-op, or an untranslated string.
- **SC-006**: A single un-backed-up founding key cannot complete creation on any client, and
  the reason is stated in the person's language.
- **SC-007**: Cancelling any passkey prompt loses no entered data on any client.
- **SC-008**: A publish failure is recoverable from the retry screen without re-minting any
  key.
- **SC-009**: All onboarding copy resolves in every supported locale with no missing keys.
- **SC-010**: The currently shipping web client still creates and signs in successfully
  after this feature's core changes.

## Assumptions

- **The core's rules are correct and stay put.** Only two core changes are in scope — the
  acknowledgement count, and carrying the add method into the registration request. Any
  other core behaviour that turns out to be wrong is reported, not patched here.
- **Five shells, not four.** The currently shipping web client is a fifth consumer of the
  same core and is updated in lockstep with the two core changes (FR-030). It is not
  redesigned to v2 in this feature.
- **Desktop needs a security key.** The desktop app has no system passkey service to fall
  back on, so it speaks to security keys itself; with the scan and wireless methods
  excluded here, a person creating or entering a wallet on desktop must have a USB
  security key. This matches the desktop design mocks, whose
  first key is a USB key, and is lifted in 020.
- **The scan method is designed but disabled.** Its entry point is present and explained
  rather than hidden, so the key screen matches the design and the capability arrives in
  020 without a layout change.
- **Platform passkeys stay.** "This device" remains one of the three methods permanently;
  the app-owned passkey path is an addition, not a replacement.
- **Discoverability is assumed on platform passkeys.** Mobile platform credentials are
  always discoverable, so the explicit discoverability check the web path performs has no
  equivalent on iOS and Android and its absence is not treated as a failure.
- **Excluding existing credentials is available.** The iOS deployment target is whatever is
  required for the platform to honour an exclusion list during registration (FR-011); if
  that forces a minimum-version bump it is taken.
- **Domain association is configured.** The relying-party associations that the iOS and
  Android system passkey services require are already in place for the production domain;
  verifying them is in scope, establishing them is not.
- **Existing storage keys and record shapes are reused** so a person with a wallet from the
  currently shipping web client is not stranded.
- **The wallet home stays as it is.** This feature makes the session real; the home's own
  balances and assets remain fixture-driven until a later feature.
- **The 014 flow components are reused where they still fit** — buttons, fields, checkbox
  rows, action stacks, progress bars, badges, technical-detail disclosures, address strips,
  sheets. The containers and the screen decomposition are rebuilt.
- **The failure catalog survives the redesign.** The eighteen outcome kinds spec 014
  established are re-skinned into the v2 sheet, not reduced.

## Out of Scope

- Cross-device passkey creation by scanning (caBLE / hybrid), and the wireless and
  smart-card transports (BLE, NFC, CCID) — feature 020.
- An app-owned passkey path on iOS, Android and the web — feature 020.
- Making the wallet home's balances, assets and activity real.
- Any change to the on-chain contracts, the registry service, or the index service.
- Redesigning the currently shipping web client to the v2 flow.
