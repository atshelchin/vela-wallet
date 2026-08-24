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
- [ ] T002 Record baseline artifact sizes in `specs/019-onboarding-live-wiring/results.md`: `app-android/vela-wallet/app/src/main/jniLibs/arm64-v8a/libvela_core_uniffi.so`, `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework` (`du -sh`), `public/vela_core_bg.*.wasm`
- [ ] T003 [P] Record baseline corpus counts in the same file: `onboarding` namespace leaves (163), corpus leaves (1,184), and the SC-005 residency figure from `cargo test -p vela-core --features i18n-all --test i18n_residency -- --nocapture`
- [ ] T004 Confirm the tree is green before touching it: `cd rust && cargo test --workspace --features vela-core/i18n-all && cargo clippy --workspace --all-targets --features vela-core/i18n-all -- -D warnings`, plus `npx tsc --noEmit && npx jest` at the repo root

---

## Phase 2: Foundational — the core, and everything the core change breaks

**⚠️ CRITICAL**: no client phase may begin until this one is complete and every shell still
builds. The two core changes are breaking; leaving them half-applied means the production
web wallet cannot create a wallet.

**Checkpoint**: the whole repository — including `src/`, the shipping Expo client — builds,
lints and tests green, and `npm run web` can still create a wallet.

### The two core changes

- [ ] T010 Add `pub enum KeyMethod { Platform, Hybrid, SecurityKey }` (`serde` `snake_case`, `TS` under the `bindings` feature) to `rust/crates/vela-core/src/app/mod.rs`, beside `FailureKind` — see [data-model.md §1](./data-model.md)
- [ ] T011 Add `method: KeyMethod` to `ShellOperation::RegisterPasskey` in `rust/crates/vela-core/src/app/shell.rs`, documenting that it is what the *person chose*, distinct from what the authenticator reports
- [ ] T012 Add `method` to `Event::AddKey`, add `registering_method` to `Model`, and carry it onto the resulting `Draft` and `CreateKeyRow` in `rust/crates/vela-core/src/app/create_wallet.rs`; `Event::Submit` uses the client-supplied default for the first key
- [ ] T013 Change `ACK_COUNT` from 4 to 2 in `rust/crates/vela-core/src/app/create_wallet.rs` and adjust `Model.acks` / `CreateView.acks`
- [ ] T014 Update `rust/crates/vela-core/tests/app_create_wallet.rs` for both changes — every ack-array construction, and the `add_key` cases which now carry a method; the assertions themselves must not be weakened
- [ ] T015 Run the core gate: `cd rust && cargo test -p vela-core --features crux,i18n-all && cargo clippy --workspace --all-targets --features vela-core/i18n-all -- -D warnings && cargo fmt --check`

### The corpus

- [ ] T016 Apply [contracts/i18n-keys.md](./contracts/i18n-keys.md) §1–§3 (6 removed, 4 renamed, 15 rewritten) to `rust/crates/vela-core/i18n/locales/<lng>/onboarding.json` for all 15 locales
- [ ] T017 Apply [contracts/i18n-keys.md](./contracts/i18n-keys.md) §4 (32 added) to the same 15 files; `zh` takes the design's own copy verbatim, `en` takes the contract's, the other 13 follow the machine-translation-pending-human-review precedent
- [ ] T018 Regenerate and verify: `npm run gen:i18n && npm run lint:i18n && npm run verify:i18n && npm run dump:vectors`
- [ ] T019 Update the leaf/path count pins in the root Jest suite to the new figures (expected: `onboarding` 189, corpus 1,210) and run `npx jest`
- [ ] T020 Re-measure `rust/crates/vela-core/tests/i18n_residency.rs` and confirm `ja` + `en` still fit the 135,345-byte SC-005 budget; update the recorded figures in the test's comments if they moved

### Regenerating the committed artifacts

- [ ] T021 `npm run gen:core-types` — `src/services/onboarding-core/generated/` gains `KeyMethod.ts` and the changed `CreateWalletEvent` / `ShellOperation` / `CreateKeyRow`; commit the output, never hand-edit it
- [ ] T022 `npm run build:wasm && npm run verify:wasm` — commit the regenerated `rust/pkg-web/` and the newly fingerprinted `public/vela_core_bg.<hash>.wasm`, and delete the superseded one

### The fifth shell — lockstep (FR-030, SC-010)

