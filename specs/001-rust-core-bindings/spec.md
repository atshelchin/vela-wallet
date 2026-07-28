# Feature Specification: Shared Rust Core (vela-core)

**Feature Branch**: `001-rust-core-bindings`

**Created**: 2026-07-28

**Status**: Approved (amended 2026-07-28 at plan review)

**Input**: User description: "Create a shared Rust core library (vela-core) for Vela Wallet that becomes the single implementation of pure, correctness-critical computation (parsing, encoding, hashing, big-integer math, data assembly/validation — no I/O, no UI, no network), distributed to all platforms via three binding routes: uniffi-rs for Kotlin (Android) and Swift (iOS), wasm-bindgen for Web (JS/TS), and uniffi-bindgen-react-native for React Native (Hermes)."

## Amendment (2026-07-28, founder decision at plan review)

The **React Native binding route (uniffi-bindgen-react-native) is dropped**. Targets are **Kotlin (Android), Swift (iOS), and Web (wasm-bindgen)** only, on **uniffi 0.32.0** (no longer held at 0.31 by the RN toolchain). Context: the founder plans to replace the app's React Native layer with native iOS/Android (and web) implementations; the Kotlin/Swift bindings produced here are built for that successor architecture. Consequence inside the current app: only the web path is wired to the core in this feature — the RN layer on iOS/Android (Hermes, no wasm) keeps the legacy TS path, which is therefore quarantined rather than deleted until the native rewrite ships.

## Why (context from codebase survey, 2026-07-28)

Today the wallet's most dangerous computations are hand-written and duplicated:

- A hand-rolled Keccak-f[1600] in `src/services/eth-crypto.ts` with a **second hand-rolled Swift copy** (`EthCrypto.swift`) — every address the user sees, and the wallet's own counterfactual address, depend on both staying in sync.
- A from-scratch dynamic ABI decoder (`src/services/abi-decode.ts`) is the trust root of clear signing — what it decodes is what the user reads before approving.
- Hand-rolled SHA-256, DER/CBOR/COSE byte parsing, and BigInt elliptic-curve math (`p256-recovery.ts`) sit on the passkey signature path.
- Counterfactual Safe address math (`safe-address.ts`) is triple-maintained (TS, Swift, byte-match constants in vela-relay).

A bug in any of these silently loses funds or makes the signing sheet lie to the user. One Rust implementation, backed by audited libraries and shared to every platform, removes the drift risk class entirely.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One verified computation core (Priority: P1)

As the wallet's maintainer, I have a single Rust library implementing the T0 computation set, proven byte-identical to the current production behavior by the existing golden-vector test suites, so that every platform can consume one verified implementation instead of maintaining parallel hand-rolled copies.

**Why this priority**: This is the foundation — without a conformance-proven core, wiring any platform to it would be a regression risk instead of a correctness win. It also delivers standalone value immediately: the Rust test suite becomes a cross-check oracle for the existing TS/Swift code even before any wiring.

**Independent Test**: Run the Rust test suite. All golden vectors ported from the existing TS tests (`eth-crypto`, `abi-decode`, `eip712`, `safe-address`, `attestation-parser`, `p256-recovery`, `webauthn-verify`, `hex`) pass, plus property tests for round-trip and normalization invariants. No app change required.

**Acceptance Scenarios**:

1. **Given** the existing TS golden vectors, **When** the same inputs are fed to the Rust core, **Then** outputs are byte-identical for every vector (hashes, addresses, decoded calldata trees, typed-data digests, extracted public keys, normalized signatures).
2. **Given** a malformed input (invalid hex, truncated CBOR, out-of-range DER, junk characters), **When** it is fed to the Rust core, **Then** the core returns a typed error — never a silently wrong value.
3. **Given** an existing user's passkey public key, **When** the Rust core computes the counterfactual wallet address, **Then** it equals the address the production TS code computes today, on all 12 supported chains' deployment parameters.

---

### User Story 2 - Web app runs on the core (Priority: P2)

As a web user of the wallet, all T0 computations in my session are served by the shared core, with a development-mode verification harness that runs old and new implementations side-by-side and reports any divergence, so the swap is provably safe before the old code is deleted.

**Why this priority**: Web is the cheapest binding route to stand up and the easiest to observe (console, fault-injection harness already exists). It proves the full pipeline — build, load, call, error mapping — before the heavier native routes.

**Independent Test**: Launch the web app with the dev verification flag on; exercise wallet creation, address display, a dApp signing flow, and a passkey assertion; the diff log shows zero mismatches.

