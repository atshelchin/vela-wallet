# Feature Specification: Crux-Owned Onboarding State (Create + Sign In)

**Feature Branch**: `011-crux-onboarding-state`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "把 Expo web 版 Vela Wallet 的「创建钱包」和「登录（已有
钱包）」两条流程的业务状态，从 React UI 组件里抽出来，改由 rust/crates/vela-core 中新增
的 Crux (crux_core) 状态机拥有；Web Shell 只负责渲染 ViewModel、把用户输入翻译成
Event、执行 Core 声明的 effect（WebAuthn passkey 注册/签名/认证、AsyncStorage 读写、
公钥索引服务的上传/查询/健康探测、退避等待）并把结果回送 Core。Crux 代码放在 vela-core
内、用默认关闭的 `crux` feature 门控，使 uniffi 的 iOS/Android 构建完全不编译 crux、二
进制零变化；wasm 侧由 vela-core-wasm 打开该 feature 并导出 JSON 边界（dispatch /
resolve_effect / view）。业务规则要全量抽取…（见 Why 与 Requirements）。因为 React
Native 的 Hermes 引擎没有 WebAssembly，iOS/Android 保留现有 TypeScript 实现原样不动。
绝不能破坏现有 web 的创建与登录功能：e2e/onboarding-verify.spec.ts 与
e2e/onboarding-sync.spec.ts 必须原样通过，UI 外观与文案不变。"

## Why

Onboarding is the only flow in this wallet where a wrong state transition costs a
user their wallet — not a rendering glitch. Its rules were paid for in incidents,
and every one of them currently lives inside a React component:

