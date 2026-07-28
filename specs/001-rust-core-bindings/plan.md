# Implementation Plan: Shared Rust Core (vela-core)

**Branch**: `001-rust-core-bindings` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-rust-core-bindings/spec.md`

## Summary

*(Amended 2026-07-28: RN/ubrn dropped, uniffi 0.32 — see spec Amendment & research Amendment.)*

Build a three-crate Rust workspace (`rust/`) whose pure crate `vela-core` becomes the single implementation of the T0 computation set (primitives, abi, eip712, safe, webauthn), wrapping audited crates (alloy-core 1.6.1, sha2, p256 0.14, ciborium/coset) — never hand-rolling primitives. Two thin shells expose it: `vela-core-uniffi` (uniffi 0.32.0 proc-macros → Kotlin/Swift bindings for the planned native apps; recursive records supported) and `vela-core-wasm` (wasm-bindgen 0.2.126 + tsify, base64-embedded `initSync` for metro web). Correctness is proven by porting the existing TS golden vectors into a committed JSON conformance corpus (extracted by a jest-run dump script), plus property tests; only the web path is wired into the current app (behind a side-by-side diff harness) — the RN layer keeps quarantined legacy TS until the native rewrite. All decisions and exact version pins: [research.md](./research.md).

## Technical Context

**Language/Version**: Rust 1.97.x (installed; wasm32-unknown-unknown + aarch64-apple-ios-sim targets present); TypeScript ~5.9 on the app side

**Primary Dependencies**: alloy-primitives / alloy-dyn-abi(+eip712) / alloy-json-abi 1.6.1; sha2 0.11.0; p256 0.14.0 + ecdsa 0.17.0 (default-features=false); ciborium 0.2.2 + coset 0.4.2; uniffi 0.32.0; wasm-bindgen 0.2.126 + tsify 0.5.6; thiserror 2.x — full table in research.md

**Storage**: N/A (pure computation; conformance vectors are committed JSON files)

**Testing**: `cargo test --workspace` (conformance vectors + proptest); existing jest suite stays as the TS-side oracle; jest-invoked `dump-vectors` extracts the corpus; CI adds a third `rust` job (fmt/clippy/test/wasm-build/bindgen-smoke)

**Target Platform**: Web (wasm32-unknown-unknown under metro 0.83/Expo SDK 55/CF Pages) wired now; Kotlin (Android) + Swift (iOS) bindings generated/tested now for the planned native apps; macOS+Linux CI hosts

**Project Type**: multi-target library (Rust workspace) + mobile/web app integration

**Performance Goals**: signing-path calls no slower than current TS on any platform; P-256 recovery measurably faster on Hermes (today: BigInt EC math); one calldata decode per signing sheet — no hot loops

**Constraints**: uniffi 0.32.0 (recursive records supported ⇒ natural recursive `AbiValue` over FFI); the current app's RN layer (Hermes, no wasm) gets NO Rust wiring — legacy TS quarantined until the native rewrite; `android/`/`ios/` gitignored (Story 3 stretch wiring, if taken, must live in config-plugin machinery); wasm loaded via base64 initSync (metro has no wasm-ESM, CF Pages drops node_modules paths); zero getrandom in the wasm tree; existing users' Safe addresses byte-identical (release blocker)

**Scale/Scope**: ~1,400 lines of TS being replaced across 9 service files; 5 Rust modules; 172 existing TS test cases as the conformance baseline; 3 binding surfaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unfilled spec-kit template — this project has no ratified constitution yet. No project-specific gates exist. Applied spec-kit defaults in its spirit:

- **Library-first**: PASS — vela-core is a standalone, independently testable library; app wiring is last.
- **Test-first**: PASS — the conformance corpus (ported golden vectors) is committed and passing before any app path switches over; the side-by-side harness gates deletion of legacy code.
- **Simplicity**: PASS with justification — three crates instead of one is the minimal structure that satisfies conflicting `crate-type` requirements (see Complexity Tracking).

**Post-Phase-1 re-check (2026-07-28)**: no new violations introduced by the design; the only structural additions beyond the workspace are one TS facade directory and (in US3) one RN library package, each with a single responsibility.

## Project Structure

### Documentation (this feature)

```text
specs/001-rust-core-bindings/
├── spec.md                  # Approved feature spec
├── survey-2026-07-28.md     # Codebase survey (T0/T1/T2 tiers, rejections)
├── plan.md                  # This file
├── research.md              # Phase 0 — pins, verified APIs, decisions D1–D11
├── data-model.md            # Phase 1 — FFI entities & validation rules
├── quickstart.md            # Phase 1 — build/test/validate commands
├── contracts/
│   ├── core-api.md          # Phase 1 — exported FFI surface per module
│   └── conformance-vectors.md  # Phase 1 — vector JSON schema & suites
└── tasks.md                 # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
rust/                            # NEW — cargo workspace (Story 1)
├── Cargo.toml                   # [workspace] + [workspace.dependencies] pin table
├── rust-toolchain.toml
└── crates/
    ├── vela-core/               # pure logic — zero FFI deps, no_std+alloc where possible
    │   ├── src/
    │   │   ├── lib.rs
    │   │   ├── error.rs         # CoreError
    │   │   ├── primitives.rs    # hex/base64url/quantity/keccak256/sha256/checksum/selector/create2
    │   │   ├── abi.rs           # Function::parse wrapper, canonicalize, decode → recursive AbiValue
    │   │   ├── eip712.rs        # TypedData hash + EIP712Domain canonical-form guard
    │   │   ├── safe.rs          # constants + saltNonce/setupData/proxy+splitter CREATE2 assembly
    │   │   └── webauthn.rs      # attestation COSE extract, DER→raw low-s, client-data validate, 2-assertion recovery
    │   └── tests/
    │       ├── conformance.rs   # reads vectors/*.json
    │       ├── proptests.rs     # round-trips, idempotence, adversarial decode
    │       └── vectors/         # committed JSON corpus (from dump-vectors)
    ├── vela-core-uniffi/        # cdylib+staticlib+lib; setup_scaffolding + #[uniffi::export] shims
    │   └── src/lib.rs, uniffi-bindgen.rs ([[bin]])
    └── vela-core-wasm/          # cdylib; #[wasm_bindgen] + tsify DTOs
        └── src/lib.rs

