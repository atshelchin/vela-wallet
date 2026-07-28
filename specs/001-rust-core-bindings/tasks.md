# Tasks: Shared Rust Core (vela-core)

**Input**: Design documents from `/specs/001-rust-core-bindings/` (spec.md as amended 2026-07-28: Kotlin/Swift/Web only, uniffi 0.32, recursive AbiValue, legacy TS quarantine)

**Prerequisites**: plan.md, spec.md, research.md (pin table + D1–D11 + Amendment), data-model.md, contracts/core-api.md, contracts/conformance-vectors.md, quickstart.md

**Tests**: INCLUDED — the conformance corpus + property tests ARE the feature's acceptance mechanism (FR-002, FR-009, SC-001), not optional extras. Corpus-first order inside each module (dump vectors → implement → green) is deliberate.

**Organization**: Phases by user story; each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable relative to its phase-mates (different files; in-module chains listed under Dependencies)
- Version pins: NEVER improvise — copy from research.md pin table

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Rust workspace skeleton that compiles empty

- [X] T001 Create `rust/` workspace: `rust/Cargo.toml` (`[workspace]`, `resolver = "2"`, `[workspace.dependencies]` copied from research.md pin table), `rust/rust-toolchain.toml` (1.97 channel), `rust/.gitignore` (`target/`), and the three member crates — `rust/crates/vela-core` (`crate-type=["lib"]`, zero FFI deps), `rust/crates/vela-core-uniffi` (`crate-type=["cdylib","staticlib","lib"]`, dep uniffi 0.32.0), `rust/crates/vela-core-wasm` (`crate-type=["cdylib"]`, deps wasm-bindgen 0.2.126 + tsify 0.5.6 + serde-wasm-bindgen 0.6.5)
- [X] T002 Fill dependency manifests: vela-core gets alloy-primitives/alloy-dyn-abi(features=["eip712"])/alloy-json-abi 1.6.1, sha2 0.11.0, p256 0.14.0 (default-features=false, features=["ecdsa","alloc"]), ecdsa 0.17.0 (default-features=false, features=["der","alloc"]), ciborium 0.2.2 + coset 0.4.2 (both default-features=false), thiserror 2.x, serde/serde_json; dev-deps proptest + hex-literal; all via `workspace = true`
- [X] T003 [P] Add `[workspace.lints]` (clippy pedantic-selected, `unwrap_used` deny in vela-core), rustfmt defaults; verify `cargo build --workspace` and `cargo build --target wasm32-unknown-unknown -p vela-core-wasm` compile empty (getrandom canary starts life green)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Error type, vector pipeline, and test harness every module task consumes

**⚠️ CRITICAL**: No user story work until this phase completes

- [X] T004 Implement `CoreError` in `rust/crates/vela-core/src/error.rs` — all variants from data-model.md table (InvalidHex … Internal, NO InvalidTree), thiserror Display messages; re-export from `lib.rs`
- [X] T005 Build dump-vectors pipeline: `scripts/dump-vectors/` (jest-invoked per repo recon — no tsx installed): `writer.ts` (schema per contracts/conformance-vectors.md: suite/generated/source-sha/cases), `divergences.ts` (hand-maintained list of the 4 enumerated divergences from contracts/core-api.md — the script may only read, never invent), npm script `"dump:vectors": "jest --ci scripts/dump-vectors --config scripts/dump-vectors/jest.config.js"`, output to `rust/crates/vela-core/tests/vectors/`
- [X] T006 Build Rust-side harness: `rust/crates/vela-core/tests/conformance.rs` (serde loader for the vector schema, per-`fn` dispatcher, `expect.error` → CoreError-code assertion, `divergence` cases assert the RUST behavior) and `rust/crates/vela-core/tests/proptests.rs` scaffold

**Checkpoint**: `cargo test --workspace` runs (0 vectors yet) — module work can fan out

---

## Phase 3: User Story 1 — One verified computation core (Priority: P1) 🎯 MVP

**Goal**: All five modules implemented and byte-identical to production TS per the committed corpus; uniffi surface generatable.

**Independent Test**: `npm run dump:vectors && cd rust && cargo test --workspace` all green, including the identity vector `compute_safe_address(TEST_PUBLIC_KEY) → 0x762EdA60D3B68755c271D608644650278f88329F`; bindgen smoke produces Kotlin+Swift sources. No app change.

In-module order is always: dump → implement → conformance green. Modules fan out in parallel after T009.

