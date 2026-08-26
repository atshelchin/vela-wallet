# Tasks: Live Onboarding — Create & Sign In Wired to the Core, in the v2 Flow

**Input**: Design documents from `/specs/019-onboarding-live-wiring/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The spec does not request TDD. Test tasks appear only where a gate already
exists (the core's ~88 crux tests, the new CTAP vectors, each client's suite) — these are
regression obligations, not new test-first work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: `US1` create · `US2` sign-in · `US3` session · `US4` key-set safety ·
  `US5` failures · `US6` gallery
- Markers: `- [ ]` todo · `- [X]` done · `- [~]` partial or blocked, with the reason inline

## Deviation from the template: phases are keyed by platform, not by user story

The template asks for one phase per user story. That does not describe this feature and
would produce a plan nobody could execute, for a concrete reason: **all six stories land on
each client at the same moment**. US1 and US2 share one executor; US4 is the same screen as
US1; US3 is the exit both machines take. There is no way to ship "US1 on all four clients"
and then "US2 on all four clients" — the second would be finished before the first was
testable.

The deliverable increment is therefore **one client**, and the phases follow the platform
order in plan.md. Every task still carries its `[Story]` label, and the table below is the
story-to-phase map the template's structure is meant to give you. This mirrors spec 018,
which made the same call for the same reason.

| Story | Where it completes |
| --- | --- |
| US1 create (P1) | Phase 3 (web) · 5 (desktop) · 7 (Android) · 8 (iOS) |
| US2 sign-in (P1) | same four |
| US3 session (P1) | same four |
| US4 key-set safety (P2) | same four |
| US5 failures (P2) | same four |
| US6 gallery (P3) | same four |

**MVP = Phases 1–3.** One client creating, entering and re-entering a real wallet proves
the whole shape; every later phase is the same shape in another language.

---

## Phase 1: Setup

**Purpose**: get the baselines on record before anything changes, so every "did this grow?"
question later has an answer.

- [X] T001 Commit `design/onboarding-new/` to git on branch `019-onboarding-live-wiring` (done: commit `31ad4b04`)
- [X] T002 Record baseline artifact sizes in `specs/019-onboarding-live-wiring/results.md`: `app-android/vela-wallet/app/src/main/jniLibs/arm64-v8a/libvela_core_uniffi.so`, `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework` (`du -sh`), `public/vela_core_bg.*.wasm`
- [X] T003 [P] Record baseline corpus counts in the same file: `onboarding` namespace leaves (163), corpus leaves (1,184), and the SC-005 residency figure from `cargo test -p vela-core --features i18n-all --test i18n_residency -- --nocapture`
- [X] T004 Confirm the tree is green before touching it: `cd rust && cargo test --workspace --features vela-core/i18n-all && cargo clippy --workspace --all-targets --features vela-core/i18n-all -- -D warnings`, plus `npx tsc --noEmit && npx jest` at the repo root

---

## Phase 2: Foundational — the core, and everything the core change breaks

**⚠️ CRITICAL**: no client phase may begin until this one is complete and every shell still
builds. The two core changes are breaking; leaving them half-applied means the production
web wallet cannot create a wallet.

**Checkpoint**: the whole repository — including `src/`, the shipping Expo client — builds,
lints and tests green, and `npm run web` can still create a wallet.

### The two core changes

- [X] T010 Add `pub enum KeyMethod { Platform, Hybrid, SecurityKey }` (`serde` `snake_case`, `TS` under the `bindings` feature) to `rust/crates/vela-core/src/app/mod.rs`, beside `FailureKind` — see [data-model.md §1](./data-model.md)
- [X] T011 Add `method: KeyMethod` to `ShellOperation::RegisterPasskey` in `rust/crates/vela-core/src/app/shell.rs`, documenting that it is what the *person chose*, distinct from what the authenticator reports
- [X] T012 Add `method` to `Event::AddKey`, add `registering_method` to `Model`, and carry it onto the resulting `Draft` and `CreateKeyRow` in `rust/crates/vela-core/src/app/create_wallet.rs`; `Event::Submit` uses the client-supplied default for the first key
- [X] T013 Change `ACK_COUNT` from 4 to 2 in `rust/crates/vela-core/src/app/create_wallet.rs` and adjust `Model.acks` / `CreateView.acks`
- [X] T014 Update `rust/crates/vela-core/tests/app_create_wallet.rs` for both changes — every ack-array construction, and the `add_key` cases which now carry a method; the assertions themselves must not be weakened
- [X] T015 Run the core gate: `cd rust && cargo test -p vela-core --features crux,i18n-all && cargo clippy --workspace --all-targets --features vela-core/i18n-all -- -D warnings && cargo fmt --check`

### The corpus

- [X] T016 Apply [contracts/i18n-keys.md](./contracts/i18n-keys.md) §1–§3 (6 removed, 4 renamed, 15 rewritten) to `rust/crates/vela-core/i18n/locales/<lng>/onboarding.json` for all 15 locales
- [X] T017 Apply [contracts/i18n-keys.md](./contracts/i18n-keys.md) §4 (32 added) to the same 15 files; `zh` takes the design's own copy verbatim, `en` takes the contract's, the other 13 follow the machine-translation-pending-human-review precedent
- [X] T018 Regenerate and verify: `npm run gen:i18n && npm run lint:i18n && npm run verify:i18n && npm run dump:vectors`
- [X] T019 Update the leaf/path count pins in the root Jest suite to the new figures (expected: `onboarding` 189, corpus 1,210) and run `npx jest`
- [X] T020 Re-measure `rust/crates/vela-core/tests/i18n_residency.rs` and confirm `ja` + `en` still fit the 135,345-byte SC-005 budget; update the recorded figures in the test's comments if they moved

### Regenerating the committed artifacts

- [X] T021 `npm run gen:core-types` — `src/services/onboarding-core/generated/` gains `KeyMethod.ts` and the changed `CreateWalletEvent` / `ShellOperation` / `CreateKeyRow`; commit the output, never hand-edit it
- [X] T022 `npm run build:wasm && npm run verify:wasm` — commit the regenerated `rust/pkg-web/` and the newly fingerprinted `public/vela_core_bg.<hash>.wasm`, and delete the superseded one

### The fifth shell — lockstep (FR-030, SC-010)

- [X] T023 [US1] Update `src/screens/onboarding/CreateWalletScreen.tsx` from four acknowledgement rows to two, using the rewritten `ack0`/`ack1` and the renamed `ack1*` link fragments
- [X] T024 [US1] Update `src/services/onboarding-core/executor.ts` `register_passkey` case to accept and ignore-or-honour `method`; the Expo client sends `KeyMethod::Platform` and lets the browser present its own choices (research D12)
- [X] T025 [US1] Update `src/services/onboarding-core/copy.ts` for the removed `ack2`/`ack3*` keys, keeping its exhaustive-with-`never` shape
- [X] T026 Run the shipping client's gate: `npx tsc --noEmit && npx jest && npm run lint`, then `npm run web` and create a wallet plus sign in for real (SC-010)

---

## Phase 3: Web — `app-web/vela-wallet` 🎯 MVP

**Goal**: one client that creates a wallet, signs in, and still has it after a reload.

**Independent test**: run [quickstart.md](./quickstart.md) scenarios 1, 4, 5, 6 against
`pnpm dev` with a real passkey provider.

**Checkpoint**: SC-001, SC-002, SC-004, SC-007 satisfied on web; the Welcome page still
loads no wasm and the Worker still ships none.

### Driving the core from the browser

- [X] T030 Create `app-web/vela-wallet/src/lib/onboarding/core/effect-loop.ts` by porting `src/services/crux/effect-loop.ts` — product-agnostic, one `AbortController` per effect; keep its contract comment ("`execute` MUST NOT reject for an expected failure")
- [X] T031 Create `app-web/vela-wallet/src/lib/onboarding/core/wasm-client.ts`: a lazy, idempotent `init(WASM_URL)` importing `rust/pkg-web/vela_core.js`, invoked on the first create or sign-in intent and never at module top level (research D5)
- [X] T032 Add a build step that copies the fingerprinted `public/vela_core_bg.<hash>.wasm` into `app-web/vela-wallet/static/` so the browser can fetch the URL `vela_core_wasm_url.js` names
- [X] T033 [P] Create `app-web/vela-wallet/src/lib/onboarding/core/json-shell.ts` adapting the wasm classes' `dispatch` / `resolve_effect` / `view` to the effect loop, mirroring `src/services/crux/json-wasm-shell.ts`

### The executor

- [X] T034 [US1] Create `app-web/vela-wallet/src/lib/onboarding/core/passkey.ts`: `navigator.credentials.create/get`, ES256 only (`alg: -7`), `residentKey: 'required'` **and** `requireResidentKey: true`, `userVerification: 'required'`, `attestation: 'direct'`, `credProps` extension with `rk === false` ⇒ `not_discoverable` before anything is stored; rpId resolution and the platform-error → `FailureKind` mapping
- [X] T035 [P] [US2] Create `app-web/vela-wallet/src/lib/onboarding/core/registry.ts`: challenge/register/task-poll/query-by-key/query-unit/health against the registry service, plus the read-only v1 legacy-name `eth_call`, with `network: true` set only when the request never reached the server
- [X] T036 [P] [US3] Create `app-web/vela-wallet/src/lib/onboarding/core/storage.ts` over `localStorage` using the existing keys and record shapes — **`keys` carried on every read and write** ([data-model.md §6](./data-model.md))
- [X] T037 [US1] Create `app-web/vela-wallet/src/lib/onboarding/core/executor.ts`: an exhaustive switch over all 18 operations per [contracts/shell-operations.md](./contracts/shell-operations.md) §1, converting every rejection into the result variant the operation owes
- [X] T038 [P] [US1] Create `app-web/vela-wallet/src/lib/onboarding/core/copy.ts`: exhaustive `StatusKey` / `PromptKind` / `SubmitLabel` / `KeyMethod` → i18n key maps with `never` fallbacks, mirroring `src/services/onboarding-core/copy.ts`
- [X] T039 [US3] Create `app-web/vela-wallet/src/lib/onboarding/core/session.ts` + its executor over the 7 `SessionOperation`s ([contracts/shell-operations.md](./contracts/shell-operations.md) §2), constructed once for the app rather than per screen

### The v2 screens

- [X] T040 [US1] Rewrite `app-web/vela-wallet/src/routes/[locale]/+page.svelte` to the v2 Welcome: mark + wordmark + `welcome.heroTitle` / `heroSubtitle` + two CTAs, desktop 620 px / mobile 440 px single column, buttons stacked below 1280 px
- [X] T041 [US1] Create `src/lib/ui/onboarding/FlowShell.svelte`: the full-page stepped container — back affordance on `can_go_back`, segmented progress at 33/66/100 %, replacing the 014 sheet/in-column container
- [X] T042 [US1] Create `src/lib/ui/onboarding/NameScreen.svelte`: name field, over-length hint, the two acknowledgement checkboxes with inline policy links, the two static assurances with filled ticks, `create.nextBtn`
- [X] T043 [US4] Create `src/lib/ui/onboarding/KeysScreen.svelte`: title/subtitle flips, `n / 7` counter, key rows (icon + name + provider line + badge), the accent-soft warning strip on `needs_second_key`, per-row confirm retry, row delete for index > 0, the address footnote, CTA flipping `createWalletBtn` ⇄ `addSecondKeyBtn`
- [X] T044 [US4] Create `src/lib/ui/onboarding/AddMethodPicker.svelte`: the in-place three-method expansion; `Hybrid` rendered present-but-unavailable with `create.methodHybridUnavailable` — on web it is the browser's own QR, so it maps to `Platform` rather than being disabled
- [X] T045 [US1] Create `src/lib/ui/onboarding/ProgressScreen.svelte`: meter label, percentage, and the three task rows driven by `status` per [research D9](./research.md) — no timer anywhere in this file
- [X] T046 [US1] Create `src/lib/ui/onboarding/DoneScreen.svelte`: identicon, wallet name, mono address, key list, `enterWalletBtn`
- [X] T047 [US5] Create `src/lib/ui/onboarding/RetryScreen.svelte` for `stage == sync_failed`: preserved key set, technical details from `sync_error_detail`, retry-upload primary, start-over secondary
- [X] T048 [US5] Rework `src/lib/ui/onboarding/Sheet.svelte` into the v2 error sheet — bottom-anchored with a drag handle below 1280 px, a centred 400 px card above — and map all 18 outcome kinds onto it via `OutcomeBody.svelte` ([data-model.md §5](./data-model.md))
- [X] T049 [US5] Wire the endpoint-settings surface to `LoginView.endpoint_unreachable`: it opens itself with a warning after three failed probes, and 我已有钱包 stays attemptable
- [X] T050 [US3] Apply `SessionView::allowed_route` as the route guard in `app-web/vela-wallet/src/routes/[locale]/+layout.svelte`, and land the wallet home with the real address and name after `enter_wallet`
- [X] T051 [US1] Delete the superseded 014 containers (`CreatePanel.svelte`, `LoginPanel.svelte`, `FlowScaffold.svelte`) and the fixture-only state model paths they served, keeping the atoms (`Button`, `NameField`, `AckRow`, `ActionStack`, `StepProgress`, `StatusBadge`, `TechDetails`, `AddressStrip`)

### Gallery and gates

- [X] T052 [US6] Rewrite `app-web/vela-wallet/src/lib/onboarding/fixtures.ts` and `src/routes/dev/gallery/+page.svelte` to cover every v2 screen and all 18 outcome kinds in both themes; keep the dev-only 404-in-production gate
- [X] T053 [US6] ~~Update `fixtures.test.ts`~~ — the 014 fixture model it tested is deleted; v2 fixtures are `CreateView` values, checked by the type system and rendered through the real screens
- [X] T054 [US5] Rewrite `app-web/vela-wallet/e2e/welcome-ssr.e2e.ts:145`: the **Worker** still ships no wasm, and the Welcome page loads none — the onboarding wasm is a client-only, on-demand asset
- [X] T055 [US1] Update `app-web/vela-wallet/e2e/welcome-layout.e2e.ts` for the v2 Welcome and the full-page flow (the 014 in-place-swap assertions no longer describe anything)
- [X] T056 [US2] Wire the login machine in `app-web/vela-wallet/src/lib/onboarding/core/login.ts` and the Welcome screen's 我已有钱包 button: `LoginEvent::Start` on mount to begin health probing, `SignIn` on activation, `busy` disabling the button, and the confirmable `RecoverOffer` prompt whose answer is the only one that changes the flow
- [X] T057 [US2] Verify the one-signature path on web: with a registry-known key and no stored account, sign-in must prompt exactly once and rebuild the full founding group before entering — two prompts means the common path regressed to recovery
- [X] T058 Run the web gate: `cd app-web/vela-wallet && pnpm gen:tokens --check && pnpm check && pnpm lint && pnpm test:unit -- --run && pnpm build && pnpm test:e2e`
- [X] T059 Run [quickstart.md](./quickstart.md) scenarios 1, 2, 4, 5, 6, 7 and the index-unreachable case by hand on web; record the results in `results.md`

---

## Phase 4: Core — the CTAP2 module

**Goal**: the sans-IO protocol layer the desktop client needs and feature 020 needs on five
platforms. Blocks Phase 5 only.

**Independent test**: `cargo test -p vela-core --features crux,i18n-all` with the ported
vectors passing; no transport, no clock, no randomness anywhere in the module.

- [X] T060 Create `rust/crates/vela-core/src/ctap/mod.rs` and register it in `lib.rs`; add `hkdf` and `aes-gcm` (RustCrypto, pure Rust) to `rust/crates/vela-core/Cargo.toml`
- [X] T061 [P] Implement CTAPHID framing in `rust/crates/vela-core/src/ctap/hid.rs`: `INIT` (0x06) / `CBOR` (0x10) / `KEEPALIVE` (0x3B) / `ERROR` (0x3F), init and continuation packets, 64-byte reports, channel allocation — bytes in, bytes out
- [X] T062 [P] Implement canonical CBOR request/response encoding in `rust/crates/vela-core/src/ctap/commands.rs` for `authenticatorMakeCredential` (0x01), `authenticatorGetAssertion` (0x02), `authenticatorGetInfo` (0x04), `authenticatorClientPIN` (0x06), plus the status-code vocabulary
- [X] T063 [P] ~~`ctap/cose.rs`~~ — not written: `webauthn.rs` already extracts the COSE key from attested credential data, and the CTAP path reaches it through `attestation_object()`. A second COSE module would be a second answer to the same question
- [X] T064 Implement PIN/UV auth protocols One and Two in `rust/crates/vela-core/src/ctap/pin_uv.rs` (ECDH key agreement, HKDF-SHA256, AES-256-CBC/GCM, `pinUvAuthToken` acquisition with permissions), taking the shared secret as an input rather than performing the exchange
- [X] T065 [P] Port the known-answer vectors from `/Volumes/data/production2/securitykeys` — RFC 5869 HKDF (`TransportCryptoTest`), canonical CBOR ordering (`CborTest`) — into `rust/crates/vela-core/tests/ctap_vectors.rs`
- [X] T066 [P] Add round-trip tests in `rust/crates/vela-core/tests/ctap_hid.rs`: a payload longer than one report must fragment and reassemble byte-identically; a truncated continuation must fail rather than silently short-read
- [X] T067 Add a `makeCredential` / `getAssertion` request-encoding test asserting `excludeCredentials` and `pubKeyCredParams: [{alg: -7}]` are present and RS256 is absent (FR-011, and the ES256-only rule in [contracts/shell-operations.md](./contracts/shell-operations.md))
- [X] T068 Run the core gate: `cd rust && cargo test -p vela-core --features crux,i18n-all && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`
- [X] T069 Confirm the module stayed pure: `grep -rn "std::time\|SystemTime\|rand::\|reqwest\|tokio" rust/crates/vela-core/src/ctap/` must return nothing

---

## Phase 5: Desktop — `app-desktop/vela-wallet`

**Goal**: the client with no system passkey service creates and enters a wallet through a
USB security key.

**Independent test**: [quickstart.md](./quickstart.md) scenarios 1, 2, 4, 6 with a YubiKey,
plus the no-key-present case.

- [X] T075 Add `features = ["crux"]` to the `vela-core` path dependency in `app-desktop/vela-wallet/Cargo.toml`, and `hidapi` — verify whether the `linux-native` feature removes the libudev link, per [research D3](./research.md); record the finding in `results.md`
- [X] T076 Create `app-desktop/vela-wallet/src/core_host.rs`: a generic `CoreHost<A>` driving `Core<A>` — monotonic effect ids, an outstanding-request map, "an unknown id means the answer outlived the question", cancellation on `cancelled_effect_ids`; the shape reference is `/Volumes/data/production2/airkeys/app-desktop/airkeys-wallet/src/shell_host.rs`
- [X] T077 [US1] Create `app-desktop/vela-wallet/src/ctap/usb.rs`: `hidapi` enumeration filtered to usage page `0xF1D0` / usage `0x01`, open/read/write of 64-byte reports; framing and CBOR come from `vela_core::ctap` and are not re-implemented here
- [X] T078 [US1] Create `app-desktop/vela-wallet/src/executor/passkey.rs`: `make_credential` and `get_assertion` ceremonies over T077, mapping "no key present" to `passkey_failed { kind: not_supported }` with a message the sheet can render, and surfacing "touch your key" as a prompt
- [X] T079 [P] [US2] Create `app-desktop/vela-wallet/src/executor/registry.rs` — the registry and index calls over the desktop HTTP client
- [X] T080 [P] [US3] Create `app-desktop/vela-wallet/src/executor/storage.rs`: a JSON file under the platform config dir, same keys and record shapes, `keys` carried on every read and write
- [X] T081 [US1] Create `app-desktop/vela-wallet/src/executor/mod.rs`: the exhaustive 18-operation switch, plus the 7 session operations
- [X] T082 [US1] Rewrite `app-desktop/vela-wallet/src/onboarding.rs` to the v2 Welcome (mark, wordmark, hero, two CTAs) — the 014 in-place action-column swap goes away
- [X] T083 [US1] Rewrite `app-desktop/vela-wallet/src/onboarding_flow.rs` as the v2 stepped flow: Name, Keys, Progress, Retry, Done, driven by `CreateView` per [data-model.md §3](./data-model.md); the `ui/` atoms are reused unchanged
- [X] T084 [US4] Implement the key list and the three-method picker in the same module; `Platform` is unavailable on desktop (no system service) and `Hybrid` is unavailable in this feature — both explained, not hidden
- [X] T085 [US5] Implement the v2 error sheet as a centred 400 px overlay covering all 18 outcome kinds, and the endpoint-settings surface on `endpoint_unreachable`
- [X] T086 [US3] Wire the session machine and `allowed_route` in `app-desktop/vela-wallet/src/main.rs`, landing on the existing wallet page with the real address
- [X] T087 [US6] Rewrite `app-desktop/vela-wallet/src/gallery.rs` fixtures to the v2 state set, keeping the `VELA_GALLERY=1` gate
- [X] T088 [US2] Wire the login machine and the 我已有钱包 button in `app-desktop/vela-wallet/src/onboarding.rs`, including the confirmable recovery consent and the health-probe-driven endpoint surface
- [~] T089 [US2] Verify the one-signature path on desktop with a registry-known security key: one touch, not two — **the check is now automated and waiting on a PIN**: `VELA_TEST_PIN=… cargo test register_then_assert -- --ignored` counts the touch prompts and asserts the assertion costs exactly one. The protocol layer underneath it is already verified against a real YubiKey (`a_plugged_in_key_answers_get_info`)
- [X] T090 Run the desktop gate: `cd app-desktop/vela-wallet && cargo check && cargo clippy --all-targets -- -D warnings && cargo test`
- [~] T091 [US1] Manual sweep with a FIDO2 USB key: quickstart scenarios 1, 2, 4, 6, plus starting the create flow with **no** key plugged in and recovering from that sheet by plugging one in; record in `results.md`
- [X] T092 What a host with no security key and no screen-recording permission CAN check, done in its place: `scripts/sweep-gallery.sh` opens all 26 gallery states, the deployed registry answers its health probe and an unknown-key query (`cargo test -- --ignored`), and the clientDataJSON this client builds is accepted by the core's own parsers. See `results.md` for what remains unverified

---

## Phase 6: The uniffi bridge

**Goal**: iOS and Android can execute the machines. Blocks Phases 7 and 8.

**Independent test**: the Swift and Kotlin smoke harnesses drive a create-wallet dispatch
through the bridge and get a view back.

- [X] T095 Enable `crux` on the `vela-core` dependency in `rust/crates/vela-core-uniffi/Cargo.toml`
- [X] T096 Create `rust/crates/vela-core-uniffi/src/onboarding_bridge.rs`: uniffi objects exposing `dispatch(event_json) -> String`, `resolve_effect(effect_id, result_json) -> String`, `view() -> String` for the create, login and session machines, each holding its `Core<A>` and request map behind a `Mutex`; semantics identical to `rust/crates/vela-core-wasm/src/bridge.rs`, including the unknown-id rule
- [~] T097 Regenerate the bindings and binaries: `rust/scripts/build-ios-xcframework.sh` and `rust/scripts/build-android.sh`; commit `rust/bindings/swift/` and `rust/bindings/kotlin/` — **both scripts ran green; the "commit" half is not possible**: `rust/.gitignore:2` ignores `bindings/` and `app-ios/.gitignore:30` ignores the xcframework, both being regenerated build outputs. The generated file that IS committed, `app-ios/VelaCoreKit/Sources/VelaCore/vela_core_uniffi.swift`, carries the three new classes
- [X] T098 Measure the size delta against the T002 baseline and record it in `results.md`. **If the delta is unacceptable, stop and switch to the second-crate fallback in [research D2](./research.md)** rather than absorbing it silently
- [X] T099 Rewrite the obsolete invariant in `rust/crates/vela-core/Cargo.toml` and `rust/README.md`: the `cargo tree -p vela-core-uniffi | grep -c crux # must be 0` rule was written about Hermes and the Expo app, and no longer describes native Swift and Kotlin — state what replaced it and why
- [X] T100 Extend `rust/harness/swift/main.swift` and `rust/harness/kotlin/Harness.kt` to drive one create-wallet dispatch through the new bridge, then run `rust/scripts/smoke-swift.sh` and `rust/scripts/smoke-kotlin.sh`