- [ ] T023 [US1] Update `src/screens/onboarding/CreateWalletScreen.tsx` from four acknowledgement rows to two, using the rewritten `ack0`/`ack1` and the renamed `ack1*` link fragments
- [ ] T024 [US1] Update `src/services/onboarding-core/executor.ts` `register_passkey` case to accept and ignore-or-honour `method`; the Expo client sends `KeyMethod::Platform` and lets the browser present its own choices (research D12)
- [ ] T025 [US1] Update `src/services/onboarding-core/copy.ts` for the removed `ack2`/`ack3*` keys, keeping its exhaustive-with-`never` shape
- [ ] T026 Run the shipping client's gate: `npx tsc --noEmit && npx jest && npm run lint`, then `npm run web` and create a wallet plus sign in for real (SC-010)

---

## Phase 3: Web — `app-web/vela-wallet` 🎯 MVP

**Goal**: one client that creates a wallet, signs in, and still has it after a reload.

**Independent test**: run [quickstart.md](./quickstart.md) scenarios 1, 4, 5, 6 against
`pnpm dev` with a real passkey provider.

**Checkpoint**: SC-001, SC-002, SC-004, SC-007 satisfied on web; the Welcome page still
loads no wasm and the Worker still ships none.

### Driving the core from the browser

- [ ] T030 Create `app-web/vela-wallet/src/lib/onboarding/core/effect-loop.ts` by porting `src/services/crux/effect-loop.ts` — product-agnostic, one `AbortController` per effect; keep its contract comment ("`execute` MUST NOT reject for an expected failure")
- [ ] T031 Create `app-web/vela-wallet/src/lib/onboarding/core/wasm-client.ts`: a lazy, idempotent `init(WASM_URL)` importing `rust/pkg-web/vela_core.js`, invoked on the first create or sign-in intent and never at module top level (research D5)
- [ ] T032 Add a build step that copies the fingerprinted `public/vela_core_bg.<hash>.wasm` into `app-web/vela-wallet/static/` so the browser can fetch the URL `vela_core_wasm_url.js` names
- [ ] T033 [P] Create `app-web/vela-wallet/src/lib/onboarding/core/json-shell.ts` adapting the wasm classes' `dispatch` / `resolve_effect` / `view` to the effect loop, mirroring `src/services/crux/json-wasm-shell.ts`

### The executor

- [ ] T034 [US1] Create `app-web/vela-wallet/src/lib/onboarding/core/passkey.ts`: `navigator.credentials.create/get`, ES256 only (`alg: -7`), `residentKey: 'required'` **and** `requireResidentKey: true`, `userVerification: 'required'`, `attestation: 'direct'`, `credProps` extension with `rk === false` ⇒ `not_discoverable` before anything is stored; rpId resolution and the platform-error → `FailureKind` mapping
- [ ] T035 [P] [US2] Create `app-web/vela-wallet/src/lib/onboarding/core/registry.ts`: challenge/register/task-poll/query-by-key/query-unit/health against the registry service, plus the read-only v1 legacy-name `eth_call`, with `network: true` set only when the request never reached the server
- [ ] T036 [P] [US3] Create `app-web/vela-wallet/src/lib/onboarding/core/storage.ts` over `localStorage` using the existing keys and record shapes — **`keys` carried on every read and write** ([data-model.md §6](./data-model.md))
- [ ] T037 [US1] Create `app-web/vela-wallet/src/lib/onboarding/core/executor.ts`: an exhaustive switch over all 18 operations per [contracts/shell-operations.md](./contracts/shell-operations.md) §1, converting every rejection into the result variant the operation owes
- [ ] T038 [P] [US1] Create `app-web/vela-wallet/src/lib/onboarding/core/copy.ts`: exhaustive `StatusKey` / `PromptKind` / `SubmitLabel` / `KeyMethod` → i18n key maps with `never` fallbacks, mirroring `src/services/onboarding-core/copy.ts`
- [ ] T039 [US3] Create `app-web/vela-wallet/src/lib/onboarding/core/session.ts` + its executor over the 7 `SessionOperation`s ([contracts/shell-operations.md](./contracts/shell-operations.md) §2), constructed once for the app rather than per screen

### The v2 screens

