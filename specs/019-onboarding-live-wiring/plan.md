# Implementation Plan: Live Onboarding — Create & Sign In Wired to the Core, in the v2 Flow

**Branch**: `019-onboarding-live-wiring` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-onboarding-live-wiring/spec.md`

## Summary

Give four native clients a working create-wallet and sign-in journey by driving the two
Crux state machines that already own those rules, and rebuild the flow UI to the v2
design — which adds the founding-key screen the wallet's multi-key model has needed since
spec 011 and no client has ever had.

The core work is small and precise: two changes (`ACK_COUNT` 4 → 2; a `KeyMethod` on the
add-key event, the registration request, and the key row) plus one new sans-IO module for
CTAP2, which the desktop client needs because it has no system passkey service and which
feature 020 needs on all five platforms. Everything else is client work: one side-effect
executor per client covering eighteen onboarding operations and seven session operations,
the v2 screens assembled from spec 014's existing atoms, and the session machine wired so
a wallet survives a relaunch.

Sequenced web → core CTAP → desktop → bridge → Android → iOS, so the client with the
shortest passkey path proves the shape before the ones with the longest do.

## Technical Context

**Language/Version**: Rust 1.97.1 (core, desktop) · TypeScript 5 / Svelte 5 (web) ·
Swift 5.9+ / iOS 17.4 (raised from 17.0, research D6) · Kotlin 2.2 / compileSdk 36,
minSdk 31 (Android)

**Primary Dependencies**: `crux_core` 0.19 · `uniffi` 0.32 · `wasm-bindgen` 0.2 ·
`ciborium`, `p256`, `sha2` (present) + `hkdf`, `aes-gcm` (new, RustCrypto, pure Rust) ·
`hidapi` (new, desktop only) · `androidx.credentials` (present) · `AuthenticationServices`
(iOS, system) · SvelteKit 2 + `@sveltejs/adapter-cloudflare`

**Storage**: on-device only. `vela.accounts`, `vela.activeAccountIndex`,
`vela.pendingUploads`, `vela.serviceEndpoints` — `localStorage` on web, `UserDefaults` /
Keychain on iOS, DataStore on Android, a JSON file under the platform config dir on
desktop. Byte-compatible with the shipping web client (data-model §6).

**Testing**: `cargo test -p vela-core --features crux,i18n-all` (the machines' ~88 tests
plus the new CTAP vectors) · `pnpm test:unit` + Playwright `pnpm test:e2e` (web) ·
`cargo test` (desktop) · `./gradlew :app:testDebugUnitTest` (Android) · `xcodebuild test`
(iOS) · `npx jest` + `npx tsc --noEmit` (the shipping Expo client) · the manual
seven-scenario sweep in [quickstart.md](./quickstart.md), which is the only proof of
SC-001 to SC-004

**Target Platform**: browsers (Cloudflare Workers for delivery) · iOS 17.4+ · Android 12+
(API 31) · macOS, Windows, Linux desktop

**Project Type**: multi-client application over one shared Rust core — five shells, one
set of rules

**Performance Goals**: no regression to the prerendered Welcome page; the 3,461,984-byte
wasm artifact is fetched **only** on a create or sign-in intent, never on Welcome
(research D5). Core view rendering stays allocation-light; the machines are already
measured in microseconds.

**Constraints**: the core stays pure — no clock, no randomness, no I/O; failures cross the
boundary as variants, never exceptions; no user-visible string is hard-coded; no colour,
spacing, radius or type value outside the token source; generated artifacts
(`rust/pkg-web`, `src/services/onboarding-core/generated`, `i18n_catalogs`, `tokens.css`,
`Tokens.swift`) are regenerated, never hand-edited.

**Scale/Scope**: 5 shells · 2 core state machines + 1 session machine · 18 onboarding
operations + 7 session operations per client · 5 screens + 1 sheet pattern per client ·
18 outcome kinds · 32 new + 15 rewritten + 6 removed translation keys × 15 locales ·
1 new core module (CTAP2) · 1 new uniffi bridge

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled Spec Kit template — there are no
ratified project principles. Following the precedent set by spec 018's plan, the de-facto
rules from specs 006–018 plus `agent-rules/AI-CODING-RULES.md` are applied as the gate.

| Rule | This feature |
| --- | --- |
| **One authoritative implementation per capability per platform** | ✅ The whole point. Rules live only in `vela-core`; each client gets exactly one executor and one flow UI. The v2 screens **replace** the 014 panels rather than sitting beside them. |
| **Tokens only — no literal colours, spacing, radii, type** | ✅ v2's values resolve onto `docs/design-tokens.json` unchanged; no new tokens (spec, Design Authority). |
| **i18n through vela-core; no hard-coded strings** | ✅ [contracts/i18n-keys.md](./contracts/i18n-keys.md); FR-025. |
| **Generated files are regenerated, not hand-edited** | ✅ `gen:i18n`, `gen:core-types`, `build:wasm`, `gen-tokens` all re-run and their outputs committed; `--check` variants gate CI. |
| **Fixtures are the single canon for UI state** | ✅ each client's gallery keeps one fixture set, now covering v2 rather than the 014 containers. |
| **Components are pure: strings and models in, elements out** | ✅ the 014 atoms are reused unchanged; only containers and screen composition are rebuilt. |
| **Core decides, shell performs** | ✅ [contracts/shell-operations.md](./contracts/shell-operations.md) §0. |
| **One PR solves one problem; split what exceeds review scope** (AI-CODING-RULES §2) | ⚠️ See Complexity Tracking. |
| **High-risk changes carry risk description, test evidence, rollback** (AI-CODING-RULES §3) | ⚠️ This feature is **High** risk: it touches authentication, key derivation and session state. Every phase names its gate commands; the manual sweep in quickstart.md is the test evidence; rollback is per-phase because each phase is its own commit. |

Two gates need explanation rather than a tick, and both are recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/019-onboarding-live-wiring/
├── spec.md
├── plan.md                       # this file
├── research.md                   # D1–D14, the decisions and what was measured
├── data-model.md                 # KeyMethod, the CreateView → v2 screen mapping
├── contracts/
│   ├── shell-operations.md       # 18 + 7 operations × 4 clients; supersedes 011's contract
│   └── i18n-keys.md              # 32 added / 15 rewritten / 6 removed
├── quickstart.md                 # how to run each client; the seven-scenario sweep
├── checklists/requirements.md
└── tasks.md                      # /speckit-tasks output — not created by /speckit-plan
```