---

## Phase 7: Android — `app-android/vela-wallet`

**Goal**: create and sign in on a phone, through Credential Manager.

**Independent test**: [quickstart.md](./quickstart.md) scenarios 1–7 on the `alioth` device.

- [X] T105 [US1] Create `feature/onboarding/core/CoreDriver.kt`: the effect loop over the uniffi bridge — coroutine per effect, cancellation on `cancelled_effect_ids`, no exception may escape into the loop
- [X] T106 [US1] Create `feature/onboarding/core/PasskeyExecutor.kt` over `androidx.credentials`: `CreatePublicKeyCredentialRequest(requestJson)` and `GetPublicKeyCredentialOption(requestJson)`, assembling the same WebAuthn JSON the web path builds — `excludeCredentials` included — and mapping provider exceptions to `FailureKind`
- [X] T107 [P] [US2] Create `feature/onboarding/core/RegistryClient.kt` — registry and index calls, with `network` set only for a transport failure
- [X] T108 [P] [US3] Create `feature/onboarding/core/AccountStore.kt` over DataStore, same keys and record shapes, `keys` carried on every read and write
- [X] T109 [US1] Create `feature/onboarding/core/OnboardingExecutor.kt`: the exhaustive 18-operation switch, plus `SessionExecutor.kt` for the 7 session operations
- [X] T110 [US1] Rewrite `feature/onboarding/WelcomeScreen.kt` to the v2 Welcome
- [X] T111 [US1] Rewrite `feature/onboarding/flow/` to the v2 stepped flow (Name, Keys, Progress, Retry, Done) driven by `CreateView`; the `core/designsystem/components/` atoms are reused unchanged and `FlowSheet.kt` becomes the v2 error sheet
- [X] T112 [US4] Implement the key list and the three-method picker; `Hybrid` present-but-unavailable
- [X] T113 [US5] Map all 18 outcome kinds onto the v2 sheet, and open the endpoint-settings surface on `endpoint_unreachable`
- [X] T114 [US3] Wire the session machine and `allowed_route` into `navigation/VelaNavHost.kt`, landing on the wallet route with the real address
- [X] T115 [US6] Rewrite `feature/onboarding/flow/FlowFixtures.kt` and `feature/onboarding/gallery/GalleryScreen.kt` to the v2 state set
- [X] T116 Add the new onboarding string keys to `core/i18n/I18nKeys.kt` — no literal user-visible string may appear in a composable
- [X] T117 Verify the relying-party association: `assetlinks.json` on the production domain lists this app's package name and signing-certificate fingerprint; record the check in `results.md`
- [X] T118 [US2] Wire the login machine and the 我已有钱包 button in `feature/onboarding/WelcomeScreen.kt` + `WelcomeViewModel.kt`, including the confirmable recovery consent
- [X] T119 [US2] Verify the one-signature path on Android against a registry-known key
- [X] T120 Run the Android gate: `cd app-android/vela-wallet && ./gradlew :app:testDebugUnitTest :app:assembleDebug` and the token drift test `DesignTokenDriftTest`
- [~] T121 [US1] On-device sweep on `alioth` (serial `9d5f42fb`): quickstart scenarios 1–7; record in `results.md` — **run on a Galaxy S22 (`R3CT9095AGZ`), not `alioth`**, and scenarios 1/2/4/7 are verified: a wallet created end to end through Google Password Manager, sign-in in one signature, sign-out and back. Scenarios 3, 5 and 6 (two-key sets, the endpoint surface, the publish retry) are untried. Three bugs came out of it — see `deviations.md` §11