- [ ] T040 [US1] Rewrite `app-web/vela-wallet/src/routes/[locale]/+page.svelte` to the v2 Welcome: mark + wordmark + `welcome.heroTitle` / `heroSubtitle` + two CTAs, desktop 620 px / mobile 440 px single column, buttons stacked below 1280 px
- [ ] T041 [US1] Create `src/lib/ui/onboarding/FlowShell.svelte`: the full-page stepped container — back affordance on `can_go_back`, segmented progress at 33/66/100 %, replacing the 014 sheet/in-column container
- [ ] T042 [US1] Create `src/lib/ui/onboarding/NameScreen.svelte`: name field, over-length hint, the two acknowledgement checkboxes with inline policy links, the two static assurances with filled ticks, `create.nextBtn`
- [ ] T043 [US4] Create `src/lib/ui/onboarding/KeysScreen.svelte`: title/subtitle flips, `n / 7` counter, key rows (icon + name + provider line + badge), the accent-soft warning strip on `needs_second_key`, per-row confirm retry, row delete for index > 0, the address footnote, CTA flipping `createWalletBtn` ⇄ `addSecondKeyBtn`
- [ ] T044 [US4] Create `src/lib/ui/onboarding/AddMethodPicker.svelte`: the in-place three-method expansion; `Hybrid` rendered present-but-unavailable with `create.methodHybridUnavailable` — on web it is the browser's own QR, so it maps to `Platform` rather than being disabled
- [ ] T045 [US1] Create `src/lib/ui/onboarding/ProgressScreen.svelte`: meter label, percentage, and the three task rows driven by `status` per [research D9](./research.md) — no timer anywhere in this file
- [ ] T046 [US1] Create `src/lib/ui/onboarding/DoneScreen.svelte`: identicon, wallet name, mono address, key list, `enterWalletBtn`
- [ ] T047 [US5] Create `src/lib/ui/onboarding/RetryScreen.svelte` for `stage == sync_failed`: preserved key set, technical details from `sync_error_detail`, retry-upload primary, start-over secondary
- [ ] T048 [US5] Rework `src/lib/ui/onboarding/Sheet.svelte` into the v2 error sheet — bottom-anchored with a drag handle below 1280 px, a centred 400 px card above — and map all 18 outcome kinds onto it via `OutcomeBody.svelte` ([data-model.md §5](./data-model.md))
- [ ] T049 [US5] Wire the endpoint-settings surface to `LoginView.endpoint_unreachable`: it opens itself with a warning after three failed probes, and 我已有钱包 stays attemptable
- [ ] T050 [US3] Apply `SessionView::allowed_route` as the route guard in `app-web/vela-wallet/src/routes/[locale]/+layout.svelte`, and land the wallet home with the real address and name after `enter_wallet`
- [ ] T051 [US1] Delete the superseded 014 containers (`CreatePanel.svelte`, `LoginPanel.svelte`, `FlowScaffold.svelte`) and the fixture-only state model paths they served, keeping the atoms (`Button`, `NameField`, `AckRow`, `ActionStack`, `StepProgress`, `StatusBadge`, `TechDetails`, `AddressStrip`)

### Gallery and gates

- [ ] T052 [US6] Rewrite `app-web/vela-wallet/src/lib/onboarding/fixtures.ts` and `src/routes/dev/gallery/+page.svelte` to cover every v2 screen and all 18 outcome kinds in both themes; keep the dev-only 404-in-production gate
- [ ] T053 [US6] Update `app-web/vela-wallet/src/lib/onboarding/fixtures.test.ts` for the new fixture set
- [ ] T054 [US5] Rewrite `app-web/vela-wallet/e2e/welcome-ssr.e2e.ts:145`: the **Worker** still ships no wasm, and the Welcome page loads none — the onboarding wasm is a client-only, on-demand asset
- [ ] T055 [US1] Update `app-web/vela-wallet/e2e/welcome-layout.e2e.ts` for the v2 Welcome and the full-page flow (the 014 in-place-swap assertions no longer describe anything)
- [ ] T056 [US2] Wire the login machine in `app-web/vela-wallet/src/lib/onboarding/core/login.ts` and the Welcome screen's 我已有钱包 button: `LoginEvent::Start` on mount to begin health probing, `SignIn` on activation, `busy` disabling the button, and the confirmable `RecoverOffer` prompt whose answer is the only one that changes the flow
- [ ] T057 [US2] Verify the one-signature path on web: with a registry-known key and no stored account, sign-in must prompt exactly once and rebuild the full founding group before entering — two prompts means the common path regressed to recovery
- [ ] T058 Run the web gate: `cd app-web/vela-wallet && pnpm gen:tokens --check && pnpm check && pnpm lint && pnpm test:unit -- --run && pnpm build && pnpm test:e2e`
- [ ] T059 Run [quickstart.md](./quickstart.md) scenarios 1, 2, 4, 5, 6, 7 and the index-unreachable case by hand on web; record the results in `results.md`

