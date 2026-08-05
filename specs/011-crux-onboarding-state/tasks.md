---

description: "Task list for 011-crux-onboarding-state"
---

# Tasks: Crux-Owned Onboarding State (Create + Sign In)

**Input**: Design documents from `/specs/011-crux-onboarding-state/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/onboarding-core.md](./contracts/onboarding-core.md), [quickstart.md](./quickstart.md)

**Tests**: Required. FR-032 and FR-033 make deterministic core tests part of the feature, not an option.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = create flow, US2 = sign-in flow, US3 = native untouched, US4 = testability

## Path Conventions

Rust core: `rust/crates/vela-core/`, wasm bridge: `rust/crates/vela-core-wasm/`,
app: `src/` (Expo). Absolute repo root: `/Volumes/data/production/vela-wallet`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Get the gated feature compiling and prove the size budget holds before writing any state machine.

- [X] T001 Add the optional dependency and feature gate in `rust/crates/vela-core/Cargo.toml`: `crux_core = { version = "0.19", optional = true }`, `[features] crux = ["dep:crux_core"]`, keeping `default = []` untouched; add `crux_core = "0.19"` to `[workspace.dependencies]` in `rust/Cargo.toml` and reference it with `workspace = true`
- [X] T002 Create the module skeleton `rust/crates/vela-core/src/app/mod.rs` (doc comment stating the Core/Shell boundary and that this module declares effects but never performs I/O) and gate it from `rust/crates/vela-core/src/lib.rs` with `#[cfg(feature = "crux")] pub mod app;`
- [X] T003 Enable the feature for web only: `rust/crates/vela-core-wasm/Cargo.toml` → `vela-core = { workspace = true, features = ["crux"] }`; leave `rust/crates/vela-core-uniffi/Cargo.toml` unchanged
- [X] T004 Verify the gate compiles both ways from `rust/`: `cargo check -p vela-core` (no feature) and `cargo check -p vela-core --features crux`
- [X] T005 **Size gate proof** — run `npm run build:wasm` at repo root, record the printed wasm byte count in `specs/011-crux-onboarding-state/research.md` under D1 as "measured with framework linked". **If it exceeds 1,000,000, STOP: do not raise `MAX_WASM_BYTES`; report the number and the trimming options (FR-030)**
- [X] T006 [P] Add npm scripts in `package.json`: `test:core` → `cd rust && cargo test -p vela-core --features crux`, and `gen:onboarding-types` → `node rust/scripts/gen-onboarding-types.mjs` (script itself lands in T041)

**Checkpoint**: Feature gate exists, both build modes are green, the budget is proven.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared vocabulary both machines speak. Nothing story-specific.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 Define the shared value types in `rust/crates/vela-core/src/app/mod.rs`: `Assertion`, `Registration`, `Account`, `PendingUpload`, `FailureKind`, `StatusKey`, `PromptKind` exactly as specified in [data-model.md](./data-model.md) §"Shared value types", all `#[serde(tag = "type", rename_all = "snake_case")]` where they are enums
- [X] T008 Define the shell vocabulary in `rust/crates/vela-core/src/app/shell.rs`: the `Operation` enum (15 variants) and `ShellResult` enum per [contracts/onboarding-core.md](./contracts/onboarding-core.md) §3 and §4, plus `impl crux_core::capability::Operation for Operation { type Output = ShellResult; }`
- [X] T009 Add the shared `#[effect] pub enum Effect { Render(RenderOperation), Shell(Operation) }` in `rust/crates/vela-core/src/app/shell.rs`; if the macro expansion trips the crate's `deny(clippy::unwrap_used | expect_used | panic)` lints, add a narrowly-scoped `#[allow]` **on the generated item only** and comment why (research.md landmine 2)
- [X] T010 Add a test-only builder module `rust/crates/vela-core/tests/support/mod.rs` with constructors for a fake `Registration`, `Assertion` (real fixture bytes lifted from `rust/crates/vela-core/tests/vectors/webauthn.json` so key extraction and recovery run for real), and `Account`

**Checkpoint**: `cargo test -p vela-core --features crux` compiles with zero tests.

---

## Phase 3: User Story 1 — Creating a wallet is decided by the portable core (P1) 🎯 MVP

**Goal**: The web create flow is fully core-driven: register → prove signing → derive → pending record → sync with retries → save → enter, plus resume, start-over, retry-upload.