---

## Phase 8: iOS — `app-ios/VelaWallet`

**Goal**: create and sign in on an iPhone, through AuthenticationServices.

**Independent test**: [quickstart.md](./quickstart.md) scenarios 1–7 on a physical device.

- [X] T125 Raise the deployment target to **17.4** in both `app-ios/VelaWallet/VelaWallet.xcodeproj` (`IPHONEOS_DEPLOYMENT_TARGET`) and `app-ios/VelaCoreKit/Package.swift` (`platforms: [.iOS(.v17_4)]`) — they must move together ([research D6](./research.md))
- [X] T126 [US1] Create `Features/Onboarding/Core/CoreDriver.swift`: the effect loop over the uniffi bridge, one `Task` per effect, cancellation honoured
- [X] T127 [US1] Create `Features/Onboarding/Core/PasskeyExecutor.swift` over `ASAuthorizationPlatformPublicKeyCredentialProvider`: registration with `excludedCredentials`, assertion with and without a credential hint, presentation anchor, and the `ASAuthorizationError` → `FailureKind` mapping
- [X] T128 [P] [US2] Create `Features/Onboarding/Core/RegistryClient.swift` over `URLSession`
- [X] T129 [P] [US3] Create `Features/Onboarding/Core/AccountStore.swift`, same keys and record shapes, `keys` carried on every read and write
- [X] T130 [US1] Create `Features/Onboarding/Core/OnboardingExecutor.swift` (18 operations) and `SessionExecutor.swift` (7)
- [X] T131 [US1] Rewrite `Features/Onboarding/WelcomeScreen.swift` to the v2 Welcome
- [X] T132 [US1] Rewrite `Features/Onboarding/{CreatePanel,LoginPanel,FlowSheet,FlowStates}.swift` into the v2 stepped flow; the `Components/` atoms are reused unchanged and `FlowSheet.swift` becomes the v2 error sheet
- [X] T133 [US4] Implement the key list and the three-method picker; `Hybrid` present-but-unavailable
- [X] T134 [US5] Map all 18 outcome kinds onto the v2 sheet, and open the endpoint-settings surface on `endpoint_unreachable`
- [X] T135 [US3] Wire the session machine and `allowed_route` into `App/RootView.swift`, landing on the wallet route with the real address
- [X] T136 [US6] Rewrite `Features/Onboarding/FlowFixtures.swift` and `Features/Gallery/OnboardingGalleryScreen.swift` to the v2 state set
- [X] T137 Introduce `Features/Onboarding/I18nKeys.swift` and move the inline key literals in `FlowStates.swift` / `FlowSheet.swift` into it — iOS is the one client with no centralised key file, and this feature is where that stops being tolerable
- [X] T138 Verify the associated domain: `webcredentials:getvela.app` is in the entitlements and the apple-app-site-association file on the production domain resolves; record the check in `results.md`
- [X] T139 [US2] Wire the login machine and the 我已有钱包 button in `Features/Onboarding/WelcomeScreen.swift` + `WelcomeModel.swift`, including the confirmable recovery consent
- [X] T140 [US2] Verify the one-signature path on iOS against a registry-known key — founder-verified on a physical iPhone 11: 我已有钱包 raises ONE passkey prompt and lands on the wallet
- [X] T141 Run the iOS gate: `node app-ios/scripts/gen-tokens.mjs --check`, `node app-ios/scripts/audit-literals.mjs`, and `xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj -scheme VelaWallet -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build test`
- [~] T142 [US1] On-device sweep: quickstart scenarios 1–7; record in `results.md` — the build is signed, installed and running on a physical iPhone 11 (iOS 26.5.2), and the founder reached a created wallet on it. **The one-way door they hit there is fixed and shipped to the device; the sweep itself is not finished.** No screenshot path exists for a physical iPhone from this host, so every iOS screen is still unconfirmed by an automated eye

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T145 [US1] Cross-client address agreement (SC-003): create a multi-key wallet on one client, sign in on the other three, and confirm the address is character-identical across all four and matches the recorded golden Safe `0x88cCA0…6894`
- [X] T146 [US6] Locale sweep (SC-009): walk each client's gallery in `zh` and `ru`; no key may render as its own name and no string may overflow its container
- [X] T147 Mark `specs/011-crux-onboarding-state/contracts/onboarding-core.md` superseded by `specs/019-onboarding-live-wiring/contracts/shell-operations.md`, with a one-line note naming what had drifted
- [X] T148 [P] Update `specs/014-onboarding-flow-ui/deviations.md` to record that the 014 containers and the create-flow stepped bar and elapsed ring were superseded here ([research D9](./research.md)), so the 014 report stops describing shipped UI
- [X] T149 Write `specs/019-onboarding-live-wiring/results.md`: the gate table per platform, the measured artifact deltas from T002/T098, the manual sweep outcomes, and every deviation found along the way
- [X] T150 Write `specs/019-onboarding-live-wiring/deviations.md` for anything that diverged from the design or the contracts, in the shape spec 014 established
- [X] T151 Re-run every gate one last time across all five shells, and record the results in `results.md`