---

## Phase 4: Core — the CTAP2 module

**Goal**: the sans-IO protocol layer the desktop client needs and feature 020 needs on five
platforms. Blocks Phase 5 only.

**Independent test**: `cargo test -p vela-core --features crux,i18n-all` with the ported
vectors passing; no transport, no clock, no randomness anywhere in the module.

- [ ] T060 Create `rust/crates/vela-core/src/ctap/mod.rs` and register it in `lib.rs`; add `hkdf` and `aes-gcm` (RustCrypto, pure Rust) to `rust/crates/vela-core/Cargo.toml`
- [ ] T061 [P] Implement CTAPHID framing in `rust/crates/vela-core/src/ctap/hid.rs`: `INIT` (0x06) / `CBOR` (0x10) / `KEEPALIVE` (0x3B) / `ERROR` (0x3F), init and continuation packets, 64-byte reports, channel allocation — bytes in, bytes out
- [ ] T062 [P] Implement canonical CBOR request/response encoding in `rust/crates/vela-core/src/ctap/commands.rs` for `authenticatorMakeCredential` (0x01), `authenticatorGetAssertion` (0x02), `authenticatorGetInfo` (0x04), `authenticatorClientPIN` (0x06), plus the status-code vocabulary
- [ ] T063 [P] Implement COSE key encode/decode for ES256 in `rust/crates/vela-core/src/ctap/cose.rs`, reusing `webauthn.rs`'s existing extraction rather than duplicating it
- [ ] T064 Implement PIN/UV auth protocols One and Two in `rust/crates/vela-core/src/ctap/pin_uv.rs` (ECDH key agreement, HKDF-SHA256, AES-256-CBC/GCM, `pinUvAuthToken` acquisition with permissions), taking the shared secret as an input rather than performing the exchange
- [ ] T065 [P] Port the known-answer vectors from `/Volumes/data/production2/securitykeys` — RFC 5869 HKDF (`TransportCryptoTest`), canonical CBOR ordering (`CborTest`) — into `rust/crates/vela-core/tests/ctap_vectors.rs`
- [ ] T066 [P] Add round-trip tests in `rust/crates/vela-core/tests/ctap_hid.rs`: a payload longer than one report must fragment and reassemble byte-identically; a truncated continuation must fail rather than silently short-read
- [ ] T067 Add a `makeCredential` / `getAssertion` request-encoding test asserting `excludeCredentials` and `pubKeyCredParams: [{alg: -7}]` are present and RS256 is absent (FR-011, and the ES256-only rule in [contracts/shell-operations.md](./contracts/shell-operations.md))
- [ ] T068 Run the core gate: `cd rust && cargo test -p vela-core --features crux,i18n-all && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`
- [ ] T069 Confirm the module stayed pure: `grep -rn "std::time\|SystemTime\|rand::\|reqwest\|tokio" rust/crates/vela-core/src/ctap/` must return nothing

---

## Phase 5: Desktop — `app-desktop/vela-wallet`

**Goal**: the client with no system passkey service creates and enters a wallet through a
USB security key.

**Independent test**: [quickstart.md](./quickstart.md) scenarios 1, 2, 4, 6 with a YubiKey,
plus the no-key-present case.

