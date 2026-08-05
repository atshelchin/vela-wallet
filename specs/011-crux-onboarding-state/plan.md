# Implementation Plan: Crux-Owned Onboarding State (Create + Sign In)

**Branch**: `011-crux-onboarding-state` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-crux-onboarding-state/spec.md`

## Summary

Move the business decisions of web wallet-creation and sign-in out of two React
components and into two Crux state machines inside `vela-core`, behind a
default-off `crux` cargo feature. The web app keeps the screens and the I/O: it
renders a ViewModel, translates taps into Events, executes the effects the core
declares (passkey ceremonies, storage, index-service calls, waits, prompts,
completion) and sends the results back. iOS/Android keep today's TypeScript
implementation verbatim — their JavaScript engine has no WebAssembly — reached
through a per-flow controller hook whose `.web.ts` variant is crux-driven.

The framework's cost was measured before planning: **+95,288 wasm bytes** against
**343,105 bytes of headroom**, so the existing single-artifact, synchronous
`initSync` loading route is kept unchanged (research.md D1).

## Technical Context

**Language/Version**: Rust 1.97.1 (pinned, `rust/rust-toolchain.toml`), edition 2021; TypeScript 5.9 / React 19.2 / React Native 0.83.6 (Expo 55)

**Primary Dependencies**: `crux_core` 0.19 (new, feature-gated), `ts-rs` 12 (new, bindings feature only), `wasm-bindgen` 0.2.126 + `serde_json` + `serde` (existing)

**Storage**: Existing `@react-native-async-storage/async-storage` via `src/services/storage.ts` (localStorage on web) — reached only from the shell

**Testing**: `cargo test -p vela-core --features crux` (state machines), jest (shell adapters, copy mappings), Playwright (`e2e/onboarding-verify.spec.ts`, `e2e/onboarding-sync.spec.ts` — unmodified regression gate)

**Target Platform**: Web (Expo web) is the only target that executes the new core. iOS 15+/Android keep the TypeScript path.

**Project Type**: Cross-platform mobile+web app with a shared Rust core (existing three-crate Rust workspace + Expo app)

**Performance Goals**: No perceptible change to onboarding. Core dispatch is a synchronous JSON round trip through wasm (microseconds); flow latency stays dominated by the passkey ceremony and the index service, exactly as today.

**Constraints**:

- `MAX_WASM_BYTES = 1_000_000` in `rust/scripts/build-web.mjs` — hard, must not be raised (FR-030)
- `vela-core` crate lints: `#![forbid(unsafe_code)]`, `#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`
- `build-web.mjs --check` fingerprints every `.rs` and `Cargo.toml` under `rust/crates/` — any Rust edit requires rebuilding and committing `rust/pkg-web/`
- Hermes has no WebAssembly → native cannot run the core
- `tsconfig.json` sets no `moduleSuffixes`: `tsc` resolves `.web.ts` imports to the base `.ts`, so platform pairs must expose matching export names

**Scale/Scope**: 2 state machines, 15 shell operations, ~20 result variants, 2 screens re-pointed, 4 new hook files, ~1,400 lines of Rust including tests.

## Constitution Check

`.specify/memory/constitution.md` is an **unratified template** — every principle
is still a `[PRINCIPLE_N_NAME]` placeholder. There are therefore no
project-specific constitutional gates to evaluate, and none are invented here.

In their place, the gates applied are this repository's de-facto invariants, each
already enforced by a script or a lint:

| Gate | Enforced by | Status |
| --- | --- | --- |
| Web wasm ≤ 1,000,000 bytes | `rust/scripts/build-web.mjs` | PASS by measurement (research.md D1); re-checked at build time |
| Committed `rust/pkg-web/` matches source | `build-web.mjs --check` | Task in scope |
| No `unwrap`/`expect`/`panic`/`unsafe` in `vela-core` | crate-level lints | Must hold for new code; narrow `#[allow]` only on macro-generated items, if needed |
| Shared-computation imports go through the `@/services/vela-core` facade | `no-restricted-imports` in `eslint.config.js` | New session module follows the same rule |
| Generated artifacts are committed with a drift gate | `verify:i18n`, `verify:identicon`, `build:wasm --check` | New `gen:onboarding-types --check` follows the pattern |
| Native platform behaviour unchanged | `cargo tree` assertion + verbatim move of the TS logic | Explicit acceptance tasks |

**Post-design re-check (after Phase 1)**: no gate moved. The design adds no I/O to
`vela-core` (effects are declarations), no new loading path for the web artifact,
and nothing to the default feature set. The two additions that could have
threatened a gate — artifact size and mobile dependency creep — are each covered
by an executable check in `quickstart.md` §2 and §4.

**Complexity note**: this feature adds one dependency (`crux_core`) and one
build-time generator (`ts-rs`). Both are justified in research.md (D1, D8) and
both are invisible to the default build of `vela-core`.