---

## Phase 10: Scope expansion — the first key is a choice (2026-08-26)

**Purpose**: the Samsung/Xiaomi lock-out fix. The core stops minting the first key with a
default method; every founding key is chosen on the key screen. See spec *Scope
expansion* and FR-009a.

- [X] T160 Core: `Submit` lands on the (empty) key list after the group key; `AddKey`
  mints every key including the first (label/display name = wallet name for key 1);
  cancellation and failure return to the key list, never the form
  (`rust/crates/vela-core/src/app/create_wallet.rs`)
- [X] T161 Core tests: `registered()`/`device_bound_registered()` walk the new flow; new
  pin `the_first_key_carries_the_persons_method_choice` (the Xiaomi fix);
  `cancelling_registration_persists_nothing` asserts the return-to-list behaviour
- [X] T162 All four v2 shells: the key screen keeps the three methods EXPANDED while the
  list is empty (web `KeysScreen.svelte`, Android `KeysScreen.kt`, iOS
  `CreatePanel.swift`, desktop `onboarding_flow.rs`); web gallery gains fixture `K0`
- [X] T163 Shipping `src/` client: lands on the empty key list; its existing
  "+ Add a passkey" row (hardcoded platform method) keeps FR-030 intact
- [X] T164 Root e2e updated to the new flow (add-key click after Create Wallet) — plus
  three pre-existing rot fixes found by running them: stale ack fragments, the stale
  19,608 corpus pin, and the sign-in mock answering the registry's three query flavors
  with one echoed record