- [X] T007 [P] [US1] Dump primitives vectors: `scripts/dump-vectors/primitives.dump.test.ts` exercising src/services/{eth-crypto,hex,sha256}.ts (keccak256 ''/'hello', selector `setup(...)→b63e800d`, checksum, create2, toQuantity canon set, base64url, sha256 fixed+size-sweep vectors from p256-recovery.test.ts) + divergence cases (from_hex junk, to_quantity negative/garbage; empty-string `'' → 0x0` pinned as ACCEPTED) → `rust/crates/vela-core/tests/vectors/primitives.json`
- [X] T008 [US1] Implement `rust/crates/vela-core/src/primitives.rs` per contracts/core-api.md module `primitives` — thin wrappers over alloy_primitives::{keccak256, Address::to_checksum(None), Address::create2}, sha2, ruint quantity semantics; strict hex/base64url codecs
- [X] T009 [US1] Primitives green: conformance suite passes + proptests (hex/base64url round-trip, checksum & quantity idempotence)
- [X] T010 [P] [US1] Dump abi vectors from src/services/abi-decode.ts tests (30 cases incl. the nested-tuple relative-offset regression vector; recursive AbiValue JSON form) → `rust/crates/vela-core/tests/vectors/abi.json`
- [X] T011 [P] [US1] Implement `rust/crates/vela-core/src/abi.rs` — recursive `AbiValue` record; `Function::parse` → cached `DynSolCall`; selector verify-then-strip; decode → leaf rendering rules per contract (checksummed addresses, minimal 0x-hex, "true"/"false", lossy utf8); `canonicalize_signature` = `Function::parse(sig)?.signature()` (verify the `uint`→`uint256` round-trip with a unit test — research open item)
- [X] T012 [US1] Abi green: conformance + adversarial proptest (`decode_calldata` never panics on arbitrary bytes; nesting depth bounded)
- [X] T013 [P] [US1] Dump eip712 vectors from src/services/eip712.ts tests (spec Mail hash `be609aee…` WITH and WITHOUT explicit EIP712Domain in types; upgrade the shape-only asserts to captured golden hashes) + hand-written reject vectors for non-canonical `types.EIP712Domain` → `rust/crates/vela-core/tests/vectors/eip712.json`
- [X] T014 [P] [US1] Implement `rust/crates/vela-core/src/eip712.rs` — `serde_json::from_str::<TypedData>()?.eip712_signing_hash()` + the `Eip712NonCanonicalDomain` reject-guard (validate `types.EIP712Domain` field names/order against the canonical five BEFORE hashing; research D9 risk)
- [X] T015 [US1] Eip712 green: conformance incl. guard rejects and MetaMask conventions (stringified payload, domain-only primaryType, chainId as number/hex/decimal-string)
- [X] T016 [P] [US1] Dump safe vectors from src/services/safe-address.ts tests (18 cases: address/saltNonce/setupData-hash incl. TEST_PUBLIC_KEY identity vector, splitter address + deploy calldata) → `rust/crates/vela-core/tests/vectors/safe.json`
- [X] T017 [P] [US1] Implement `rust/crates/vela-core/src/safe.rs` — embed ALL constants from research.md D11 verbatim; PRESERVE DERIVATIONS not just values (runtime code sliced after `6000396000f3fe`; saltNonce = keccak256(x32‖y32); MultiSend delegatecall pair with verifiers magic `0x100`); `compute_safe_address`/`parse_public_key`(strict)/`compute_splitter_address`/`encode_splitter_deploy_call` via `Address::create2`
- [X] T018 [US1] Safe green: conformance passes — the identity vector `0x762EdA60D3B68755c271D608644650278f88329F` is a RELEASE BLOCKER gate (spec edge case: existing addresses must never change)
- [X] T019 [P] [US1] Dump webauthn vectors: port attestation-parser (7) + webauthn-verify (10) inline vectors; EXTEND the TS p256-recovery property test to also emit 8 captured concrete assertion-pair fixtures (repo-recon open item) → `rust/crates/vela-core/tests/vectors/webauthn.json`
- [X] T020 [P] [US1] Implement `rust/crates/vela-core/src/webauthn.rs` — COSE extract via ciborium+coset with exact-one-item byte-counting read (ED-flag trailing extensions; keep the `cbor_item_len` canary test), `Signature::from_der` → `normalize_s` → 64B r‖s, byte-level client-data validation (exact prefix, field order, UV flag authData[32]), `recover_public_key_from_assertions` (RecoveryId 0..=3 trial + intersection, `Ok(None)` when non-unique), `webauthn_signing_hash`; mind p256 0.14 renames (Sec1Point/ToSec1Point)
- [X] T021 [US1] Webauthn green: conformance + proptest (RFC-6979 deterministic sign in test harness → recovery returns exactly the signing key; DER edge lengths)
- [X] T022 [US1] Build `rust/crates/vela-core-uniffi/src/lib.rs` — `uniffi::setup_scaffolding!()`, `#[derive(uniffi::Record)]` on AbiValue/P256PublicKey/WebAuthnAssertion/SafeAddressInfo, `#[derive(uniffi::Enum)]` ClientDataKind, `#[uniffi(flat_error)]` CoreError, `#[uniffi::export]` wrappers for every contracts/core-api.md function; plus `rust/crates/vela-core-uniffi/uniffi-bindgen.rs` `[[bin]]` (`uniffi::uniffi_bindgen_main()`, feature `cli`)
- [X] T023 [US1] Bindgen smoke per quickstart Story 1: build cdylib, generate `--language kotlin` and `--language swift` from the compiled library into `rust/bindings/`; commit nothing generated — assert generation succeeds and Swift shows `indirect` on the recursive record
- [X] T024 [US1] Add `rust` job to `.github/workflows/ci.yml` as third sibling (per recon D1 pattern): fmt --check, clippy `-D warnings`, `cargo test --workspace`, bindgen smoke; PR body documents the founder action "add `rust` to branch-protection required checks"