**Acceptance Scenarios**:

1. **Given** the web app with the core enabled, **When** a user creates a wallet, views addresses, and signs a dApp transaction, **Then** all displayed addresses, decoded calldata, and signature payloads are identical to the previous implementation's output.
2. **Given** the core fails to load (corrupted asset, unsupported browser), **When** the app starts, **Then** the app either falls back to the existing implementation or surfaces a clear failure — never a half-initialized state that computes wrong values.

---

### User Story 3 - Kotlin/Swift bindings ready for the native apps (Priority: P3)

As the wallet's maintainer preparing to replace the React Native layer with native iOS/Android implementations, I have uniffi-generated Kotlin and Swift bindings that are generated, compiled, and conformance-smoke-tested in CI, so the future native apps consume the same verified core from day one instead of re-hand-rolling crypto.

**Why this priority**: The native apps don't exist yet; what must exist now is proof that the bindings generate, compile, and agree with the shared corpus. **Optional stretch** (founder may cut at tasks review): point the current app's native passkey-module address math (`EthCrypto.swift` / `SafeAddressComputer.kt`) at the core via these bindings, killing the live TS↔Swift drift before the rewrite — at the cost of adding framework-linking machinery to the current app.

**Independent Test**: CI generates Kotlin and Swift bindings from the compiled library and runs a minimal harness in each language that replays the shared conformance corpus.

**Acceptance Scenarios**:

1. **Given** the compiled core library, **When** CI generates Kotlin and Swift bindings and runs the corpus smoke harness in each language, **Then** outputs are byte-identical with the Rust and web results.
2. *(Stretch only)* **Given** the current app's native modules adopt the bindings, **When** a wallet address is computed natively for the fixture passkey, **Then** it matches the TS/web value and the hand-rolled `EthCrypto.swift` Keccak is deleted.

---

### Edge Cases

- Existing users' wallet addresses MUST NOT change: counterfactual address computation is consensus-critical for accounts that already hold funds. Any divergence here is a release blocker, not a bug to triage.
- The old TS `fromHex` silently accepts junk (`'zz'` → 0); the core rejects it. Call sites that (unknowingly) relied on lenient parsing must be identified by the side-by-side harness before deletion of the TS path.
- WebAuthn attestation CBOR from exotic authenticators (indefinite-length encodings the current parser cannot handle) — the core must handle or explicitly reject them with a diagnosable error.
- DER signature edge lengths (leading zeros, high-s values) and low-s normalization must match the on-chain verifier's acceptance rules exactly.
- The current app's React Native layer (Hermes) cannot load wasm and gets NO Rust wiring in this feature: on iOS/Android the app keeps the legacy TS path until the native rewrite ships. Consequence: legacy TS is quarantined (no new callers; edits require regenerating the conformance corpus) rather than deleted, and the wasm asset must never leak into the native bundle (web-only wrapper file).
- Big integers do not cross language boundaries natively: all amounts/scalars cross the boundary as strings or byte arrays, never floating point.
- Binding-layer failure (library missing, load race before first call) must fail loud at startup, not lazily during a signing flow.
- MAIN-world injected scripts (Safari extension inpage, in-app browser provider) and third-party SDK consumers cannot load the core; they stay on their existing dependency-free JS by design.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single shared library implementing the T0 computation set: hex and base64url codecs; JSON-RPC quantity canonicalization; keccak256 and SHA-256 hashing; EIP-55 checksum addresses; function selectors; CREATE2 address computation; calldata decoding with signature canonicalization and selector matching; EIP-712 typed-data hashing; counterfactual Safe and splitter address assembly (salt, setup data, init-code hash); WebAuthn attestation public-key extraction; DER→raw low-s signature normalization; client-data validation (create/get); and two-assertion P-256 public-key recovery.
- **FR-002**: For every input in the existing golden-vector test suites, the library's output MUST be byte-identical to the current production implementation's output.
- **FR-003**: The library MUST be consumable from three surfaces — Android (Kotlin), iOS (Swift), and Web (JS/TS) — and MUST produce identical results on all of them for a shared conformance corpus. React Native is explicitly NOT a binding target (the RN layer is scheduled for replacement by native implementations).
- **FR-004**: The library MUST reject malformed input with typed, diagnosable errors; it MUST NOT return a default or truncated value on parse failure. Intentional strictness changes versus the old implementation MUST be enumerated in the feature's documentation.
- **FR-005**: The library MUST NOT hand-roll cryptographic or codec primitives; primitives MUST come from established, widely audited third-party implementations.
- **FR-006**: A development-mode verification harness MUST run the old and new implementations side-by-side on real app flows, log any divergence, and be switchable at runtime (integrating with the existing `vela.*` fault-injection console on web).
- **FR-007**: Once the web path switches to the core, legacy TS implementations of the T0 set MUST be quarantined (byte-frozen: no new callers; any edit requires regenerating the conformance corpus) and MUST be deleted when their last consumer — the RN native layer — is replaced by the native apps. The parallel Swift copy is deleted by the Story 3 stretch or, at latest, by the native rewrite. Any deletion is gated on: conformance suite green on all three surfaces AND zero side-by-side mismatches across the verification checklist of app flows (wallet creation, address display, dApp signing, passkey assertion, recovery).
- **FR-008**: Binding generation MUST be reproducible from a clean checkout via documented commands. If the current app adopts the Kotlin/Swift bindings (Story 3 stretch), that wiring MUST survive a clean checkout and prebuild without manual steps (the repository does not commit generated native projects).
- **FR-009**: The library MUST include property-based tests for round-trip invariants (hex, base64url), normalization idempotence (checksum, quantity, low-s), and decoder robustness against adversarial bytes.
- **FR-010**: The library and all binding artifacts MUST build and test in CI without requiring a device (host-native tests plus web-target build at minimum).