- [X] T165 Rebuild + verify the committed wasm (`build:wasm`, `verify:wasm`,
  `sync:wasm`); root jest 2,498 green; web vitest 155 green (two pre-existing rail
  token-gate failures fixed: `railSlot` gallery prop, rail/welcome px literals
  tokenized); desktop 70 green; Android `compileDebugKotlin` green; iOS arm64 sim
  build green
- [~] T166 Device sweep on the Galaxy S22: create with the YubiKey 5C as the FIRST key
  via the security-key method (app-owned path, no OEM sheet) — **verified on the S22 by
  the founder, 2026-08-26 16:49–16:56**: empty key list → security-key method → GMS
  FIDO2 "Connect your key" → minted + member proof signed, twice over, no OEM sheet and
  no fingerprint window. The Xiaomi (alioth) half is untried — the device was not
  connected
- [X] T167 iOS simulator x86_64 slice: the xcframework's sim slice is arm64-only by
  design (the pinned toolchain carries no `x86_64-apple-ios`), so the project now sets
  `EXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64` on the app target; `generic/platform=iOS
  Simulator` builds green. Intel-Mac hosts are not a supported dev environment

## Phase 11: Scope expansion — universal methods & the GMS-free path

**Purpose**: the method × platform matrix, per FR-009/009b/009c. Ordered by audience
impact: the app-owned Android USB path serves the GMS-free population (GrapheneOS/
CalyxOS, China-market devices) that overlaps most with this wallet's target users.