## Project Structure

### Documentation (this feature)

```text
specs/011-crux-onboarding-state/
├── plan.md              # This file
├── spec.md              # Requirements (FR-001 … FR-033)
├── research.md          # D1 … D12 + landmines
├── data-model.md        # Models, stages, invariants, decision table
├── quickstart.md        # Runnable validation guide
├── contracts/
│   └── onboarding-core.md   # Authoritative wire surface
├── checklists/
│   └── requirements.md
└── tasks.md             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
rust/crates/vela-core/
├── Cargo.toml                      # + [features] crux, bindings; + crux_core, ts-rs (optional)
├── src/
│   ├── lib.rs                      # + #[cfg(feature = "crux")] pub mod app;
│   └── app/
│       ├── mod.rs                  # module wiring + shared value types
│       ├── shell.rs                # Operation / ShellResult vocabulary (shared)
│       ├── create_wallet.rs        # Machine A: Event/Model/ViewModel/update/view
│       └── login.rs                # Machine B: Event/Model/ViewModel/update/view
├── src/bin/generate_onboarding_bindings.rs   # feature = "bindings"
└── tests/
    ├── app_create_wallet.rs        # rule-per-test, incl. race cases
    └── app_login.rs

rust/crates/vela-core-wasm/
├── Cargo.toml                      # vela-core = { features = ["crux"] }
└── src/
    ├── lib.rs                      # + mod onboarding;
    └── onboarding.rs               # CreateWalletCore / LoginCore wasm classes

src/services/crux/                  # product-agnostic shell plumbing (ported, trimmed)
├── effect-loop.ts
└── json-wasm-shell.ts

src/services/onboarding-core/
├── session.ts                      # native stub — throws "not available on this platform"
├── session.web.ts                  # constructs cores from the initialised wasm
├── executor.web.ts                 # Operation → existing services (the only I/O site)
├── copy.ts                         # StatusKey/PromptKind/label → i18n keys (exhaustive)
└── generated/                      # ts-rs output, committed, drift-gated

src/hooks/
├── onboarding-controller-types.ts  # the shape both platforms must return
├── use-create-wallet.ts            # native — today's CreateWalletScreen logic, moved
├── use-create-wallet.web.ts        # web — crux-driven
├── use-onboarding-login.ts         # native — today's OnboardingScreen logic, moved
└── use-onboarding-login.web.ts     # web — crux-driven

src/screens/onboarding/
├── CreateWalletScreen.tsx          # renders only; no passkey/storage/index calls
├── OnboardingScreen.tsx            # renders only
└── WelcomeScreen.tsx               # unchanged except props sourced from the controller

e2e/onboarding-verify.spec.ts       # MUST NOT BE EDITED
e2e/onboarding-sync.spec.ts         # MUST NOT BE EDITED
```

**Structure Decision**: The existing three-crate Rust workspace and the Expo
`src/` layout are kept as-is. The only structural additions are the `app/` module
inside `vela-core` (feature-gated, research.md D2), one wasm bridge file, one
shell-plumbing directory shared by future cores, and the four platform-split
controller files (research.md D11). No new crate, no new build pipeline, no
change to how the web artifact is produced or loaded.

## Phase Sequencing

The task list follows this order; each step is independently verifiable:

1. **Feature scaffold + size proof** — add the gated feature, a minimal `app`
   module, rebuild the wasm and record the real byte count. Stop and escalate here
   if the ceiling is hit (FR-030).
2. **Shared vocabulary + `CreateWallet` machine + tests** (US1) — the core is
   complete and tested before any UI is touched.
3. **`Login` machine + tests** (US2).
4. **Bindings generation + drift gate** (D8).
5. **wasm bridge + shell plumbing + executor + copy mapping**.
6. **Controller hooks: native (move) first, then web (crux)**; screens re-pointed last.
7. **Regression**: existing e2e unmodified, `cargo tree` assertion, typecheck,
   lint, artifact rebuild and commit.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| `crux_core` dependency (feature-gated) | The portable state-machine boundary *is* the feature | A hand-rolled Rust reducer would re-implement request/resolve correlation, cancellation and effect plumbing — the parts that are easy to get subtly wrong, and that the native platforms will need too |
| `ts-rs` generator + drift gate | ~40 wire variants across two machines; a drifted variant fails at runtime in a branch e2e does not cover | Hand-written TS mirrors pinned by sample vectors detect drift only for variants someone remembered to sample (research.md D8) |
| Two implementations of the index-upload decision table | Hermes cannot run the core, and `retryPendingUploads()` runs on every platform at launch | Making the whole upload one opaque shell operation would leave four incident-bought decisions in TypeScript and make FR-001 false (research.md D10) |
| Four controller files instead of two | `tsc` resolves `.web.ts` imports to the base `.ts`, and native must keep working | A single hook with a runtime platform branch would pull the crux session import into the native bundle, where the wasm cannot load |
