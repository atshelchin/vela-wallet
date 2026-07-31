# Quickstart: build & validate the identicon core

**Date**: 2026-07-30 · Validation guide for [plan.md](./plan.md); scenario→artifact
mapping in [spec.md](./spec.md) User Stories.

## Prerequisites

- Rust 1.97+ (repo dev machine: 1.97.1 ✓), pinned by `rust/rust-toolchain.toml`
- Node 22 + `npm ci` — required, because both the artwork table and the conformance
  corpus are generated from the installed `identicons-esm@1.0.1` package
- `wasm-pack` 0.15.0 — only for the web binding step

## Story 1 — exact core, proven (no app changes)

```bash
# 1. Generate the artwork table from the installed package (FR-009).
#    Re-runnable and idempotent: a diff here means the dependency changed.
npm ci
node scripts/gen-identicon-features.mjs      # -> rust/crates/vela-core/src/identicon_features.rs
git diff --stat rust/crates/vela-core/src/identicon_features.rs   # expect: no change

# 2. Extract the conformance corpus from the same package.
npm run dump:vectors                          # -> rust/crates/vela-core/tests/vectors/identicon*.json
git diff --stat rust/crates/vela-core/tests/vectors/              # expect: no change

# 3. Build & test.
cd rust
cargo fmt --check && cargo clippy --workspace -- -D warnings
cargo test -p vela-core
```

**Expected**: the `identicon` suite green, including
`identicon::known-answer/test` proving `make_hash("test") == "39522148458090"` — the
library's own published snapshot, and the fastest signal that the float pipeline is
right. A red conformance test is a byte divergence from the avatars users already
have: **do not proceed**.

The corpus that backs SC-001 is the 200,000-row bulk suite:

```bash
cargo test -p vela-core --release identicon_bulk    # ~200k hashes; run in release
```

## Story 1b — the properties the corpus cannot express

```bash
cargo test -p vela-core --release proptest_identicon
```

Asserts: no input panics; repeated calls are stable; `acc` stays in `(0, 0.5]`; every
section index lands in `1..=21`; and — the load-bearing one — the compile-time chaos
table equals the runtime loop bit-for-bit for all 131 entries (research D4). If a
toolchain upgrade ever broke const-eval float determinism, this is what catches it
before users see new faces.

## Story 3 — the performance budget (SC-004/SC-005)

```bash
cargo test -p vela-core --release identicon_bench -- --nocapture
```

**Expected output shape**:

```text
make_hash            (42-char address):   ~0.0X µs/call    [budget: none, must be < svg]
identicon_svg_circular:                   ~0.Xx µs/call    [budget: < 2.0 µs, target < 1.0]
allocations per identicon_svg_circular:   1                [budget: 1]
```

The allocation count is asserted, not printed for eyeballing: the test installs a
counting global allocator and fails if assembly allocates more than once. That is the
only way SC-004's "at most one heap allocation" stays true under refactoring.

Flat-memory (SC-005) is structural rather than measured — the crate has no mutable
state — and is guarded by a test that the module declares no `static mut`, no
`OnceLock`, and no interior mutability.

## Story 2 — the four platforms

```bash
# Web (and the current Expo app's web path)
npm run build:wasm && npm run verify:wasm

# Kotlin / Swift binding generation + corpus smoke
cd rust
cargo build --release -p vela-core-uniffi
cargo run -p vela-core-uniffi --bin uniffi-bindgen -- generate \
  --library target/release/libvela_core_uniffi.dylib --language kotlin --out-dir /tmp/ibind
cargo run -p vela-core-uniffi --bin uniffi-bindgen -- generate \
  --library target/release/libvela_core_uniffi.dylib --language swift  --out-dir /tmp/ibind

# Desktop needs no binding at all — it is a Rust crate:
#   vela-core = { path = "../../rust/crates/vela-core" }
#   use vela_core::identicon::identicon_svg_circular;
```

## Verifying the app migration (SC-003)

The check that matters is not "does it render" but "is it the same bytes as before".
Run both implementations over the app's real account fixtures and diff:

```bash
node scripts/verify-identicon-parity.mjs
```

Compares `identicons-esm` (via the current `Identicon.tsx` assembly) against the
core's `identicon_svg_circular` for every fixture address. **Expected: zero
differences.** One difference means an existing user's avatar would change — a release
blocker, per the spec's Edge Cases.

## When a test goes red — reading the failure

| Symptom | Almost certainly |
|---|---|
| `known-answer/test` fails, everything else too | the chaos loop's multiply order was changed, or `mul_add` crept in (research D8) |
| Only long-seed cases fail | the `Number::toString` exponential branch — check `ryu-js` is still doing the formatting |
| Only emoji/astral cases fail | the code-unit rule (research D3): `ch as u32` was used instead of the leading surrogate |
| Only `full-svg` cases fail, params pass | assembly — fragment order, or a missing/extra attribute |
| Section artwork mismatch | the table drifted from the package; re-run `gen-identicon-features.mjs` and read the diff |
| `const`-table property test fails | toolchain change broke const-eval float determinism. **Stop.** Switch to a runtime table before shipping |