- [~] T170 uniffi-export the core `ctap` module's ceremony surface so Kotlin can drive
  it sans-IO — **first cut landed (2026-08-26)**: the whole orchestration
  (getInfo→UV-before-PIN→PIN retry loop→make/get→getNextAssertion picker) moved from
  the desktop shell into `vela_core::ctap::ceremony` behind the `Cable`/`Host` seams;
  desktop refactored onto it, 67 tests + 4 new core tests green, behavior pinned by
  the client-data/member-proof/failure-sentence tests. Remaining: the uniffi callback
  surface itself (report-level `UsbHidPort` + `CeremonyHost`), plus lifting the
  CTAPHID INIT/keepalive exchange loop out of desktop `usb.rs` into a generic
  `HidCable` so Kotlin stays ~100 lines of USB plumbing
- [X] T170a Core `HidCable`: the CTAPHID INIT/framing/keepalive exchange loop, generic
  over a 64-byte-report `Port` — lifted from desktop `usb.rs`, unit-tested with a
  scripted fake port; desktop's `SecurityKey` becomes one `Port` behind it
- [X] T170b Core `ApduCable`: the ISO 7816 loop (SELECT FIDO AID → NFCCTAP_MSG
  0x80/0x10 → 0x9100 keepalive poll with touch on data[0]==0x02 → 61xx GET RESPONSE →
  extended-length APDU), generic over an `ApduPort` — ported from the demo's
  `SmartCardCtapDevice.swift`, byte-identical to the NFC binding, so iOS CCID and
  iOS/Android NFC are three ports under one cable