- [ ] T075 Add `features = ["crux"]` to the `vela-core` path dependency in `app-desktop/vela-wallet/Cargo.toml`, and `hidapi` — verify whether the `linux-native` feature removes the libudev link, per [research D3](./research.md); record the finding in `results.md`
- [ ] T076 Create `app-desktop/vela-wallet/src/core_host.rs`: a generic `CoreHost<A>` driving `Core<A>` — monotonic effect ids, an outstanding-request map, "an unknown id means the answer outlived the question", cancellation on `cancelled_effect_ids`; the shape reference is `/Volumes/data/production2/airkeys/app-desktop/airkeys-wallet/src/shell_host.rs`
- [ ] T077 [US1] Create `app-desktop/vela-wallet/src/ctap/usb.rs`: `hidapi` enumeration filtered to usage page `0xF1D0` / usage `0x01`, open/read/write of 64-byte reports; framing and CBOR come from `vela_core::ctap` and are not re-implemented here
- [ ] T078 [US1] Create `app-desktop/vela-wallet/src/executor/passkey.rs`: `make_credential` and `get_assertion` ceremonies over T077, mapping "no key present" to `passkey_failed { kind: not_supported }` with a message the sheet can render, and surfacing "touch your key" as a prompt
- [ ] T079 [P] [US2] Create `app-desktop/vela-wallet/src/executor/registry.rs` — the registry and index calls over the desktop HTTP client
- [ ] T080 [P] [US3] Create `app-desktop/vela-wallet/src/executor/storage.rs`: a JSON file under the platform config dir, same keys and record shapes, `keys` carried on every read and write
- [ ] T081 [US1] Create `app-desktop/vela-wallet/src/executor/mod.rs`: the exhaustive 18-operation switch, plus the 7 session operations
- [ ] T082 [US1] Rewrite `app-desktop/vela-wallet/src/onboarding.rs` to the v2 Welcome (mark, wordmark, hero, two CTAs) — the 014 in-place action-column swap goes away
- [ ] T083 [US1] Rewrite `app-desktop/vela-wallet/src/onboarding_flow.rs` as the v2 stepped flow: Name, Keys, Progress, Retry, Done, driven by `CreateView` per [data-model.md §3](./data-model.md); the `ui/` atoms are reused unchanged
- [ ] T084 [US4] Implement the key list and the three-method picker in the same module; `Platform` is unavailable on desktop (no system service) and `Hybrid` is unavailable in this feature — both explained, not hidden
- [ ] T085 [US5] Implement the v2 error sheet as a centred 400 px overlay covering all 18 outcome kinds, and the endpoint-settings surface on `endpoint_unreachable`
- [ ] T086 [US3] Wire the session machine and `allowed_route` in `app-desktop/vela-wallet/src/main.rs`, landing on the existing wallet page with the real address
- [ ] T087 [US6] Rewrite `app-desktop/vela-wallet/src/gallery.rs` fixtures to the v2 state set, keeping the `VELA_GALLERY=1` gate
- [ ] T088 [US2] Wire the login machine and the 我已有钱包 button in `app-desktop/vela-wallet/src/onboarding.rs`, including the confirmable recovery consent and the health-probe-driven endpoint surface
- [ ] T089 [US2] Verify the one-signature path on desktop with a registry-known security key: one touch, not two
- [ ] T090 Run the desktop gate: `cd app-desktop/vela-wallet && cargo check && cargo clippy --all-targets -- -D warnings && cargo test`
- [ ] T091 [US1] Manual sweep with a FIDO2 USB key: quickstart scenarios 1, 2, 4, 6, plus starting the create flow with **no** key plugged in and recovering from that sheet by plugging one in; record in `results.md`

---

## Phase 6: The uniffi bridge

**Goal**: iOS and Android can execute the machines. Blocks Phases 7 and 8.

**Independent test**: the Swift and Kotlin smoke harnesses drive a create-wallet dispatch
through the bridge and get a view back.

- [ ] T095 Enable `crux` on the `vela-core` dependency in `rust/crates/vela-core-uniffi/Cargo.toml`
- [ ] T096 Create `rust/crates/vela-core-uniffi/src/onboarding_bridge.rs`: uniffi objects exposing `dispatch(event_json) -> String`, `resolve_effect(effect_id, result_json) -> String`, `view() -> String` for the create, login and session machines, each holding its `Core<A>` and request map behind a `Mutex`; semantics identical to `rust/crates/vela-core-wasm/src/bridge.rs`, including the unknown-id rule
- [ ] T097 Regenerate the bindings and binaries: `rust/scripts/build-ios-xcframework.sh` and `rust/scripts/build-android.sh`; commit `rust/bindings/swift/` and `rust/bindings/kotlin/`
- [ ] T098 Measure the size delta against the T002 baseline and record it in `results.md`. **If the delta is unacceptable, stop and switch to the second-crate fallback in [research D2](./research.md)** rather than absorbing it silently
- [ ] T099 Rewrite the obsolete invariant in `rust/crates/vela-core/Cargo.toml` and `rust/README.md`: the `cargo tree -p vela-core-uniffi | grep -c crux # must be 0` rule was written about Hermes and the Expo app, and no longer describes native Swift and Kotlin — state what replaced it and why
- [ ] T100 Extend `rust/harness/swift/main.swift` and `rust/harness/kotlin/Harness.kt` to drive one create-wallet dispatch through the new bridge, then run `rust/scripts/smoke-swift.sh` and `rust/scripts/smoke-kotlin.sh`

