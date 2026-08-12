# Implementation Plan: Crux-Owned Wallet State — Inventory + First Wave

**Branch**: `016-crux-wallet-state` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-crux-wallet-state/spec.md`

## Summary

Two deliverables. First, the complete business-state inventory of the Expo web
app ([inventory.md](./inventory.md)) — 23 candidate machines with invariants
and provenance, the roadmap that specs 017+ execute. Second, the first wave of
that roadmap: three Crux machines (`display_currency`, `receive_watch`,
`payment_request`) in `vela-core` behind the existing default-off `crux`
feature, plus the generalization of the 011 bindings/wasm infrastructure from
one onboarding module to N domain modules. Web screens keep their pixels and
copy; native keeps its TypeScript logic via the 011 platform-split hook
pattern.

## Technical Context

**Language/Version**: Rust 1.97.1 (pinned), edition 2021; TypeScript 5.9 /
React 19.2 / React Native 0.83.6 (Expo 55)

**Primary Dependencies**: `crux_core` 0.19 and `ts-rs` 12 (both already in the
workspace from 011, feature-gated); no new dependencies

**Storage**: existing AsyncStorage keys, unchanged: `vela.displayCurrency`,
`vela.receiveWarned.{address}` — reached only from shell executors

**Testing**: `npm run test:core` (machines), jest (shell mappings, unchanged
suites), Playwright regression gate per FR-020

**Target Platform**: Web executes the cores; iOS/Android keep TS (Hermes has
no WebAssembly)

**Constraints**: wasm ≤ 1,000,000 bytes (hard); `vela-core` lints
(`forbid(unsafe_code)`, `deny(clippy::unwrap_used, expect_used, panic)`);
committed `rust/pkg-web/` + generated TS are drift-gated; on-screen copy
byte-identical (e2e locates by text)

**Scale/Scope**: 3 machines, 3 small operation vocabularies (~11 operations
total), ~35 core tests, 2 screens + 1 hook re-pointed on web, ~1,600 lines of
Rust including tests

## Constitution Check

`.specify/memory/constitution.md` remains an unratified template (as in 011).
The de-facto gates applied, each enforced by an existing script or lint:

| Gate | Enforced by | Status |
| --- | --- | --- |
| Web wasm ≤ 1,000,000 bytes | `rust/scripts/build-web.mjs` | measured post-implementation (research.md D11) |
| Committed artifacts match source | `build-web.mjs --check`, `gen-core-types.mjs --check` | tasks in scope |
| No `unwrap`/`expect`/`panic`/`unsafe` in `vela-core` | crate lints | must hold for new code |
| Native untouched by `crux` | `cargo tree -p vela-core-uniffi` | explicit task |
| e2e text anchors unchanged | FR-020 suites run unmodified | explicit tasks |

## Project Structure

### Documentation (this feature)

```text
specs/016-crux-wallet-state/
├── plan.md              # This file
├── spec.md              # Requirements (FR-001 … FR-022)
├── inventory.md         # THE deliverable: 23 machines, invariants, roadmap
├── research.md          # D1 … D11 + landmines
├── data-model.md        # Three machines: models, protocols, transition tables
├── contracts/
│   └── wallet-state-core.md   # Wire surface of the three apps
└── tasks.md
```

### Source Code (repository root)

```text
rust/crates/vela-core/
├── src/app/
│   ├── mod.rs                  # + pub mod display_currency; receive_watch; payment_request
│   ├── display_currency.rs     # Machine 1 (protocol + app in one file, 011 style)
│   ├── receive_watch.rs        # Machine 2
│   └── payment_request.rs      # Machine 3
├── src/bin/
│   └── generate_wallet_state_bindings.rs   # feature = "bindings"
└── tests/
    ├── app_display_currency.rs
    ├── app_receive_watch.rs
    └── app_payment_request.rs

rust/crates/vela-core-wasm/src/
├── lib.rs                      # + mod bridge; mod wallet_state;
├── bridge.rs                   # generic Bridge + SplitEffect + bridge_class! (D4)
├── onboarding.rs               # re-declared through the shared bridge, wire-identical
└── wallet_state.rs             # DisplayCurrencyCore / ReceiveWatchCore / PaymentRequestCore

rust/scripts/
└── gen-core-types.mjs          # registry generator (D3); gen:onboarding-types aliases it

src/services/wallet-state-core/
├── session.ts                  # native stub (throws), 011 pattern
├── session.web.ts              # builds the three cores from the initialized wasm
├── executors.web.ts            # per-app Operation → existing services (the only I/O site)
└── generated/                  # ts-rs output, committed, drift-gated

src/hooks/
├── use-display-currency.ts     # native — today's logic, kept
├── use-display-currency.web.ts # web — crux-driven, same public shape
├── use-receive-watch.ts        # native — deposit effect moved verbatim from the screen
├── use-receive-watch.web.ts    # web — crux-driven
├── use-receive-request.ts      # native — gate + builder logic moved from screen/component
└── use-receive-request.web.ts  # web — crux-driven

src/screens/wallet/
├── ReceiveScreen.tsx           # renders controller output; no polling/storage logic
└── PayScreen.tsx               # renders the validated PayRequest view

src/components/ReceiveRequestControls.tsx  # renders from the controller; no build logic
```

**Structure Decision**: continue 011's layout exactly; one new generated dir,
no new crates, no build-pipeline changes.

## Phase Sequencing

1. **Docs first** (this directory) — inventory, decisions, data model,
   contracts. The inventory is a deliverable regardless of implementation.
2. **Cores + tests** — all three machines compile and their transition tables
   pass under `cargo test -p vela-core --features crux` before any UI change.
3. **Bindings + bridge generalization** — `gen-core-types.mjs` registry, new
   bindings bin, generic bridge; onboarding wire proven unchanged (its
   generated dir has no diff; its e2e runs at the end).
4. **Web integration, one machine at a time** — display_currency (hook swap),
   receive_watch (screen → hook split), payment_request (screen + component
   re-point). Native hooks receive today's logic verbatim first, then the
   `.web.ts` twins go in.
5. **Regression** — cargo tests, typecheck, lint, jest, `build:wasm` (+ size
   record in research.md D11), `gen-core-types --check`, `cargo tree`
   assertion, FR-020 e2e set.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Per-app operation vocabularies (3 small enums) | Domain sentences; keeps wires decoupled (D2) | Extending onboarding's union couples every app's wire and regenerates all bindings on any change |
| Generic wasm bridge + `bridge_class!` macro | One reviewed implementation of stale-answer/abort semantics for N apps (D4) | Per-app copies fork the exact semantics 011 got reviewed once |
| Module-level session for display_currency | The committed pair is app-wide today (module global); per-screen cores would re-race the seed (D5) | Per-screen sessions reintroduce the partial-pairing flicker the pair exists to prevent |
| Three native hook files carrying moved TS logic | Hermes cannot run wasm; FR-019 freezes native behavior | A runtime platform branch would pull wasm imports into the native bundle |