- [~] T171 Android USB-host transport — **built, compiled, installed on the S22
  (2026-08-26); on-device ceremony verification pending a USB-C key plugged into the
  phone**. `ctap_bridge.rs` uniffi-exports `UsbHidPort`+`CtapCeremonyHost` callback
  interfaces and `ctapRegister`/`ctapAssert`; Kotlin `UsbHidTransport` (enumerate /
  permission / claim / bulk-transfer reports, no framing) is the port, `UsbSecurityKey
  Ceremony` drives it on IO with the host bridging PIN/pick/touch to blocking UI
  (`UsbCeremonyPrompts` + ViewModel state). `PasskeyExecutor` prefers it over GMS FIDO2
  whenever a USB FIDO key is present, for register AND assert. Reused the desktop's
  `create.pin*`/`touch*`/`login.pick*` corpus keys (no new corpus). Hot-plug
  (`ACTION_USB_DEVICE_ATTACHED`) not yet wired — the person presses retry after
  plugging in, same as the desktop.
- [~] T171b iOS CCID transport — **built, compiles green for the simulator
  (2026-08-26); on-device verification needs a USB-C YubiKey on a USB-C iPhone**.
  `ctap_bridge.rs` gains `CcidPort` + `ctapRegisterCcid`/`ctapAssertCcid`;
  `SmartCardCtapCeremony.swift` is the `TKSmartCard`→`ApduCable` port (semaphore
  bridges async transmit to the core's sync call) + ceremony + host;
  `PasskeyExecutor` prefers it for the security-key method + removable assert;
  `UsbCeremonyPrompts.swift` are the PIN/pick/touch sheets (reused desktop corpus
  keys); `com.apple.security.smartcard` entitlement added. Slot/state KVO presence
  monitor not added — `deviceAvailable()` polls the slot manager per ceremony.
- [ ] T172 Android sign-in: a security-key entry on the welcome/login surface that does
  not depend on the OEM sheet (unpinned get on the app-owned path; GMS FIDO2 unpinned
  get as the GMS alternative)
- [ ] T173 The CTAP UI vocabulary Android now needs (the desktop already has the
  strings): touch prompt, PIN prompt with attempts, several-keys race — reuse the
  `create.pin*`/`create.touch*` corpus keys; only genuinely new keys go through the
  five-step corpus gate
- [ ] T174 Hybrid (caBLE v2 / CTAP 2.3) client in core: QR payload (CBOR keys 0–6;
  key 6 channel list emitted only when offering BLE — legacy-collision gotcha) + BLE
  advert decrypt + Noise + tunnel + the CTAP 2.3 BLE-only data channel, sans-IO —
  PORTED from the founder's proven demos (`transport/ble/cable/*.kt` and the iOS
  `CableConn`/`CableQr`/`Noise`/`HybridBleClient`), with webauthn-rs `cable/mod.rs`
  as the cross-check; transports (BLE scan/connect, WebSocket) live in each shell
