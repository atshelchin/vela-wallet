# vela-core — the wallet's shared computation core

Pure, deterministic, correctness-critical computation for Vela Wallet: parsing,
encoding, hashing, big-integer math, data assembly and validation. No I/O, no
network, no UI, no randomness. One implementation, four surfaces.

Feature spec and design docs: [`specs/001-rust-core-bindings/`](../specs/001-rust-core-bindings/).
[`contracts/core-api.md`](../specs/001-rust-core-bindings/contracts/core-api.md)
is the authoritative API surface and the list of intentional behavior changes.

## Why this exists

Before this crate, the wallet hand-rolled Keccak-256 (twice — TypeScript *and* a
parallel Swift copy), SHA-256, a dynamic ABI decoder, and P-256 elliptic-curve
math on BigInt. Counterfactual Safe address derivation was maintained in three
places, including byte-matched constants in the bundler repo. A bug in any of
them silently loses funds or makes the signing sheet lie about what is being
approved. This crate is one implementation of that logic, wrapping audited
libraries, shared to every platform.

## Layout

```
crates/vela-core          pure logic, zero FFI dependencies
  primitives              hex/base64url/quantity, keccak256, sha256, EIP-55, CREATE2
  abi                     runtime calldata decode → recursive AbiValue
  eip712                  eth_signTypedData_v4 digest (+ declared-domain guard)
  safe                    counterfactual Safe & splitter address assembly
  webauthn                COSE extract, DER→low-s, client data, 2-assertion recovery
crates/vela-core-uniffi   uniffi 0.32 shell → Kotlin (Android) + Swift (iOS)
crates/vela-core-wasm     wasm-bindgen shell → the web app
pkg-web/                  GENERATED, committed — the shipped web artifact
harness/{kotlin,swift}    corpus replay through the generated bindings
scripts/                  build, verify, smoke, bench
```

**Never hand-roll a primitive.** Hashing, curve math, ABI coding and CBOR come
from alloy-core, sha2, p256/ecdsa and ciborium/coset. Exact pins live in the
workspace `Cargo.toml`; the reasoning behind each is in
[`research.md`](../specs/001-rust-core-bindings/research.md).

## Commands

| What | Command |
|---|---|
| Test the crate | `cd rust && cargo test --workspace` |
| Lint | `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings` |
| Regenerate conformance vectors | `npm run dump:vectors` (repo root) |
| Build the web artifact | `npm run build:wasm` |
| Verify the shipped web artifact | `npm run verify:wasm` |
| Kotlin bindings conformance | `rust/scripts/smoke-kotlin.sh` |
| Swift bindings conformance (macOS) | `rust/scripts/smoke-swift.sh` |
| Performance vs the legacy TS | `npm run bench:legacy && npm run bench:core` |

CI runs all of these (`rust` job on ubuntu, `rust-macos` for Swift).

## The conformance corpus

`crates/vela-core/tests/vectors/*.json` is the contract. Each case was extracted
by `scripts/dump-vectors/` from the **production TypeScript** — the behavior that
actually shipped — so a red test means a byte divergence from what users' wallets
do today, not a failed unit test. The same corpus is replayed through all four
surfaces: the crate (`cargo test`), the shipped wasm (`verify-web.mjs`), and the
Kotlin and Swift bindings (`smoke-*.sh`). All four must agree.

The identity vector — `compute_safe_address` → `0x762EdA60D3B68755c271D608644650278f88329F`,
cross-referenced with the iOS and Android test suites — is a **release blocker**:
existing users' wallet addresses must never change.

Regenerate the corpus only by re-running the dump against the TypeScript oracle,
and review the resulting diff like code. A changed expectation means either a
TypeScript bug was fixed (document it) or the oracle drifted (investigate).

## Intentional divergences

The core is stricter than the code it replaces in 20 enumerated places — junk
that used to be silently coerced now errors, and four cases where the legacy
TypeScript was simply wrong are fixed. Every one is listed in
[`contracts/core-api.md`](../specs/001-rust-core-bindings/contracts/core-api.md)
with a marked vector, or a Rust-side unit test where no oracle vector is possible
because the old output was garbage. **An un-enumerated behavior change is a bug.**

## Platform notes

- **Web** loads the module synchronously from a base64 payload (`initSync`).
  Metro cannot bundle wasm as ESM, Cloudflare Pages drops `node_modules` asset
  paths, and Metro cannot parse `import.meta` — the build script strips it and
  fails loudly if the wasm-bindgen glue ever changes shape. `pkg-web/` is
  committed on purpose; CI fails if it drifts from a fresh build.
- **The build remaps `$CARGO_HOME`.** Registry panic-location strings otherwise
  embed the builder's home directory, which both leaks into production and makes
  the artifact impossible to reproduce on another machine.
- **React Native still runs TypeScript.** Hermes has no WebAssembly, so on
  iOS/Android the app uses the quarantined legacy modules until the native
  rewrite adopts the Kotlin/Swift bindings. `src/services/vela-core/` is the
  facade that hides this; an eslint rule (covering dynamic `import()` too) keeps
  app code from reaching the legacy modules directly.

## Bumping uniffi

Bindings are checksum-coupled to the uniffi version: Kotlin, Swift and any
consumer must regenerate together, or calls fail at runtime. Bump the workspace
pin, regenerate, and run both smoke harnesses before committing.