---

## Phase 7: Android — `app-android/vela-wallet`

**Goal**: create and sign in on a phone, through Credential Manager.

**Independent test**: [quickstart.md](./quickstart.md) scenarios 1–7 on the `alioth` device.

- [ ] T105 [US1] Create `feature/onboarding/core/CoreDriver.kt`: the effect loop over the uniffi bridge — coroutine per effect, cancellation on `cancelled_effect_ids`, no exception may escape into the loop
- [ ] T106 [US1] Create `feature/onboarding/core/PasskeyExecutor.kt` over `androidx.credentials`: `CreatePublicKeyCredentialRequest(requestJson)` and `GetPublicKeyCredentialOption(requestJson)`, assembling the same WebAuthn JSON the web path builds — `excludeCredentials` included — and mapping provider exceptions to `FailureKind`
- [ ] T107 [P] [US2] Create `feature/onboarding/core/RegistryClient.kt` — registry and index calls, with `network` set only for a transport failure
- [ ] T108 [P] [US3] Create `feature/onboarding/core/AccountStore.kt` over DataStore, same keys and record shapes, `keys` carried on every read and write
- [ ] T109 [US1] Create `feature/onboarding/core/OnboardingExecutor.kt`: the exhaustive 18-operation switch, plus `SessionExecutor.kt` for the 7 session operations
- [ ] T110 [US1] Rewrite `feature/onboarding/WelcomeScreen.kt` to the v2 Welcome
- [ ] T111 [US1] Rewrite `feature/onboarding/flow/` to the v2 stepped flow (Name, Keys, Progress, Retry, Done) driven by `CreateView`; the `core/designsystem/components/` atoms are reused unchanged and `FlowSheet.kt` becomes the v2 error sheet
- [ ] T112 [US4] Implement the key list and the three-method picker; `Hybrid` present-but-unavailable
- [ ] T113 [US5] Map all 18 outcome kinds onto the v2 sheet, and open the endpoint-settings surface on `endpoint_unreachable`
- [ ] T114 [US3] Wire the session machine and `allowed_route` into `navigation/VelaNavHost.kt`, landing on the wallet route with the real address
- [ ] T115 [US6] Rewrite `feature/onboarding/flow/FlowFixtures.kt` and `feature/onboarding/gallery/GalleryScreen.kt` to the v2 state set
- [ ] T116 Add the new onboarding string keys to `core/i18n/I18nKeys.kt` — no literal user-visible string may appear in a composable
- [ ] T117 Verify the relying-party association: `assetlinks.json` on the production domain lists this app's package name and signing-certificate fingerprint; record the check in `results.md`
- [ ] T118 [US2] Wire the login machine and the 我已有钱包 button in `feature/onboarding/WelcomeScreen.kt` + `WelcomeViewModel.kt`, including the confirmable recovery consent
- [ ] T119 [US2] Verify the one-signature path on Android against a registry-known key
- [ ] T120 Run the Android gate: `cd app-android/vela-wallet && ./gradlew :app:testDebugUnitTest :app:assembleDebug` and the token drift test `DesignTokenDriftTest`
- [ ] T121 [US1] On-device sweep on `alioth` (serial `9d5f42fb`): quickstart scenarios 1–7; record in `results.md`

---

## Phase 8: iOS — `app-ios/VelaWallet`

**Goal**: create and sign in on an iPhone, through AuthenticationServices.

**Independent test**: [quickstart.md](./quickstart.md) scenarios 1–7 on a physical device.