rust/pkg-web/                    # committed wasm-pack output (postbuild-patched, base64-embedded)

src/services/vela-core/          # Story 2 — TS facade (single import point for the 9 legacy files)
├── index.ts                     # native (Hermes) path: delegates to quarantined legacy TS until the native rewrite
├── index.web.ts                 # web path: wasm initSync(base64) → Rust
├── types.ts                     # shared TS types mirroring contracts/core-api.md
└── diff-harness.ts              # side-by-side old/new comparison, wired to vela.* dev console (web)

scripts/dump-vectors/            # jest-invoked TS→JSON golden-vector extraction

.github/workflows/ci.yml         # + third sibling `rust` job (incl. Kotlin/Swift bindgen + corpus smoke)
```

**Structure Decision**: Three-crate workspace per research D2 (matrix-sdk pattern) — the pure crate never learns about FFI; each shell owns exactly one binding technology. App-side, one facade directory (`src/services/vela-core/`) is the single import point for the 9 legacy service files being replaced, so the eventual TS deletion (FR-007) is a facade re-point, not a 50-file sweep.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 crates instead of 1 | uniffi needs `crate-type=["cdylib","staticlib"]`, wasm wants lean `cdylib`, and `[lib]` can't vary per target; `#[uniffi::export]`/`setup_scaffolding!` can't be `cfg_attr`-gated across an API surface | Single feature-gated crate breaks on crate-type conflict and attribute-macro gating; ecosystem precedent (matrix-sdk-crypto/-ffi/-wasm) validates the split |
| Committed `rust/pkg-web/` build output | metro cannot bundle wasm as ESM; CF Pages drops node_modules paths; base64-embed makes the asset pipeline moot | npm-package consumption hits the CF Pages node_modules drop; metro assetExts route adds the repo's first metro customization + async-init races |
| Legacy TS quarantined, not deleted | the RN layer (Hermes) still runs the TS bundle on iOS/Android until the founder's native rewrite ships | Deleting now would leave native with no implementation; wiring RN via ubrn was explicitly dropped by the amendment |