**Checkpoint**: US1 = shippable MVP (a verified core + generatable bindings, zero app risk)

---

## Phase 4: User Story 2 — Web app runs on the core (Priority: P2)

**Goal**: Web path serves all T0 computation from wasm; diff harness proves zero mismatches; legacy TS quarantined.

**Independent Test**: quickstart Story 2 — diff flag on, exercise wallet-create/address/dApp-sign/passkey flows, zero mismatches; `npm run build:web` green; deliberately corrupted wasm fails loud at startup.

- [X] T025 [US2] Implement `rust/crates/vela-core-wasm/src/lib.rs` — `#[wasm_bindgen]` exports for the full contract surface, `#[derive(Tsify, Serialize)]` `#[tsify(into_wasm_abi)]` DTOs (recursive AbiValue), errors thrown as `{code, message}`; choose serde tagging deliberately and pin it with a TS-side type test
- [X] T026 [US2] Build script `rust/scripts/build-web.mjs`: wasm-pack build --target web → print wasm-opt'd size and FAIL if ≥ 1MB (research open item #2: switching to async `public/` route is the documented fallback) → base64-embed + `initSync` wrapper → strip the `import.meta.url` fallback from glue (assert the exact pattern exists first — loud break on wasm-bindgen upgrade) → emit committed `rust/pkg-web/`; add npm script `"build:wasm"`
- [X] T027 [US2] Create TS facade `src/services/vela-core/`: `types.ts` (re-export generated TS types), `index.ts` (native path: delegate to the 9 legacy TS implementations — Hermes keeps TS until the native rewrite), `index.web.ts` (wasm path: initSync at module init, fail-loud on load error per spec US2 scenario 2 — never half-initialized)
- [X] T028 [US2] Add `diff-harness.ts` in `src/services/vela-core/` + `vela.velaCoreDiff(on)` command in `src/services/dev/fault-injection.ts`: when on (web dev), every facade call runs BOTH implementations, logs structured mismatches (fn, input hash, both outputs)
- [X] T029 [US2] Divergence call-site audit: grep all callers of fromHex/toQuantity/parsePublicKey for reliance on the 4 enumerated lenient behaviors (contracts/core-api.md list); fix or explicitly annotate each; record findings in the PR description
- [X] T030 [US2] Re-point app imports of the 9 legacy services (`eth-crypto`, `hex`, `sha256`, `abi-decode`, `eip712`, `safe-address`, `attestation-parser`, `p256-recovery`, `webauthn-verify`) to `@/services/vela-core` (facade); legacy files keep their exports (native path + oracle); jest suite still green
- [X] T031 [US2] Enforce quarantine (FR-007): eslint `no-restricted-imports` rule so only `src/services/vela-core/**` (and the legacy files' own tests) may import the 9 legacy modules; banner comment on each legacy file ("QUARANTINED — byte-frozen oracle; edits require `npm run dump:vectors` + corpus review")
- [X] T032 [US2] Validation & CI: `npx tsc --noEmit`, `npx jest --ci`, `npm run build:web` all green; manual web checklist with diff flag (wallet creation, address display, dApp signing via test-dApp, passkey assertion, recovery flow) = zero mismatches; extend CI `rust` job with `cargo build --target wasm32-unknown-unknown -p vela-core-wasm` + `node rust/scripts/build-web.mjs --check` (verifies committed pkg-web is current)

**Checkpoint**: Web runs Rust; native untouched; corpus + quarantine lock the TS oracle

---

## Phase 5: User Story 3 — Kotlin/Swift bindings ready for the native apps (Priority: P3)

**Goal**: Generated bindings proven byte-identical to the corpus in both languages, in CI.

**Independent Test**: quickstart Story 3 — both smoke harnesses replay the full corpus byte-identically.

- [ ] T033 [P] [US3] Kotlin corpus smoke harness: `rust/harness/kotlin/` (small main + JNA loading the cdylib with generated bindings, replay `tests/vectors/*.json`, byte-compare) + `rust/scripts/smoke-kotlin.sh`; include one flat-error message assertion (uniffi #2699 Display-text check)
- [ ] T034 [P] [US3] Swift corpus smoke harness: `rust/harness/swift/` (SPM or single-file swiftc harness against the dylib + generated Swift, replay corpus, byte-compare, assert recursive AbiValue round-trips through `indirect`) + `rust/scripts/smoke-swift.sh`
- [ ] T035 [US3] CI wiring: kotlin smoke on the existing ubuntu `rust` job; swift smoke needs macOS — add a `rust-macos` job (or matrix) running swift smoke only, to keep the linux gate fast

**Optional stretch (DEFAULT: SKIP — founder opts in explicitly)**: adopt bindings inside the current app's native modules to kill live TS↔Swift drift early.

- [ ] T036 [US3] (stretch) iOS: xcframework build script (aarch64-apple-ios + sim targets), config-plugin linking into the prebuilt project, re-point `EthCrypto.swift`/`SafeAddressComputer.swift` internals at the bindings, delete the hand-rolled Swift Keccak; fixture-passkey address verified on simulator
- [ ] T037 [US3] (stretch) Android: cargo-ndk `.so` + generated Kotlin into the app via config plugin, re-point `SafeAddressComputer.kt`; fixture-passkey address verified on the Xiaomi test device

**Checkpoint**: Native rewrite can start on a verified core

---

## Phase 6: Polish & Cross-Cutting

- [ ] T038 [P] Write `rust/README.md`: toolchain, command reference (mirrors quickstart), corpus regeneration policy (contracts/conformance-vectors.md), pin-bump rules (uniffi regenerates all bindings together)
- [ ] T039 [P] SC-004 evidence: web console timing spot-check (keccak256, decode_calldata, recover_public_key) Rust-wasm vs legacy TS on the same inputs; numbers into the PR description
- [ ] T040 Cross-artifact closure: re-run spec checklist (`checklists/requirements.md`), confirm every FR/SC maps to a completed task, mark spec Status → Implemented (US1+US2+US3 minus explicitly-skipped stretch)

---

## Dependencies

- Phase 1 → Phase 2 → Phase 3 (strict)
- **US1 in-module chains**: T007→T008→T009; T010→T011→T012; T013→T014→T015; T016→T017→T018; T019→T020→T021. The five chains are mutually parallel AFTER T009 (primitives lands first — other modules reuse its hex/hash helpers). T022 needs all module impls (T008,T011,T014,T017,T020); T023 needs T022; T024 needs T023.
- **US2**: T025 needs US1 modules (not T022–T024); T026 needs T025; T027 needs T026; T028 needs T027; T029 independent of T025–T028 (can start with US2); T030 needs T027+T029; T031 needs T030; T032 last.
- **US3**: T033/T034 need T023's generated bindings; T035 needs both; T036/T037 (if taken) need T035.
- US2 does NOT depend on T022–T024 (uniffi) and US3 does NOT depend on US2 — they can proceed concurrently after US1.
- Polish: T038/T039 anytime after US2; T040 last.

## Parallel Execution Examples

- **US1 fan-out** (after T009): four dump tasks T010/T013/T016/T019 together; then four impl tasks T011/T014/T017/T020 together; then their conformance tasks.
- **US2 + US3 overlap**: T025–T032 (web) alongside T033–T035 (harnesses) — different files, both only need US1.
- **Solo-dev realistic order**: T001→…→T009, then module chains one-by-one (abi → eip712 → safe → webauthn), T022–T024, then US2, then US3.

## Implementation Strategy

**MVP = Phase 1–3 (US1)**: a conformance-proven core + generatable bindings with ZERO app risk — commit-worthy on its own. Then US2 delivers the first user-visible correctness win (web), and US3 readies the native-rewrite runway. Stretch tasks T036/T037 stay skipped unless the founder opts in. Suggested PR slicing: PR-1 = Phases 1–3, PR-2 = Phase 4, PR-3 = Phase 5 (+Polish), so each review gate matches a story checkpoint.