### Source Code (repository root)

```text
rust/crates/vela-core/
├── src/app/create_wallet.rs      # ACK_COUNT 4→2; KeyMethod on AddKey + CreateKeyRow
├── src/app/shell.rs              # KeyMethod on RegisterPasskey
├── src/app/mod.rs                # new: enum KeyMethod
├── src/ctap/                     # NEW — sans-IO CTAP2: framing, CBOR commands, COSE, PIN/UV
├── i18n/locales/<15>/onboarding.json
└── tests/{app_create_wallet,app_login,app_session,ctap_*}.rs

rust/crates/vela-core-uniffi/     # `crux` on; NEW JSON bridge object (Mutex-guarded)
rust/crates/vela-core-wasm/       # unchanged — the bridge reference
rust/pkg-web/                     # regenerated committed artifact

app-web/vela-wallet/src/
├── lib/onboarding/core/          # NEW — effect loop, executor, passkey, registry, storage
├── lib/onboarding/wasm-client.ts # NEW — on-demand browser wasm init
├── lib/ui/onboarding/            # v2 screens replace the 014 panels; atoms reused
└── routes/[locale]/…, routes/dev/gallery/

app-desktop/vela-wallet/src/
├── core_host.rs                  # NEW — generic CoreHost<A>, no FFI
├── ctap/usb.rs                   # NEW — hidapi transport; framing/CBOR come from vela-core
├── onboarding.rs, onboarding_flow.rs, gallery.rs   # rebuilt to v2
└── executor/                     # NEW — storage, registry, prompts

app-android/vela-wallet/app/src/main/java/app/getvela/wallet/
├── feature/onboarding/core/      # NEW — bridge driver + executor (CredentialManager)
├── feature/onboarding/flow/      # rebuilt to v2
└── feature/onboarding/gallery/

app-ios/VelaWallet/VelaWallet/
├── Features/Onboarding/Core/     # NEW — bridge driver + executor (ASAuthorization)
├── Features/Onboarding/          # rebuilt to v2
└── Features/Gallery/

src/                              # the shipping Expo web client — lockstep only (research D12)
├── screens/onboarding/CreateWalletScreen.tsx   # 4 acks → 2
└── services/onboarding-core/executor.ts        # RegisterPasskey gains `method`
```

