# Phase 0 Research: Shared Rust Core (vela-core)

**Date**: 2026-07-28 · **Method**: 6 parallel researchers (5 web-verified against crates.io/docs.rs/npm/GitHub as of today, 1 local repo recon). One decision (P-256 recovery) was verified by **compiling and running a probe crate locally**, not just reading docs.

## ⚠ Amendment — 2026-07-28 plan review (founder decision)

**React Native / ubrn is dropped; uniffi moves to 0.32.0.** Targets: Kotlin, Swift, Web. The RN layer will be replaced by native implementations, so the 0.31 pin (which existed ONLY because ubrn hard-pins it) is void. Consequences:

- **D1 revised**: pin `uniffi = "0.32.0"` (latest stable, 2026-06-30). Proc-macro mode unchanged.
- **D3 dropped**: no `packages/vela-core-rn`, no create-react-native-library, no ubrn config, no Expo-55 spike. (Section kept below for the record; do not implement.)
- **D4 reversed**: uniffi 0.32 supports recursive records (PR #2834) — the FFI ships the **natural recursive `AbiValue`** (Swift gets `indirect`); the flattened `AbiTree`/`AbiNode` DTO, index validation, and flatten/unflatten adapters are all deleted from the design. tsify handles the same recursion on wasm.
- **D5 note**: uniffi 0.32's tightened "Kotlin error classes inherit Throwable" behavior now applies directly.
- **Open questions 1, 3, 4, and 7 are closed** (all were ubrn-shaped). Remaining spikes: wasm binary size (#2), EIP712Domain guard test (#5), sha2/digest interop re-verify at workspace assembly (#6).
- wasm-bindgen 0.2.126 has no coexistence concern anymore (the 0.2.100 note was ubrn's pin).
- Current-app consequence: RN layer (Hermes) gets no Rust wiring — legacy TS quarantined until the native rewrite; spec FR-007 amended accordingly.

## Version pin table (single source of truth for Cargo.toml / package.json)

| Dependency | Pin | Why this exact version |
|---|---|---|
| uniffi | **0.32.0** | Latest stable (2026-06-30); recursive records (PR #2834); ~~=0.31.0 ubrn pin~~ void — RN route dropped by amendment |
| ~~uniffi-bindgen-react-native~~ | ~~0.31.0-3~~ | **Dropped by amendment** — RN is not a binding target |
| wasm-bindgen | 0.2.126 | Current stable (2026-06-24) |
| wasm-pack | 0.15.0 | Current stable (2026-05-15); runs wasm-opt by default in --release |
| tsify | 0.5.6 | Original madonoharu crate (resumed maintenance, overtook tsify-next); TS type generation from Rust types |
| serde-wasm-bindgen | 0.6.5 | Value conversion under tsify |
| alloy-primitives | 1.6.1 | keccak256, EIP-55 `to_checksum`, `Address::create2`, U256/quantity serde (2026-07-16 release train) |
| alloy-dyn-abi | 1.6.1 (feature `eip712`) | Runtime calldata decode + `TypedData::eip712_signing_hash()` |
| alloy-json-abi | 1.6.1 | `Function::parse` (human signatures) + canonical `signature()` |
| p256 | 0.14.0 (default-features=false, features `ecdsa`,`alloc`) | Stable 2026-07-03; recovery works (probe-verified) |
| ecdsa | 0.17.0 (default-features=false, features `der`,`alloc`) | DER parse + `normalize_s` + `RecoveryId` |
| sha2 | 0.11.0 | alloy exports NO sha256; new major over 0.10 — probe lockfile confirms coexistence with p256 0.14 line |
| ciborium | 0.2.2 (default-features=false) | CBOR; serde_cbor is deprecated (RUSTSEC-2021-0127) |
| coset | 0.4.2 (default-features=false) | Google-maintained COSE_Key parsing (0.4.2 = 2026-03-02) |
| thiserror | 2.x | Error derive |
| Rust toolchain | 1.97.x (installed locally) | wasm32-unknown-unknown + aarch64-apple-ios-sim targets already installed |

## D1 — uniffi version & mode

**Decision**: Pin `uniffi = "=0.31.0"` workspace-wide; proc-macro mode exclusively (`uniffi::setup_scaffolding!()` + `#[uniffi::export]` + `#[derive(uniffi::Record/Enum/Error)]`), no UDL file.

**Rationale**: ubrn 0.31.0-3 (the only RN route) pins exactly `=0.31.0` for uniffi/uniffi_bindgen/uniffi_core/uniffi_meta; uniffi checksums are version-coupled so mixing versions fails at runtime. Proc-macro mode is fully supported since 0.31.0 and is what ubrn examples use.

**Alternatives rejected**: uniffi 0.32.0 (latest, has automatic recursive-record support we'd love — blocked until ubrn ships a 0.32 line; watch for `v0.32.0-n` releases); UDL mode (duplicate interface file, higher churn).

## D2 — Crate layout: three crates, not feature flags

**Decision**: `rust/` cargo workspace with **`vela-core`** (100% pure, zero FFI deps, `crate-type=["lib"]`), **`vela-core-uniffi`** (thin shell, `crate-type=["cdylib","staticlib","lib"]`, uniffi proc-macros re-exporting core; also carries the `[[bin]] uniffi-bindgen` target), **`vela-core-wasm`** (thin shell, `crate-type=["cdylib"]`, wasm-bindgen+tsify).

**Rationale**: This is the established ecosystem pattern (matrix-sdk-crypto / -ffi / -wasm). Feature-gating one crate fails on two hard conflicts: `[lib] crate-type` cannot vary per target (uniffi needs cdylib+staticlib, wasm wants lean cdylib), and `#[uniffi::export]` on impl blocks + `setup_scaffolding!` can't be cleanly `cfg_attr`-gated across a whole API. Workspace `[workspace.dependencies]` keeps the three Cargo.tomls in lockstep.

**Alternatives rejected**: single crate with `uniffi`/`wasm` features (attribute-macro gating breaks down); ubrn's own `build web` wasm route (we use direct wasm-bindgen per the mandate; avoids ubrn's wasm-bindgen 0.2.100 pin and its `wasm-unstable-single-threaded` feature).

## D3 — RN integration shape: library package + autolinking, NOT an app config plugin

**Decision**: Create **`packages/vela-core-rn`** with `create-react-native-library` (Turbo module, C++, iOS+Android template) + `ubrn.config.yaml` pointing at `rust/` (`rust: {directory, manifestPath}`). ubrn generates ALL native wiring **inside the library**: podspec, build.gradle (cmake+codegen), CMakeLists.txt, cpp-adapter, C++ JSI bindings, Kotlin/ObjC install modules, TS API. Expo prebuild's ordinary autolinking picks the package up. **No app-level config plugin needed** — `plugins/with-native-modules.js` stays untouched.

**Rationale**: Verified from ubrn's command-line/config/turbo-module-files references: `ubrn build android --and-generate` (cargo-ndk per target → jniLibs) and `ubrn build ios --and-generate` (xcframework via xcodebuild) emit a self-contained library. ubrn is new-arch-only (TurboModule used just for install; real calls go over generated C++ JSI into Hermes) and its nightly compat CI shows **RN 0.83.10 green on iOS+Android (run dated 2026-07-28)**. Expo evidence: issue #295 (closed 2025-12) proves Expo 54 consumption; #195 (open) documents monorepo/workspace friction (library `prepare` build step, tsconfig tweaks).

**Alternatives rejected**: hand-rolled app config plugin driving cargo-ndk/xcodebuild (duplicates what ubrn's library template emits; fights gitignored `android/`/`ios/`); old-arch (not an option on RN 0.83/new arch).

**Sequencing constraint**: `ubrn build ios|android` must run **before** `expo prebuild` + native build so xcframework/jniLibs exist — belongs in npm scripts, documented in quickstart.

## D4 — Recursive decoded-calldata tree across FFI: flattened node array

**Decision**: FFI DTO is `AbiTree { nodes: Vec<AbiNode>, root: u32 }`, `AbiNode { kind, value, children: Vec<u32> }` (indices). The true recursive enum stays internal to `vela-core`; flatten/unflatten adapters at each boundary; unflatten validates indices (range + acyclicity). **Same flattened contract on wasm too** (even though tsify could do recursion) so all platforms share one wire shape and one vector format.

**Rationale**: uniffi recursive records land only in **0.32.0** (PR #2834, merged 2026-03-19); we're held at 0.31.0 by ubrn. Flattened arrays keep full typing in Kotlin/Swift/TS; JSON strings would need per-language parsers and double-encode cost on Hermes.

**Alternatives rejected**: JSON string across FFI; split 0.31/0.32 workspace; depth-limited manual types. **Spike noted**: a Vec-indirected record *might* already work on 0.31 for our exact trio — 30-min spike allowed during implementation, but the flattened contract stands unless it passes on ALL THREE routes.

## D5 — Errors across FFI

**Decision**: One crate-wide flat error enum `CoreError` (`#[derive(Debug, thiserror::Error, uniffi::Error)]` + `#[uniffi(flat_error)]` in the uniffi shell; tsify enum on wasm), variants carrying only a message. Every exported fn returns `Result<T, CoreError>`.

**Rationale**: uniffi errors must be enums implementing `std::error::Error`; flat errors surface as sealed exception classes in Kotlin (note the `Error`→`Exception` rename) and `Error`-conforming enums in Swift. A parsing/hashing crate needs variant + message, not structured payloads.

**Risk to test early**: Kotlin flat-error Display-message quirk (uniffi issue #2699) — verify one variant's message end-to-end on the Xiaomi device.

## D6 — Binding generation in CI

**Decision**: `[[bin]] uniffi-bindgen` in `vela-core-uniffi` with `fn main() { uniffi::uniffi_bindgen_main() }` (uniffi `cli` feature on the bin). CI: build cdylib, then `cargo run --bin uniffi-bindgen generate --library <libvela_core_uniffi.{so|dylib}> --language kotlin|swift --out-dir …` (library mode, docs-recommended). For iOS/Android native consumers later, ubrn's `--native-bindings` flag emits the same upstream-generated Kotlin/Swift alongside the RN artifacts — both routes coexist from the one crate.

## D7 — wasm loading on metro/Expo web

**Decision**: `wasm-pack build --target web`, then a **postbuild script** that (a) base64-embeds the `.wasm` and calls `initSync({module})` from a web-only wrapper (`src/services/vela-core/index.web.ts`), and (b) strips/neutralizes the `import.meta.url` fallback line in the generated glue, asserting the expected pattern exists (loud failure on wasm-bindgen upgrades). `pkg/` output committed in-repo (e.g. `rust/pkg-web/`), imported by relative path — never via node_modules (CF Pages drops `node_modules` paths; that's exactly why `scripts/fix-cf-pages-assets.js` exists).

**Rationale**: metro 0.83.6 (installed) has no wasm-ESM support (`--target bundler` is out); repo precedent: `src/components/QRScanner.tsx:70` documents metro choking on import.meta (zbar-wasm loaded from CDN as the workaround). Base64-sync-init sidesteps metro assetExts, CF Pages pathing, MIME types, and async-init races entirely. Repo has **no babel.config.js**; adding one to set babel-preset-expo `unstable_transformImportMeta` would be an app-wide change — kept as **fallback**, not default.

**Size guardrail**: if the wasm-opt'd binary approaches ~1MB, switch to `public/`-dir async init (open question below).

## D8 — Structured data on the wasm boundary

**Decision**: `tsify` 0.5.6 (`#[derive(Tsify, Serialize)]`, `into_wasm_abi`) for DTOs + generated TS types; all uint256/bytes cross as 0x-hex strings, never raw u64+/BigInt through serde.

**Alternatives rejected**: tsify-next (was the fork during upstream dormancy; upstream resumed), raw serde-wasm-bindgen + hand-written .d.ts (type drift), JSON strings.

## D9 — Ethereum crate APIs (verified on docs.rs 1.6.1, not from memory)

- **keccak256**: `alloy_primitives::keccak256` (+ incremental `Keccak256`); default backend = required dep `sha3 ^0.11` (pure Rust, wasm-fine). Never enable `asm-keccak`.
- **EIP-55**: `Address::to_checksum(None)` (pass `Some(chain_id)` would be EIP-1191 — we don't).
- **CREATE2**: `Address::create2(salt, init_code_hash)` — replaces hand-assembled `0xff‖deployer‖salt‖hash`.
- **Calldata decode**: `alloy_json_abi::Function::parse(sig)` (accepts both `transfer(address,uint256)` and named-param forms) → `resolve() -> DynSolCall` (cacheable) → strip 4-byte selector ourselves, compare against `Function::selector()`, `abi_decode_input(data)` → `Vec<DynSolValue>`. Decoder is fuzz-tested upstream; docs warn it's costlier than static — fine for one decode per signing sheet.
- **Canonicalization**: delete our bespoke parser — `Function::parse(sig)?.signature()` IS the canonical form; parser layer normalizes `uint`→`uint256` (verified in alloy-sol-type-parser source+tests).
- **EIP-712**: feature `eip712`: `serde_json::from_str::<TypedData>(json)?.eip712_signing_hash()`. Verified in source: handles stringified payloads (MetaMask), `primaryType == "EIP712Domain"` domain-only signing (0x1901‖separator), chainId as number/hex/decimal-string, array types. **Guard we must add**: `Eip712Domain` hashes only the five standard fields and silently ignores unknown JSON fields — vela-core must **reject** typed-data whose `types.EIP712Domain` is non-canonical (extra/reordered fields) instead of producing a divergent-looking-valid hash.
- **U256/quantity**: ruint serde already implements Ethereum Quantity semantics (minimal 0x hex out; number/hex/decimal-string in) — our `to_quantity` wraps this.
- **no_std/wasm**: alloy README commits to no_std+alloc and "full support for all wasm targets"; only landmine is the optional `getrandom` feature — never enable it.

## D10 — P-256/WebAuthn crates (probe-compiled locally: all green)

A probe crate was built and tested at `scratchpad/p256probe` (aarch64-darwin AND wasm32-unknown-unknown):

- **Recovery**: `p256::ecdsa::VerifyingKey::recover_from_prehash(prehash, sig, RecoveryId)` resolves for NistP256 on ecdsa 0.17 (recovery went curve-generic in 0.16; historically k256-only). Two-assertion recovery = trial `RecoveryId::from_byte(0..=3)` per assertion, intersect candidates (`VerifyingKey: PartialEq`) — **`two_assertion_recovery_intersection` test passed with unique correct key**.
- **DER**: `ecdsa::Signature::from_der` (strict DER — rejects non-minimal encodings, which is what we want) → `.normalize_s()` (0.17 returns `Self`, no-op if already low-s) → `.to_bytes()` = fixed 64-byte r‖s. No direct `der` crate dependency needed.
- **SEC1**: `VerifyingKey::from_sec1_bytes` (33B/65B), `to_sec1_point(compress)`. **0.14 renames (probe hit these as real compile errors)**: `EncodedPoint`→`p256::Sec1Point`, `ToEncodedPoint`→`ToSec1Point` — don't copy 0.13-era examples.
- **CBOR/COSE**: ciborium `from_reader` for attestationObject map → `authData` bytes; `coset::CoseKey::from_slice` for the COSE key; kty=EC2, x=Label::Int(-2), y=Label::Int(-3), crv P-256 at -1. **ED-flag edge**: trailing extension bytes make `from_slice` fail with `ExtraneousData` — measure the key's exact CBOR length first with a byte-counting `ciborium_io::Read` wrapper (probe-verified it consumes exactly one item). coset does minimal validation — we still check kty/crv/alg + 32-byte coords ourselves.
- **wasm/getrandom**: with `default-features = false` on p256/ecdsa/ciborium/coset the tree contains **zero getrandom** (verified via `cargo tree` on wasm32). Whole probe is `#![no_std]`+alloc.

## D11 — Repo integration facts (local recon, all files read in full)

- **CI**: `.github/workflows/ci.yml` = two sibling jobs (`app` node22/npm, `site` bun). Add a third sibling `rust` job: fmt --check, clippy -D warnings, `cargo test --workspace`, `cargo build --target wasm32-unknown-unknown -p vela-core-wasm` (the getrandom canary), binding-gen smoke. **Founder action**: add `rust` to branch-protection required checks.
- **Golden vectors**: all inline in test files (no fixture dir). Inventory: eth-crypto 28, hex 22, abi-decode 30, eip712 17, safe-address 18, attestation-parser 7, p256-recovery 8 (contains the only sha256 vectors), webauthn-verify 10, abi 32. Includes chain-critical vectors like `computeAddress(TEST_PUBLIC_KEY) = 0x762EdA60D3B68755c271D608644650278f88329F` (explicitly cross-referenced with iOS/Android native tests) and the SafeOp typehash. **p256-recovery tests are property-based** (WebCrypto-generated keys at runtime) — Rust port needs captured concrete fixtures via dump + its own proptest with RFC-6979 deterministic signing.
- **Vector extraction**: no tsx/ts-node installed; jest (ts-jest, `@/` alias, roots=src) is the only TS runner — dump-vectors runs as a jest-invoked script writing JSON into `rust/crates/vela-core/tests/vectors/`.
- **safe-address constants** (ALL chain-independent, embedded verbatim in Rust): SAFE_PROXY_FACTORY 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67, SAFE_SINGLETON 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762, FALLBACK_HANDLER 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99, ENTRY_POINT 0x0000000071727De22E5E9d8BAf0edAc6f37da032, SAFE_4337_MODULE 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226, SAFE_MODULE_SETUP 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47, WEBAUTHN_SIGNER 0x94a4F6affBd8975951142c3999aEAB7ecee555c2, MULTI_SEND 0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526, PROXY_CREATION_CODE (long literal), VELA_SPLITTER_FACTORY 0x4e59b44847b379578588920cA78FbF26c0B4956C, VELA_SPLITTER_SALT keccak256('vela.gas-settlement-splitter.v1'), VELA_SPLITTER_CREATION_CODE (byte-identical to vela-relay's copy — the cross-repo drift this feature eventually kills). **Preserve the derivations, not just values**: runtime code = slice after `6000396000f3fe` separator; saltNonce = keccak256(x32‖y32); setup encodes MultiSend delegatecall pair (enableModules + WEBAUTHN_SIGNER.configure with verifiers=0x100 = RIP-7212 precompile).
- **metro.config.js is stock** (first customization would be ours — avoided by the base64 route). Existing deps include @noble/hashes+curves+ciphers (candidates to eventually drop from web bundle).

## Open questions → resolved as implementation spikes (tracked in tasks)

1. **ubrn + Expo SDK 55 prebuild/autolinking**: community-proven on Expo 54, not 55 — first RN task is a smoke spike in parallel-space before deeper wiring. (Kill criterion for Story 3's shape; Stories 1–2 unaffected.)
2. **Wasm binary size** with dyn-abi+serde_json+p256+coset: measure right after the wasm crate exists; ≥~1MB ⇒ switch D7 to async `public/` route.
3. **uniffi 0.31.2 vs =0.31.0**: check whether ubrn accepts patch bumps; until verified stay at =0.31.0.
4. **Recursive record spike on 0.31** (D4): only if cheap; flattened contract is the default.
5. **EIP712Domain non-canonical payloads**: add the reject-guard + unit test before shipping (D9).
6. **sha2 0.11/digest interop across alloy(sha3)+p256 lines**: probe lockfile says fine; re-verify at workspace assembly.
7. **ubrn production-readiness disclaimer** ("early development") vs green RN 0.83.10 nightly CI: mitigation = our own conformance corpus + FFI round-trip fuzz, not the project's word.