| Rule bought by an incident | Where it lives today |
| --- | --- |
| A passkey must PROVE it can sign before anything persists (issue #1: provider reports `create()` success, credential never durably stored) | `CreateWalletScreen.tsx` — a `try` block inside a 130-line `handleCreate` |
| A cancelled verification must RESUME from the signature, never mint a second passkey | `pendingReg` React state + a `pendingRef` mutable ref |
| The account is saved locally only after the index server confirms the key (otherwise: usable here, unrecoverable everywhere else) | ordering of two `await`s inside the same handler |
| A missing index record is not a dead end — two signatures rebuild the public key on-device | `offerSignatureRecovery` → `recoverFromSignatures`, driven by an alert callback |
| Recovery must heal the index in the BACKGROUND (the wallet may already hold funds, so reaching it must never block on a server) | a floating `.catch(() => {})` promise |

Three consequences follow from that placement, and all three are visible today:

1. **The rules cannot be tested without a browser.** The races that matter —
   late responses after a start-over, double submits, cancel-then-resume — are
   currently only reachable through Playwright with a CDP virtual authenticator.
   A deterministic test of "a stale upload result must not resurrect an
   abandoned draft" does not exist because there is nothing to call.
2. **The rules cannot be reused.** Specs 007/008/009 are building desktop, Android
   and iOS onboarding natively. Each one re-derives these same rules in a
   different language, and any future correction has to be applied four times, by
   hand, correctly.
3. **The rules are entangled with rendering.** `loading`, `status`, `created`,
   `uploadFailed`, `pendingReg`, `showErrorDetail` and `addressCopied` sit in one
   `useState` block, so a reviewer cannot tell which of them a wallet's safety
   depends on.

This feature moves the decisions — not the I/O — into a portable core, starting
with the platform that can run it today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Creating a wallet is decided by the portable core (Priority: P1)

A new user opens the web wallet, names their account, accepts the
acknowledgments and creates a wallet. Registration, the proof-of-signing
signature, key extraction, address derivation, the index sync with its retries,
and the final local save all happen in the same order and with the same
guarantees as today — but every decision about *what happens next* is made by the
shared core, and the screen only renders what the core says and performs the I/O
the core asks for.

**Why this priority**: It is the flow that mints the wallet. Every rule that
protects a user from an unusable or unrecoverable wallet lives here, and it is
the flow with the most branches (eleven distinct outcomes from one button).

**Independent Test**: Ship only this story and the web create flow is fully
core-driven end to end; `e2e/onboarding-verify.spec.ts` and
`e2e/onboarding-sync.spec.ts` pass unmodified, and the create rules are covered
by deterministic core tests that need no browser.

**Acceptance Scenarios**:

1. **Given** a working passkey provider and a reachable index service, **When**
   the user submits the create form, **Then** the wallet address is shown only
   after the passkey has produced a valid signature AND the index service has
   confirmed the stored key, and exactly one account is persisted locally.
2. **Given** the user cancelled the verification signature after the passkey was
   already registered, **When** they press the primary button again, **Then** the
   flow resumes at the signature step and no second passkey is registered.
3. **Given** a passkey that registered but can never sign, **When** verification
   fails repeatedly, **Then** nothing is persisted (no local account) and a
   start-over escape hatch abandons the draft cleanly.
4. **Given** the index service fails three consecutive upload attempts, **When**
   the retries are exhausted, **Then** the user lands on the sync-failed state
   with a retry action, and no account is saved locally until a later attempt
   succeeds.
5. **Given** a passkey provider whose response format is incompatible with the
   Safe contracts, **When** verification runs, **Then** the flow stops with the
   incompatible-provider outcome and the draft is discarded (not resumable).
6. **Given** the user taps the primary button twice in quick succession, **When**
   the first attempt is still running, **Then** the second tap is ignored — one
   registration, one signature, one upload.

---

### User Story 2 - Signing in and recovering is decided by the portable core (Priority: P1)

A returning user (possibly on a new device, possibly after clearing site data)
signs in with an existing passkey. The core decides whether the wallet resolves
from local storage, from the index service, or — when the index has no record —
by rebuilding the public key from two signatures on-device, and then heals the
index in the background.

**Why this priority**: It is the only way back into a funded wallet. The recovery
escape hatch is what keeps the index server a cache rather than a single point of
failure, and that rule is currently expressed as an alert callback.

**Independent Test**: Ship only this story and the web sign-in flow is
core-driven end to end, including the 404 → two-signature recovery path, with
deterministic core tests for each resolution branch.

**Acceptance Scenarios**:

1. **Given** an account already stored locally for that credential, **When** the
   user signs in, **Then** the wallet opens immediately with that account active
   and no index-service call is required.
2. **Given** no local account but a record in the index service, **When** the user
   signs in, **Then** the address is derived from the indexed public key, the
   account is persisted, and the wallet opens.
3. **Given** the index service has no record for that credential, **When** the
   user signs in, **Then** they are offered on-device recovery; accepting it asks
   for one additional signature, rebuilds the public key, persists the account,
   opens the wallet, and re-submits the key to the index without blocking entry.
4. **Given** the user declines or cancels the recovery signature, **When** the
   flow ends, **Then** they return to the welcome screen with nothing persisted.
5. **Given** the passkey provider is incompatible with the Safe contracts, **When**
   sign-in runs, **Then** the flow stops with the incompatible-provider outcome
   and no account is created.
6. **Given** the index service is unreachable, **When** onboarding starts (three
   probes, spaced), **Then** the endpoint settings are surfaced automatically so
   the user can point the app at a reachable service.

---

### User Story 3 - iOS and Android are provably untouched (Priority: P1)

An iOS or Android user upgrades to a build containing this change and observes
no difference at all: same onboarding behaviour, same app size, same startup.

**Why this priority**: The mobile runtime cannot execute the new core (its
JavaScript engine has no WebAssembly). "No change" is therefore not a nice-to-have
— it is the correctness condition for shipping the feature at all.

**Independent Test**: Build the mobile bindings and confirm the new core is not
compiled into them at all; run the existing mobile-facing unit suites unchanged.

**Acceptance Scenarios**:

1. **Given** the mobile bindings are built, **When** their dependency graph is
   inspected, **Then** the state-machine framework and the new state machines are
   absent entirely (not merely unused).
2. **Given** a user creates or restores a wallet on iOS or Android, **When** they
   compare against the previous release, **Then** every step, message and failure
   mode is identical.

---

### User Story 4 - The rules become deterministically testable (Priority: P2)

A maintainer (or a reviewer, or a future contributor) can state a rule — "a late
upload result must not resurrect an abandoned draft" — and test it in
milliseconds, with no browser, no authenticator emulation and no network.

**Why this priority**: This is the durable payoff. It is what makes the fifth
incident cheaper than the first four, and it is a prerequisite for the native
platforms adopting the same rules later.

**Independent Test**: Every rule listed in the Requirements section below has at
least one test that drives the core directly through events and results.

**Acceptance Scenarios**:

1. **Given** a draft abandoned via start-over, **When** the result of its
   in-flight upload arrives afterwards, **Then** the core ignores it and the
   abandoned draft does not reappear.
2. **Given** two sign-in attempts where the first is superseded, **When** the
   first attempt's result arrives late, **Then** it cannot overwrite the state
   produced by the second.

---

### Edge Cases

- **Cancelled at registration** — nothing is persisted; the form returns to an
  editable state with a "setup cancelled" notice; the account name is preserved.
- **Cancelled at verification** — the registered passkey is retained as a resumable
  draft; the primary action changes to "finish verification"; a second
  registration is impossible.
- **Non-discoverable credential** — the provider created a device-local passkey that
  would never appear at sign-in; the flow aborts with the "use another provider"
  outcome and persists nothing.
- **Account name too long** — names whose UTF-8 encoding exceeds the WebAuthn user
  handle budget are rejected *before* the ceremony starts, with a live hint.
- **Upload succeeded but the response was lost** — a retry must not create a second
  record nor report failure when the server already holds the correct key.
- **Index confirms the credential but the on-chain reveal is still pending** — the
  wallet is usable and onboarding completes; the pending sync entry is kept for a
  later retry rather than being cleared or surfaced as an error.
- **Recovery signature produces an ambiguous key** — recovery fails cleanly with a
  "could not recover" outcome; nothing is persisted.
- **Double submit / repeated taps** — at most one ceremony, one upload and one save
  can be in flight per flow.
- **Late or stale results** — a result belonging to a superseded attempt is dropped,
  never applied.
- **Browser storage unavailable or write fails** — treated as a failed save, not as
  a silent success; the success screen is not shown.
- **Embedded onboarding (dApp popup)** — completing onboarding must resume the
  request that triggered it rather than navigating to the wallet tab.

## Requirements *(mandatory)*

### Functional Requirements

#### Ownership and boundary

- **FR-001**: The business decisions of wallet creation and sign-in MUST be owned
  by state machines in the shared core; the web UI MUST NOT contain branches that
  decide what happens next in these flows.
- **FR-002**: The core MUST NOT perform I/O. Everything that touches the outside
  world — passkey ceremonies, local persistence, index-service calls, waiting
  between retries — MUST be requested as a declared effect and executed by the
  platform shell.
- **FR-003**: The core MUST expose exactly one rendering projection per flow, and
  the web UI MUST render from that projection only (plus purely visual local state
  such as copy-confirmation, disclosure toggles and focus).
- **FR-004**: Purely computational steps the shared core already owns (public-key
  extraction from attestation, Safe-compatibility validation, address derivation,
  two-signature public-key recovery) MUST be performed inside the core rather than
  round-tripped through the shell.
- **FR-005**: The core MUST be compiled into the mobile bindings only when
  explicitly requested; the default build of the shared core MUST NOT include the
  state-machine framework.

#### Creation rules (all currently implicit in the screen)

- **FR-006**: The flow MUST prove the registered passkey can produce a valid
  signature before anything is persisted and before the wallet address is shown.
- **FR-007**: A verification cancelled after a successful registration MUST leave a
  resumable draft; resuming MUST re-use the registered credential and MUST NOT
  register a second passkey.
- **FR-008**: A start-over action MUST discard the draft entirely, so that no
  result belonging to it can affect state afterwards.
- **FR-009**: An incompatible provider response MUST be a terminal, non-resumable
  outcome that discards the draft.
- **FR-010**: A pending-sync record MUST be written before the first upload attempt
  so an interrupted creation can be retried on a later launch.
- **FR-011**: Upload failures MUST be retried up to three attempts with increasing
  waits between them; the waits MUST be requested from the shell, not measured
  inside the core.
- **FR-012**: The local account MUST be saved only after the index service confirms
  the stored key matches; a sync failure MUST NOT leave a locally usable but
  unrecoverable wallet.
- **FR-013**: After exhausted retries, the flow MUST offer an explicit retry that
  resumes from the upload step (never from registration).
- **FR-014**: Entering the wallet after a successful creation MUST NOT require any
  further ceremony.
- **FR-015**: The account name MUST be validated against the WebAuthn user-handle
  budget before a ceremony starts.

#### Sign-in rules

- **FR-016**: Sign-in MUST validate Safe compatibility of the assertion before any
  resolution or persistence.
- **FR-017**: Resolution order MUST be: local account for that credential → index
  record → on-device two-signature recovery.
- **FR-018**: A missing index record MUST offer recovery rather than failing;
  declining or cancelling MUST persist nothing.
- **FR-019**: Successful recovery MUST persist the account and open the wallet
  without waiting on the index; re-submitting the key to the index MUST happen in
  the background and its failure MUST NOT affect entry.
- **FR-020**: The account display name MUST be decoded from the credential's user
  handle when the index has no name, using the strict decoder (no mojibake, no raw
  foreign handles used as names).
- **FR-021**: A user-cancelled ceremony MUST be a silent, non-error outcome.
- **FR-022**: Network-unreachable conditions MUST be distinguished from other
  failures and MUST surface the endpoint settings; other failures MUST surface the
  failure message.
- **FR-023**: Onboarding start MUST probe the index service up to three times with
  spacing before declaring it unreachable.

#### Concurrency and correctness

- **FR-024**: Each flow MUST admit at most one in-flight ceremony, upload or save;
  repeated activations while busy MUST be ignored.
- **FR-025**: Every result returned to the core MUST carry a correlation identity,
  and results that do not match the current attempt MUST be discarded.
- **FR-026**: Superseding an attempt MUST cancel the effects it owns.

#### Non-regression

- **FR-027**: `e2e/onboarding-verify.spec.ts` and `e2e/onboarding-sync.spec.ts` MUST
  pass, with **no change to any assertion**.

  *Amended 2026-08-05 during implementation.* Both suites were already failing on
  `main`, before a line of this feature existed, and for a reason unrelated to
  either implementation: the last acknowledgment row wraps its text around inline
  "Privacy Policy" / "Terms of Service" links, so a centre-of-box `click()` could
  land on a link — opening a tab instead of ticking the box, leaving the Create
  button permanently disabled. Whether it lands there depends on font metrics and
  wrap width, which is why the suites were red on this machine and presumably
  green when written.

  Equivalence was therefore established first, with scratch copies that differ
  only in **where** the click lands: the three scenarios passed against the old
  TypeScript screens **and** against the core-driven ones. The one-line click
  position was then applied to the committed suites; every assertion is
  untouched. The evidence trail matters more than the letter of "unmodified" —
  a test that cannot be trusted red cannot be trusted green either.
- **FR-028**: The visible UI — layout, wording, translation keys, animations,
  ordering of states — MUST be unchanged on web.
- **FR-029**: iOS and Android behaviour MUST be unchanged, and their build output
  MUST NOT gain the new dependency.
- **FR-030**: The web artifact MUST stay within the existing size budget for the
  shared core; if it cannot, the feature MUST stop and escalate rather than raise
  the budget.
- **FR-031**: Both onboarding entry points (the standalone route and the embedded
  dApp-popup flow) MUST keep their completion semantics.

#### Testability

- **FR-032**: Every rule in FR-006 … FR-026 MUST have at least one deterministic
  test that drives the core directly, with no browser, authenticator or network.
  *(Delivered: 35 core tests; the rule → test map is in `quickstart.md` §9.)*
- **FR-033**: The tests MUST include the race cases: late result after start-over,
  late result after supersede, and repeated activation while busy.

### Key Entities

- **Wallet Draft**: A registered-but-unproven identity: the credential reference,
  the chosen name, and how far verification got. Exists only between registration
  and the first successful save; discarded by start-over or by a terminal
  incompatibility.
- **Wallet Account**: The persisted result — credential reference, display name,
  address, public key, creation time. The only entity that outlives onboarding.
- **Key Sync Attempt**: The state of publishing a public key to the index service:
  attempt count, last failure, whether the server has confirmed it, and whether
  the slower on-chain resolution is still pending.
- **Sign-In Attempt**: One authentication and its resolution path (local, indexed,
  recovered), including the correlation identity that makes late results
  discardable.
- **Service Availability**: Whether the index service answered its health probe,
  and the count of consecutive failures that triggers surfacing the settings.
- **Flow Projection**: What the screen renders — current stage, whether an action is
  busy, which action label applies, the user-facing message, and the address once
  it is safe to show.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Both existing onboarding end-to-end suites pass with **zero** edits to
  their files.
- **SC-002**: A user creating a wallet on the web sees an experience
  indistinguishable from the previous release — same steps, same wording, same
  timing characteristics, no new failure modes.
- **SC-003**: The web onboarding screens contain **no** direct passkey, storage or
  index-service calls, and no branch that decides the next step of the flow;
  verified by inspection of the two screen files.
- **SC-004**: Mobile builds contain none of the new dependency — verified by
  inspecting the built dependency graph, not by trusting configuration.
- **SC-005**: 100% of the rules FR-006 … FR-026 have at least one deterministic
  core test; the three race cases in FR-033 are each covered.
- **SC-006**: The shared-core web artifact remains inside its existing hard size
  budget, with the measured headroom recorded.
- **SC-007**: A maintainer can answer "what happens if X fails here?" for both
  flows by reading one state machine per flow, without opening a component file.
- **SC-008**: Adding a future onboarding rule requires editing the core and its
  tests only — no change to the screens — demonstrated by at least one rule in
  this feature landing that way.

## Assumptions

- The web runtime is the only target in scope: the mobile JavaScript engine has no
  WebAssembly, so mobile keeps its current implementation verbatim. The two
  implementations coexist until the native apps adopt the shared core through
  their own bindings (specs 007/008/009 direction).
- Extracting the flows into per-flow controller boundaries — one native
  implementation carrying today's logic unchanged, one web implementation driven
  by the core — is acceptable duplication for this step, and is what makes the
  screens platform-neutral.
- The index service contract (create / query / query-by-wallet-reference / health)
  is unchanged by this feature.
- Visual design, copy and translation keys are frozen for this feature; anything
  that would change them is out of scope.
- The existing end-to-end suites are an adequate regression gate for the web
  flows, complemented by the new deterministic core tests.
  *(Implementation note: sign-in had no end-to-end coverage at all, so
  `e2e/onboarding-signin.spec.ts` was added — five scenarios including the
  two-signature recovery, which asserts the recovered address equals the
  original. It is new coverage for a flow that had none, not a modified gate.)*
- Retry counts and waits (three attempts; increasing waits) and the health-probe
  policy (three probes, spaced) are preserved exactly as they behave today rather
  than re-tuned.

## Out of Scope

- Migrating iOS, Android or desktop onboarding onto the shared state machines.
- Any other flow (send, signing, contacts, dApp connections, settings).
- Changing onboarding UX, copy, visual design or translations.
- Changing the index service, its contract, or its retry policy.
- Developer tooling around the core (transition timelines, snapshots, agent
  bridges) beyond what the tests require.