### Key Entities

- **Decoded value tree**: language-neutral representation of decoded calldata (kind, value, children) that renders identically on every platform's signing sheet.
- **P-256 public key**: x/y coordinate pair extracted from attestation or recovered from assertions; input to address derivation.
- **WebAuthn assertion**: authenticator data, client data, signature — the raw material of every wallet signature.
- **Safe address info**: derived address plus the assembly ingredients (salt nonce, setup data, init-code hash) that on-chain deployment must reproduce.
- **Core error**: single flat error type distinguishing malformed input, unsupported encoding, and internal invariant failure, mapped natively on each platform.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing golden vectors pass against the shared core, and the conformance corpus produces byte-identical results on Kotlin (Android), Swift (iOS), and Web.
- **SC-002**: On the web path, every T0 computation is served by exactly one implementation; the parallel Swift crypto implementation is deleted by the Story 3 stretch or, at latest, by the native rewrite; full legacy-TS deletion follows the RN layer's replacement.
- **SC-003**: Zero divergences reported by the side-by-side harness across the verification checklist of app flows before the web path switches over; zero address changes for existing accounts.
- **SC-004**: Signing-path computations on web are no slower than today; the known hot spot (P-256 public-key recovery, currently BigInt elliptic-curve math) is measurably faster — verified on web now, on native when the native apps adopt the core.
- **SC-005**: A contributor can build and test the core with standard toolchain commands on a clean machine in under 10 minutes, without a device.

## Assumptions

- **Technology mandate (from the requester, fixed — amended 2026-07-28)**: implementation language is Rust; binding routes are uniffi-rs 0.32 (Kotlin/Swift) and wasm-bindgen (Web). React Native gets no binding — the founder is replacing the RN layer with native iOS/Android/web implementations, and the Kotlin/Swift bindings target that successor architecture.
- **Crate location**: a new top-level `rust/` workspace containing the `vela-core` crate (created with cargo). Exact layout is a plan-phase decision the requester can override.
- **Scope is the survey's T0 tier only.** T1 (Safe transaction-hash kernels, approval-guard rewrite, Tempo fee math, EIP-681 amount kernel, WalletPair crypto, transfer-log decoding, unit formatting) and T2 candidates are explicitly out of scope for v1 and become follow-up features once the pipeline is proven.
- **Explicitly not ported** (survey-rejected): network orchestration (selector registry, bundler service, public-key index), configuration data tables (local descriptors — shipped as data the core parses, not code), MAIN-world injected scripts, `vela-sdk` (third-party TS consumers), chrome-extension codec.
- **Behavioral strictness is allowed to improve**: where the old code silently accepts malformed input, the core rejects it; each such change is enumerated and validated via the side-by-side harness rather than blindly replicated.
- **Existing TS test suites are the behavioral source of truth** for the port; where TS and Swift copies disagree, TS (the shipping web/RN path) wins and the discrepancy is documented.
- **Rollout order**: conformance-tested core first, then Web wiring, then Kotlin/Swift binding artifacts (+ optional current-app native-module stretch) — the app keeps building unchanged until each wiring step, and only web is wired in this feature.
- **Cross-repo consumers** (vela-relay/bundler sharing Tempo constants and splitter creation-code) are a natural T1 follow-up, not part of v1.