- [ ] T125 Raise the deployment target to **17.4** in both `app-ios/VelaWallet/VelaWallet.xcodeproj` (`IPHONEOS_DEPLOYMENT_TARGET`) and `app-ios/VelaCoreKit/Package.swift` (`platforms: [.iOS(.v17_4)]`) — they must move together ([research D6](./research.md))
- [ ] T126 [US1] Create `Features/Onboarding/Core/CoreDriver.swift`: the effect loop over the uniffi bridge, one `Task` per effect, cancellation honoured
- [ ] T127 [US1] Create `Features/Onboarding/Core/PasskeyExecutor.swift` over `ASAuthorizationPlatformPublicKeyCredentialProvider`: registration with `excludedCredentials`, assertion with and without a credential hint, presentation anchor, and the `ASAuthorizationError` → `FailureKind` mapping
- [ ] T128 [P] [US2] Create `Features/Onboarding/Core/RegistryClient.swift` over `URLSession`
- [ ] T129 [P] [US3] Create `Features/Onboarding/Core/AccountStore.swift`, same keys and record shapes, `keys` carried on every read and write
- [ ] T130 [US1] Create `Features/Onboarding/Core/OnboardingExecutor.swift` (18 operations) and `SessionExecutor.swift` (7)
- [ ] T131 [US1] Rewrite `Features/Onboarding/WelcomeScreen.swift` to the v2 Welcome
- [ ] T132 [US1] Rewrite `Features/Onboarding/{CreatePanel,LoginPanel,FlowSheet,FlowStates}.swift` into the v2 stepped flow; the `Components/` atoms are reused unchanged and `FlowSheet.swift` becomes the v2 error sheet
- [ ] T133 [US4] Implement the key list and the three-method picker; `Hybrid` present-but-unavailable
- [ ] T134 [US5] Map all 18 outcome kinds onto the v2 sheet, and open the endpoint-settings surface on `endpoint_unreachable`
- [ ] T135 [US3] Wire the session machine and `allowed_route` into `App/RootView.swift`, landing on the wallet route with the real address
- [ ] T136 [US6] Rewrite `Features/Onboarding/FlowFixtures.swift` and `Features/Gallery/OnboardingGalleryScreen.swift` to the v2 state set
- [ ] T137 Introduce `Features/Onboarding/I18nKeys.swift` and move the inline key literals in `FlowStates.swift` / `FlowSheet.swift` into it — iOS is the one client with no centralised key file, and this feature is where that stops being tolerable
- [ ] T138 Verify the associated domain: `webcredentials:getvela.app` is in the entitlements and the apple-app-site-association file on the production domain resolves; record the check in `results.md`
- [ ] T139 [US2] Wire the login machine and the 我已有钱包 button in `Features/Onboarding/WelcomeScreen.swift` + `WelcomeModel.swift`, including the confirmable recovery consent
- [ ] T140 [US2] Verify the one-signature path on iOS against a registry-known key
- [ ] T141 Run the iOS gate: `node app-ios/scripts/gen-tokens.mjs --check`, `node app-ios/scripts/audit-literals.mjs`, and `xcodebuild -project app-ios/VelaWallet/VelaWallet.xcodeproj -scheme VelaWallet -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build test`
- [ ] T142 [US1] On-device sweep: quickstart scenarios 1–7; record in `results.md`

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T145 [US1] Cross-client address agreement (SC-003): create a multi-key wallet on one client, sign in on the other three, and confirm the address is character-identical across all four and matches the recorded golden Safe `0x88cCA0…6894`
- [ ] T146 [US6] Locale sweep (SC-009): walk each client's gallery in `zh` and `ru`; no key may render as its own name and no string may overflow its container
- [ ] T147 Mark `specs/011-crux-onboarding-state/contracts/onboarding-core.md` superseded by `specs/019-onboarding-live-wiring/contracts/shell-operations.md`, with a one-line note naming what had drifted
- [ ] T148 [P] Update `specs/014-onboarding-flow-ui/deviations.md` to record that the 014 containers and the create-flow stepped bar and elapsed ring were superseded here ([research D9](./research.md)), so the 014 report stops describing shipped UI
- [ ] T149 Write `specs/019-onboarding-live-wiring/results.md`: the gate table per platform, the measured artifact deltas from T002/T098, the manual sweep outcomes, and every deviation found along the way
- [ ] T150 Write `specs/019-onboarding-live-wiring/deviations.md` for anything that diverged from the design or the contracts, in the shape spec 014 established
- [ ] T151 Re-run every gate one last time across all five shells, and record the results in `results.md`

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