**Structure Decision**: no new top-level structure. The core gains one module and one
enum; each of the four rewritten clients gains a sibling `…/onboarding/core/` directory
next to its existing `…/onboarding/` UI, keeping the "decides / performs / renders" split
visible in the directory tree. The fifth shell (`src/`) is touched only where the two core
changes force it.

## Complexity Tracking

> Filled because two Constitution Check rows are ⚠️ rather than ✅.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **One feature spans five codebases and four languages** (AI-CODING-RULES §2: split what exceeds review scope) | The two core changes are breaking: `ACK_COUNT` and the new `RegisterPasskey` field break every shell at once. Splitting per client would leave the production web wallet unable to create a wallet between merges. | Doing the core change alone first was considered and rejected: a core change nobody consumes is untestable, and it would have to land twice (once broken, once wired). The mitigation is structural instead — **nine phases, each its own commit with its own gate commands**, so review and rollback happen per phase, not per feature. |
| **High-risk surface: authentication, key derivation, session state** (AI-CODING-RULES §3) | This is what onboarding *is*. There is no version of this feature that avoids passkeys or address derivation. | Mitigations, not avoidance: the rules are unchanged and stay under their existing ~88 core tests; the new CTAP module is validated against vectors from two independent existing implementations (Kotlin and Swift, `/Volumes/data/production2/securitykeys`); SC-003 checks address agreement across clients against a recorded golden wallet; SC-010 keeps the shipping client green throughout; the seven-scenario manual sweep runs on every client before the feature closes. |
| **Turning on `crux` for `vela-core-uniffi` breaks a documented invariant** | iOS and Android must execute the machines; there is no other route. The invariant's premise ("web is the only runtime that can execute it — Hermes has no WebAssembly") was about the Expo app and does not describe native Swift and Kotlin. | A second uniffi crate keeps the existing binary byte-stable but ships two uniffi runtimes and forces an ownership decision at every future type. It is held as the **fallback**, chosen only if the measured `.so` / xcframework delta is unacceptable — the measurement is a task, not an assumption (research D2). |
| **A new CTAP2 module in the core, for one client** | Desktop has no system passkey service, so this is the only way it can create a wallet at all. Writing it in the desktop shell would mean writing it again in Kotlin and Swift for feature 020. | Using `webauthn-authenticator-rs` directly was rejected on technical grounds: its `ctap2` feature forces OpenSSL, and its orchestration layer calls `futures::executor::block_on` inside synchronous trait methods — neither fits a pure core, and neither compiles for Android, iOS or wasm. It remains a reading reference (research D4). |

## Phases

Each phase is one commit with its own gate. Phases 1–2 block everything; 3 onward are
ordered by how much each client teaches the next.

| # | Phase | Blocks | Gate |
| --- | --- | --- | --- |
| 1 | Setup — design source committed, baselines measured | all | — |
| 2 | Core: `ACK_COUNT` 4→2, `KeyMethod`, i18n, regenerate | all | `cargo test -p vela-core --features crux,i18n-all` + `gen:*`/`build:wasm` `--check` |
| 3 | Web — client wasm path, executor, v2 screens, session, gallery, e2e | — | `pnpm gen:tokens --check && pnpm check && pnpm lint && pnpm test:unit && pnpm build && pnpm test:e2e` |
| 4 | Core CTAP2 module + vectors | 5 | `cargo test -p vela-core --features crux,i18n-all`, `cargo clippy -D warnings` |
| 5 | Desktop — `crux` feature, `CoreHost<A>`, hidapi USB, v2, gallery | — | `cargo check && cargo clippy --all-targets && cargo test` + security-key sweep |
| 6 | uniffi crux bridge + size measurement + invariant rewrite | 7, 8 | `smoke-swift.sh`, `smoke-kotlin.sh`, recorded size delta |
| 7 | Android — executor, v2, session, gallery | — | `./gradlew :app:testDebugUnitTest :app:assembleDebug` + on-device sweep |
| 8 | iOS — deployment target 17.4, executor, v2, session, gallery | — | `xcodebuild build test` + on-device sweep |
| 9 | The fifth shell, `results.md`, `deviations.md`, mark 011's contract superseded | — | `npx tsc --noEmit && npx jest && npm run lint` |

MVP is Phases 1–3: one client creating and entering a real wallet proves the whole shape,
and every later phase is the same shape in another language.
