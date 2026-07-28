# Quickstart: build & validate vela-core

**Date**: 2026-07-28 · Validation guide for [plan.md](./plan.md); scenario→artifact mapping in [spec.md](./spec.md) User Stories.

## Prerequisites

- Rust 1.97+ (repo dev machine: 1.97.1 ✓) with targets: `wasm32-unknown-unknown` ✓, `aarch64-apple-ios-sim` ✓
- `wasm-pack` 0.15.0 (`cargo install wasm-pack`) — Story 2+
- Node 22 + `npm ci` (already the repo baseline) — vector dump
- Story 3 smoke harnesses: JDK/Kotlin compiler (Android Studio toolchain already present for the app), Xcode Swift toolchain ✓. Stretch only: `cargo install cargo-ndk` + NDK for .aar packaging, `aarch64-apple-ios` target for device xcframework

## Story 1 — core + conformance (no app changes)

```bash
# 1. Extract the golden-vector corpus from the running TS oracle
npx jest --ci scripts/dump-vectors            # writes rust/crates/vela-core/tests/vectors/*.json

# 2. Build & test the workspace
cd rust
cargo fmt --check && cargo clippy --workspace -- -D warnings
cargo test --workspace                        # conformance.rs (vectors) + proptests.rs
```

**Expected**: all suites green; `conformance::safe::computeAddress/fixture-key` proves `0x762EdA60D3B68755c271D608644650278f88329F` (the TS/iOS/Android-cross-referenced identity vector). A red conformance test = byte divergence from production behavior = do not proceed.

```bash
# 3. Binding-generation smoke (proves the uniffi surface is generatable)
cargo build --release -p vela-core-uniffi
cargo run -p vela-core-uniffi --bin uniffi-bindgen -- generate \
  --library target/release/libvela_core_uniffi.dylib --language kotlin --out-dir /tmp/ubind
cargo run -p vela-core-uniffi --bin uniffi-bindgen -- generate \
  --library target/release/libvela_core_uniffi.dylib --language swift --out-dir /tmp/ubind
```

## Story 2 — web route

```bash
cd rust && wasm-pack build --target web crates/vela-core-wasm   # + postbuild: base64-embed, strip import.meta, emit rust/pkg-web/
npx tsc --noEmit                                                # facade + generated TS types typecheck
npm run web                                                     # dev: vela.velaCoreDiff(true) in console → exercise flows
npm run build:web                                               # prod export must stay green (CF Pages pathing)
```

**Expected**: wasm-opt'd binary well under 1MB (measure — research open question #2; ≥1MB triggers the async-asset fallback); with the diff flag on, wallet-create → address display → dApp sign → passkey assertion logs **zero mismatches**; a deliberately broken wasm asset must fail loud at startup, not compute wrong values (spec US2 scenario 2).

## Story 3 — Kotlin/Swift bindings for the future native apps

```bash
cd rust
cargo build --release -p vela-core-uniffi
# Generate both languages from the compiled library (same commands as the Story 1 smoke)
cargo run -p vela-core-uniffi --bin uniffi-bindgen -- generate \
  --library target/release/libvela_core_uniffi.dylib --language kotlin --out-dir bindings/kotlin
cargo run -p vela-core-uniffi --bin uniffi-bindgen -- generate \
  --library target/release/libvela_core_uniffi.dylib --language swift --out-dir bindings/swift
# Corpus smoke harnesses (replay tests/vectors/*.json through each language)
./scripts/smoke-kotlin.sh   # kotlinc harness against the cdylib
./scripts/smoke-swift.sh    # swift harness against the dylib/xcframework
```

**Expected**: both harnesses replay the full conformance corpus byte-identically (SC-001); Kotlin flat-error message renders the thiserror Display text (uniffi #2699 check). *(Stretch, only if approved at tasks review)*: current app's `EthCrypto.swift`/`SafeAddressComputer.kt` internals re-pointed at the bindings; fixture-passkey address matches TS/web on device; hand-rolled Swift Keccak deleted.

## CI (added as third sibling job in .github/workflows/ci.yml)

fmt → clippy `-D warnings` → `cargo test --workspace` → `cargo build --target wasm32-unknown-unknown -p vela-core-wasm` (getrandom canary) → bindgen smoke (kotlin+swift). Founder: add `rust` to branch-protection required checks.