- [ ] T175 Desktop scan method: wire the caBLE client on macOS/Linux (QR render in gpui,
  `btleplug` scan, tunnel WebSocket); flip the method row from
  present-and-unavailable to live
- [ ] T176 Android scan method on GMS-free devices: same caBLE client over Android BLE;
  where GMS exists the system sheet's cross-device route stays the default
- [ ] T177 Probe-driven method availability: each shell reports at runtime which routes
  exist (GMS present? BLE on? HID reachable?) and the key screen's method rows say so
  with the true reason (FR-009); the probe result lands in VelaLog so a bug report
  names the route that was tried
- [ ] T178 Matrix verification sweep: per platform × method × (create, sign-in), record
  pass/unavailable-with-reason in `results.md`; GMS-free case exercised on a device or
  emulator image without Google services

---

## Dependencies & Execution Order

- **T001–T004** → everything. Baselines cannot be recovered after the fact.
- **T010–T026 (Phase 2)** → every client phase. The core change is breaking; the phase is
  not done until all five shells are green, `src/` included.
- **T060–T069 (Phase 4)** → Phase 5 only. It can run in parallel with Phase 3.
- **T095–T100 (Phase 6)** → Phases 7 and 8. It can run in parallel with Phases 3–5.
- **T098** is a decision point, not a measurement to file away: an unacceptable delta
  redirects Phase 6 to the second-crate fallback before Phases 7 and 8 begin.
- Phases 3, 5, 7, 8 are independent of each other once their prerequisites are met.
- **T145** requires all four clients, so it lands last.

## Parallel Opportunities

- T002 ∥ T003 (different measurements)
- T035 ∥ T036 ∥ T038 within the web executor; likewise T079 ∥ T080, T107 ∥ T108, T128 ∥ T129
- T061 ∥ T062 ∥ T063 (three independent files in the new CTAP module), then T064 depends on T063
- T065 ∥ T066 (independent test files)
- **Phase 3 (web) ∥ Phase 4 (core CTAP) ∥ Phase 6 (bridge)** — three different codebases,
  no shared files. This is the biggest win available: it puts Phases 5, 7 and 8 on the
  critical path together rather than in series.
- T148 ∥ T147 (different spec directories)

## Parallel Example: the web executor

```
T035  registry.ts   ─┐
T036  storage.ts    ─┼─→ T037 executor.ts ─→ T039 session.ts
T038  copy.ts       ─┘
T034  passkey.ts    ─┘
```

## Implementation Strategy

**MVP = Phases 1–3.** Stop there and you have a web wallet that creates, enters and
re-enters a real account through the shared core, with every failure legible and every
state inspectable. That is a shippable increment and it validates every decision the other
three clients depend on.

Then take Phase 4 and Phase 6 in parallel with each other, since they unblock different
clients, and finish with 5, 7, 8 in whatever order hardware availability allows.

Each phase is one commit with its own gate. Per `agent-rules/AI-CODING-RULES.md` this
feature is **High** risk — authentication, key derivation, session state — so every phase
commit carries its risk description, the gate output as test evidence, and a rollback note
naming the commit to revert.

## Notes

- The core decides; the client performs. If an `if` in an executor starts deciding what
  happens next, that decision belongs in the Rust machine instead.
- Nothing rejects. Every failure crosses the boundary as the result variant the operation
  owes. An exception reaching the effect loop is a bug, not a code path.
- `keys` is carried on every `Account` read and write, on every client. Dropping it does
  not merely lose data — it silently repairs a multi-key account into a different, wrong,
  single-key Safe.
- Generated files (`rust/pkg-web`, `src/services/onboarding-core/generated`,
  `i18n_catalogs`, `tokens.css`, `Tokens.swift`, `rust/bindings/`) are regenerated and
  committed, never hand-edited.
- If a gate cannot be run, say so and mark the task `- [~]` with the reason inline — do not
  mark it done.