**Independent test**: `npx playwright test onboarding-verify` and `onboarding-sync` pass with zero edits to those specs, and `cargo test -p vela-core --features crux` covers every create rule.

### Core machine (US1)

- [X] T011 [US1] Create `rust/crates/vela-core/src/app/create_wallet.rs` with `Model` (name, acks, draft, prepared, sync, stage, status, attempt), `Stage`, `Draft`, `Prepared`, `SyncState` and `Event` per [data-model.md](./data-model.md) §"Machine A"
- [X] T012 [US1] Implement `view(&Model) -> CreateView` in `rust/crates/vela-core/src/app/create_wallet.rs` producing every field in [contracts/onboarding-core.md](./contracts/onboarding-core.md) §5, including `can_submit` (name non-empty ∧ not too long ∧ all acks ∧ not busy, or a draft is present), `submit_label`, `show_start_over`, and `address` exposed **only** in `Created`
- [X] T013 [US1] Implement the form events (`name_changed`, `ack_toggled`, `go_back`) and the UTF-8 user-handle length rule (27 bytes, mirroring `Passkey.MAX_USER_NAME_BYTES`) in `rust/crates/vela-core/src/app/create_wallet.rs` (FR-015)
- [X] T014 [US1] Implement `submit` → `CheckPasskeySupport` → `RegisterPasskey`, including the busy guard that makes a repeat `submit` a no-op (FR-024) and the `attempt` bump per user-initiated start (FR-025), in `rust/crates/vela-core/src/app/create_wallet.rs`
- [X] T015 [US1] Implement registration outcomes in `rust/crates/vela-core/src/app/create_wallet.rs`: success → store `Draft` (with `registered_at_iso` from the result) → `SignProof{purpose: verify}`; `cancelled` → `Form` + `StatusKey::SetupCancelled`; `not_discoverable` → `Prompt` + discard, persisting nothing (FR-006, FR-007)
- [X] T016 [US1] Implement the verification step in `rust/crates/vela-core/src/app/create_wallet.rs`: on `proof_signed`, call `vela_core::webauthn::validate_client_data` for Safe compatibility; incompatible → terminal `Prompt{incompatible_create}` and **discard the draft** (FR-009); cancelled → back to `Form` **keeping** the draft and setting `StatusKey::VerifyCancelled` (FR-007)
- [X] T017 [US1] Implement derivation in `rust/crates/vela-core/src/app/create_wallet.rs` using `webauthn::extract_attestation_public_key` + `safe::compute_safe_address`, producing `Prepared { public_key_hex: "04"+x+y, address, created_at_iso }`; a failure to extract is a `Prompt{create_failed}` with nothing persisted (FR-004)
- [X] T018 [US1] Implement `SavePendingUpload` before the first upload attempt, and the storage-failure branch, in `rust/crates/vela-core/src/app/create_wallet.rs` (FR-010)
- [X] T019 [US1] Implement the index sync decision table in `rust/crates/vela-core/src/app/create_wallet.rs` exactly as tabulated in [data-model.md](./data-model.md) §"Index-upload decision table": create → query → key-match, with `create` failure forgiven when `query` confirms, and a key mismatch treated as a hard failure (FR-012)
- [X] T020 [US1] Implement the retry policy in `rust/crates/vela-core/src/app/create_wallet.rs`: up to 3 attempts, each retry preceded by `Wait{ms}` (1000 then 2000, matching today's `1000 * attempt`), exhaustion → `SyncFailed` carrying the last error detail (FR-011)
- [X] T021 [US1] Implement the wallet-reference step and save in `rust/crates/vela-core/src/app/create_wallet.rs`: `IndexQueryByWalletRef` → resolved ⇒ `RemovePendingUpload`; unresolved or failed ⇒ keep pending; then `SaveAccount` and only then `Created` (FR-012, issue #89 rule)
- [X] T022 [US1] Implement `retry_upload` (resumes at the upload step, never registration) and `start_over` (clears draft/prepared/sync, bumps `attempt`) in `rust/crates/vela-core/src/app/create_wallet.rs` (FR-008, FR-013)
- [X] T023 [US1] Implement `enter_wallet` → `CompleteOnboarding{ mode: add_account }` with no further ceremony, in `rust/crates/vela-core/src/app/create_wallet.rs` (FR-014)
- [X] T024 [US1] Implement stale-result rejection in `rust/crates/vela-core/src/app/create_wallet.rs`: every `shell_completed` carrying an `attempt` that differs from the model's is dropped without a state change (FR-025), and superseding a start cancels the effects it owns (FR-026)

### Core tests (US1)

- [X] T025 [P] [US1] Tests for the form rules in `rust/crates/vela-core/tests/app_create_wallet.rs`: `can_submit` requires all acks, a too-long CJK name is rejected before any effect is requested, name is not editable while busy
- [X] T026 [P] [US1] Tests for registration/verification outcomes in `rust/crates/vela-core/tests/app_create_wallet.rs`: cancel-at-register persists nothing; cancel-at-verify keeps the draft and the next `submit` requests `SignProof`, **never** `RegisterPasskey`; non-discoverable persists nothing; incompatible discards the draft
- [X] T027 [P] [US1] Tests for the sync decision table in `rust/crates/vela-core/tests/app_create_wallet.rs` — one test per row of the table in data-model.md, including "create failed but query confirms ⇒ success" and "key mismatch ⇒ failure"
- [X] T028 [P] [US1] Tests for retry and exhaustion in `rust/crates/vela-core/tests/app_create_wallet.rs`: exactly three attempts, a `Wait` between each, `SyncFailed` carries the last error, and `retry_upload` re-enters at the upload step
- [X] T029 [P] [US1] Tests for the persistence ordering invariant in `rust/crates/vela-core/tests/app_create_wallet.rs`: no `SaveAccount` is ever requested before a confirmed index record, and `view().address` is `None` in every stage except `Created`
- [X] T030 [P] [US1] Race tests in `rust/crates/vela-core/tests/app_create_wallet.rs`: `late_upload_result_after_start_over_is_ignored`, `submit_while_busy_is_a_no_op` (FR-033)

### wasm bridge (US1)

- [X] T031 [US1] Create `rust/crates/vela-core-wasm/src/onboarding.rs` with `CreateWalletCore` (`new`, `dispatch`, `resolve_effect`, `view`, `free`) following the `DashboardCore` shape in `/Volumes/data/production/crux-demo/rust/src/dashboard.rs`: a `HashMap<u64, Request<Operation>>` of pending effects, monotonic effect ids, and a `DispatchResult { view, effects, cancelled_effect_ids }` JSON payload
- [X] T032 [US1] Register the module from `rust/crates/vela-core-wasm/src/lib.rs` and confirm the generated `rust/pkg-web/vela_core.d.ts` exposes the class after `npm run build:wasm`

### Web shell (US1)

- [X] T033 [P] [US1] Port the effect loop to `src/services/crux/effect-loop.ts` from `/Volumes/data/production/crux-demo/svelte-app/src/lib/core/effect-loop.ts`, **trimmed** per research.md D9: keep start/dispatch/resolve, `AbortController` per effect, `cancelled_effect_ids` handling, `toFailure`, `dispose`; drop devtools transitions, origins and pending-by-origin
- [X] T034 [P] [US1] Port `src/services/crux/json-wasm-shell.ts` from the demo's `json-wasm-shell.ts`, without the `debug_snapshot` hook
- [X] T035 [US1] Create `src/services/onboarding-core/session.web.ts`: import `@/services/vela-core` first (its module side effect runs `initSync`), then construct `CreateWalletCore` from `rust/pkg-web/vela_core.js`; export `createCreateWalletSession(options)` returning the effect-loop handle
- [X] T036 [US1] Create the native counterpart `src/services/onboarding-core/session.ts` exporting the same names, each throwing `new Error('onboarding-core session is web-only (Hermes has no WebAssembly)')` (research.md D11 type-resolution constraint)
- [X] T037 [US1] Create `src/services/onboarding-core/executor.web.ts` mapping every create-flow `Operation` to the existing services exactly as tabulated in [contracts/onboarding-core.md](./contracts/onboarding-core.md) §3 — `Passkey.register/sign/isSupported`, `saveAccount`, `savePendingUpload`, `removePendingUpload`, `PublicKeyIndex.createRecord/queryRecord/queryByWalletRef`, `setTimeout`, `showAlert` — and converting every rejection into the operation's own failure result (never throwing into the loop)
- [X] T038 [US1] Create `src/services/onboarding-core/copy.ts` with exhaustive `switch` mappings (with a `never` fallback) from `StatusKey`, `PromptKind` and `submit_label` to the existing `onboarding.*` i18n keys per [contracts/onboarding-core.md](./contracts/onboarding-core.md) §6 (FR-028)
- [X] T039 [US1] Create `src/hooks/onboarding-controller-types.ts` declaring the shape both platform implementations of both controllers must return
- [X] T040 [US1] Create `src/hooks/use-create-wallet.web.ts`: build the session once per mount, hold the view in `useState`, dispose (`free()`) on unmount including React 19 StrictMode double-mount, and expose the controller shape (research.md D9)

### Bindings + drift gate (US1, shared with US2)

- [X] T041 [US1] Add `ts-rs` as an optional dependency behind a `bindings` feature in `rust/crates/vela-core/Cargo.toml`, annotate the wire types (`Event`, `Operation`, `ShellResult`, `CreateView`, `LoginView` and their payload types) with `#[cfg_attr(feature = "bindings", derive(TS), ts(export))]`, and add `rust/crates/vela-core/src/bin/generate_onboarding_bindings.rs` (`required-features = ["bindings", "crux"]`)
- [X] T042 [US1] Add `rust/scripts/gen-onboarding-types.mjs` that runs the generator into `src/services/onboarding-core/generated/` and supports `--check` (non-zero on drift, naming the files), mirroring the style of `rust/scripts/build-web.mjs`; commit the generated output

### Native path move (US1)

- [X] T043 [US1] Create `src/hooks/use-create-wallet.ts` (native) by **moving** today's `handleCreate` / `handleRetryUpload` / `handleStartOver` / `handleEnter` logic and its `useState` block out of `src/screens/onboarding/CreateWalletScreen.tsx` verbatim, returning the shape from `onboarding-controller-types.ts` — behaviour must not change (US3)

### Screen re-point (US1)

- [X] T044 [US1] Rewrite `src/screens/onboarding/CreateWalletScreen.tsx` to render only: consume `useCreateWallet()`, keep every existing style, animation, i18n key and DOM ordering, and remove all direct `Passkey`, `storage`, `public-key-*` and `vela-core` imports (SC-003)
- [X] T045 [US1] Run `npx playwright test onboarding-verify && npx playwright test onboarding-sync`; both must pass and `git diff --stat e2e/` must be empty for those two files (FR-027)

**Checkpoint**: The web create flow is core-driven end to end and the existing e2e gate is green. This alone is a shippable MVP.

---

## Phase 4: User Story 2 — Signing in and recovering is decided by the portable core (P1)

**Goal**: Sign-in resolution (local → index → two-signature recovery), background index heal, and the endpoint health probe all move into the core.

**Independent test**: `cargo test -p vela-core --features crux` covers each resolution branch; the manual matrix in [quickstart.md](./quickstart.md) §7 passes on web.

### Core machine (US2)

- [X] T046 [US2] Create `rust/crates/vela-core/src/app/login.rs` with `Model` (stage, assertion, attempt, health), `Stage`, `Health` and `Event` per [data-model.md](./data-model.md) §"Machine B", plus `view(&Model) -> LoginView { busy, endpoint_unreachable }`
- [X] T047 [US2] Implement the health sub-machine in `rust/crates/vela-core/src/app/login.rs`: on `start`, `ProbeIndexHealth` up to 3 times with `Wait{2000}` between failures; three failures ⇒ `endpoint_unreachable = true`; a success at any point ends the probing silently (FR-023)
- [X] T048 [US2] Implement `sign_in` → `CheckPasskeySupport` → `AuthenticatePasskey`, the busy guard, and the `attempt` bump, in `rust/crates/vela-core/src/app/login.rs` (FR-024, FR-025)
- [X] T049 [US2] Implement the compatibility check before any resolution in `rust/crates/vela-core/src/app/login.rs` via `webauthn::validate_client_data`; incompatible ⇒ `Prompt{incompatible_login}` and stop (FR-016)
- [X] T050 [US2] Implement local resolution in `rust/crates/vela-core/src/app/login.rs`: `LoadAccounts` → match on credential id → `CompleteOnboarding{ mode: set_wallet{accounts, active_index} }` with no index call (FR-017)
- [X] T051 [US2] Implement index resolution in `rust/crates/vela-core/src/app/login.rs`: `IndexQueryRecord` → record ⇒ derive address from the indexed key, name from the record or the strict user-handle decode, `SaveAccount`, `CompleteOnboarding{ mode: add_account }` (FR-017, FR-020)
- [X] T052 [US2] Implement the missing-record branch in `rust/crates/vela-core/src/app/login.rs`: `index_missing` ⇒ `Prompt{recover_offer, confirmable}`; declined ⇒ back to idle with nothing persisted; `index_failed{network:true}` ⇒ `endpoint_unreachable = true` **without** offering recovery (FR-018, FR-022)
- [X] T053 [US2] Implement two-signature recovery in `rust/crates/vela-core/src/app/login.rs`: `SignProof{recover_second}` → `webauthn::recover_public_key_from_assertions` over both assertions → `None` ⇒ `Prompt{recover_failed}` with nothing persisted; `Some` ⇒ derive address, `SaveAccount`, complete, and fire `IndexCreateRecord` as a background heal whose result cannot change the stage (FR-018, FR-019)
- [X] T054 [US2] Implement the failure classification in `rust/crates/vela-core/src/app/login.rs`: `cancelled` is silent, `network` surfaces the endpoint settings, everything else surfaces `Prompt{sign_in_failed{detail}}` (FR-021, FR-022)

### Core tests (US2)

- [X] T055 [P] [US2] Tests for the health probe in `rust/crates/vela-core/tests/app_login.rs`: 3 probes with waits before `endpoint_unreachable`, and a success on probe 2 leaves it false
- [X] T056 [P] [US2] Tests for the resolution order in `rust/crates/vela-core/tests/app_login.rs`: local hit requests no index call; index hit persists and completes; the order local → index → recovery is enforced
- [X] T057 [P] [US2] Tests for recovery in `rust/crates/vela-core/tests/app_login.rs`: 404 offers recovery; decline persists nothing; accept requests a second signature; an unrecoverable pair ends in `recover_failed`; a successful recovery completes **before** the heal result arrives and a failed heal does not change the stage
- [X] T058 [P] [US2] Tests for failure classification in `rust/crates/vela-core/tests/app_login.rs`: cancelled produces no prompt; a transport failure sets `endpoint_unreachable` and does **not** offer recovery
- [X] T059 [P] [US2] Race test in `rust/crates/vela-core/tests/app_login.rs`: `late_index_result_after_supersede_cannot_overwrite` (FR-033)

### wasm bridge + shell (US2)

- [X] T060 [US2] Add `LoginCore` to `rust/crates/vela-core-wasm/src/onboarding.rs` with the same four-method surface
- [X] T061 [US2] Extend `src/services/onboarding-core/session.web.ts` (and the throwing `session.ts`) with `createLoginSession`
- [X] T062 [US2] Extend `src/services/onboarding-core/executor.web.ts` with the login-only operations: `authenticate_passkey`, `load_accounts`, `probe_index_health` (8 s abort and the `service`/`status` identity check, unchanged from today), and the `set_wallet` completion mode
- [X] T063 [US2] Extend `src/services/onboarding-core/copy.ts` with the login prompt keys, keeping the `never` fallback exhaustive
- [X] T064 [US2] Create `src/hooks/use-onboarding-login.web.ts` following the same lifecycle rules as T040
- [X] T065 [US2] Create `src/hooks/use-onboarding-login.ts` (native) by **moving** today's `handleLogin` / `offerSignatureRecovery` / `recoverFromSignatures` / health-check effect out of `src/screens/onboarding/OnboardingScreen.tsx` verbatim (US3)
- [X] T066 [US2] Rewrite `src/screens/onboarding/OnboardingScreen.tsx` to render only: step switching, the settings modal's open/close (pure UI), and props sourced from `useOnboardingLogin()`; keep `WelcomeScreen`'s props and `src/app/web-request.tsx`'s `onComplete` semantics intact (FR-031)
- [X] T067 [US2] ~~Walk the manual matrix~~ → delivered as automation instead: `e2e/onboarding-signin.spec.ts`, five scenarios, all green (see quickstart §7)

**Checkpoint**: Both onboarding flows are core-driven on web.

---

## Phase 5: User Story 3 — iOS and Android are provably untouched (P1)

**Goal**: Prove, not assert, that mobile gained nothing.

- [X] T068 [P] [US3] From `rust/`, assert `cargo tree -p vela-core-uniffi | grep -c crux` is `0` and `cargo tree -p vela-core-wasm | grep -c crux` is non-zero; record both outputs in the PR description (SC-004)
- [X] T069 [P] [US3] Review `git diff main -- src/hooks/use-create-wallet.ts src/hooks/use-onboarding-login.ts` and confirm the native controllers are a **relocation** of today's logic — any behavioural delta must be justified in review or reverted
- [X] T070 [P] [US3] Run `npx jest src/__tests__/modules/passkey.test.ts` and the rest of `npm run test:unit`; no native-facing suite may change
- [ ] T071 [US3] *(open, optional)* Pre-release device pass: create a wallet and sign in once on the Xiaomi test device (`adb -s 9d5f42fb`), confirming behaviour matches `main`

---

## Phase 6: User Story 4 — The rules become deterministically testable (P2)

**Goal**: Make the coverage claim checkable rather than believed.

- [X] T072 [US4] Add a coverage matrix to `specs/011-crux-onboarding-state/quickstart.md` mapping each rule FR-006 … FR-026 to the test function that pins it; any unmapped rule is a missing test (FR-032, SC-005)
- [X] T073 [P] [US4] Add `#[test]` documentation comments naming the rule each test enforces in `rust/crates/vela-core/tests/app_create_wallet.rs` and `app_login.rs`, so a failing test names the broken rule rather than a stage transition
- [X] T074 [US4] Demonstrate SC-008: land one rule of this feature by editing the core and its tests only, with no screen change, and note which one in the PR description

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T075 Regenerate and commit the web artifact: `npm run build:wasm`, then `node rust/scripts/build-web.mjs --check` and `npm run verify:wasm` must both pass; record the final byte count against the 1,000,000 ceiling (SC-006)
- [X] T076 [P] Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `cd rust && cargo clippy -p vela-core --features crux --all-targets -- -D warnings` — all green
- [X] T077 [P] Run `npm run gen:onboarding-types -- --check`; committed TypeScript must match a fresh generation
- [X] T078 [P] Document the boundary in `rust/README.md`: what belongs in `app/` versus the pure kernels, and the rule that the core declares effects but never performs I/O
- [X] T079 Add a short note at the top of `src/services/public-key-upload.ts` pointing at the decision table in `specs/011-crux-onboarding-state/data-model.md`, so the two implementations stay reconcilable until native adopts the core (research.md D10)
- [X] T080 Final gate sweep: re-run both Playwright onboarding suites, confirm `git diff --stat e2e/` is empty for them, and confirm `git status` shows `rust/pkg-web/` and `src/services/onboarding-core/generated/` committed

---

## Dependencies & Execution Order

```text
Phase 1 (T001–T006)  ──►  Phase 2 (T007–T010)  ──►  Phase 3 (US1)  ──►  Phase 4 (US2)
                                                          │                  │
                                                          └──────┬───────────┘
                                                                 ▼
                                                     Phase 5 (US3) + Phase 6 (US4)
                                                                 ▼
                                                          Phase 7 (Polish)
```

- **US2 depends on US1** only for shared plumbing (T031–T042). The `login.rs`
  machine and its tests (T046–T059) can be written in parallel with US1's shell
  work by a second worker.
- **US3 and US4** are verification phases: they can start as soon as the code they
  inspect exists, and T068/T070 can run at any point after Phase 1.
- **T005 is a hard gate.** If the wasm exceeds the ceiling, everything downstream
  waits on a decision (FR-030).

### Parallel opportunities

| Batch | Tasks | Why safe |
| --- | --- | --- |
| Core tests US1 | T025, T026, T027, T028, T029, T030 | Same file, disjoint test functions — write together, one commit |
| Shell plumbing | T033, T034 | Two new files, no shared symbol |
| Core tests US2 | T055, T056, T057, T058, T059 | Same as above |
| Verification | T068, T069, T070 | Read-only |
| Polish | T076, T077, T078 | Independent commands/files |

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** At that point the create flow — the
one that mints wallets and carries every incident-bought rule — is owned by the
portable core, the existing e2e gate proves nothing broke, and native is
untouched. Sign-in can follow in a second increment without holding the first.

**Order within each machine**: model and stages first, then transitions in flow
order, then tests. Do not start the shell until `cargo test` is green — the whole
point of the boundary is that the rules can be finished and proven before a
single line of UI is touched.

**Stop conditions** (escalate rather than work around):

1. `npm run build:wasm` reports over 1,000,000 bytes (T005, T075)
2. Either Playwright onboarding suite needs an edit to pass (T045, T080)
3. The `#[effect]` macro forces widening a crate-level lint in `vela-core` (T009)
