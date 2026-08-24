# Delivery Report — 019 Live Onboarding

**Branch**: `019-onboarding-live-wiring` · Started 2026-08-24

Filled in as phases land. Baselines first, because "did this grow?" has no answer after
the fact.

---

## Baselines (T002, T003, T004) — recorded 2026-08-24, before any change

### Artifact sizes (T002)

| Artifact | Bytes |
| --- | --- |
| `app-android/…/jniLibs/arm64-v8a/libvela_core_uniffi.so` | 4,342,328 |
| `app-android/…/jniLibs/armeabi-v7a/libvela_core_uniffi.so` | 2,815,036 |
| `app-android/…/jniLibs/x86_64/libvela_core_uniffi.so` | 3,811,840 |
| `app-ios/VelaCoreKit/Artifacts/VelaCoreFFI.xcframework` (whole) | 173 MB |
| └ `ios-arm64/libvela_core_uniffi.a` | 90,715,352 |
| └ `ios-arm64-simulator/libvela_core_uniffi.a` | 90,701,376 |
| `public/vela_core_bg.4e0414e01958.wasm` | 3,461,984 |

These are the T098 comparison points. The Android `.so`s are the honest instrument — the
iOS `.a` is an unstripped debug-symbol-carrying static archive, so its absolute size says
little; its **delta** is still the signal.

### Corpus (T003)

| Measure | Value |
| --- | --- |
| `onboarding` namespace leaves (`en`) | 163 |
| corpus leaves across 15 namespaces | 1,184 |
| SC-005 residency, cold start `ja` | 94,640 bytes of a 135,345 budget (90.4 % below the 990,499-byte whole corpus) |

40,705 bytes of residency headroom. The `u16` blob ceiling that spec 014 warned about is
not a constraint — the generator picks the offset width per locale and `ru` is already
`u32` (research D10).

### Green-before-touching (T004)

| Gate | Result |
| --- | --- |
| `cargo test -p vela-core --features crux,i18n-all` | **1,116 passed, 0 failed** |
| └ `tests/app_create_wallet.rs` | 27 |
| └ `tests/app_login.rs` | 23 |
| └ `tests/app_session.rs` | 31 |
| `cargo test --workspace --features vela-core/i18n-all` | ok |

**Finding worth carrying forward**: `cargo test --workspace --features vela-core/i18n-all`
— the command CI runs — reports **0 tests** for every workspace member, because the
integration suites are `#![cfg(feature = "crux")]` and that feature is not requested. The
81 onboarding tests only run under the explicit
`cargo test -p vela-core --features crux,i18n-all`. Whether CI is genuinely exercising
them, or has been relying on a feature-unification accident that no longer holds, is worth
checking before this feature's core changes land — a regression in `create_wallet.rs`
would currently be invisible to the workspace command.

| `npx tsc --noEmit` (repo root, the Expo client) | exit 0 |
| `npx jest` (repo root) | 196 suites, 2,498 passed, 1 skipped |

Phase 1 complete.

---

## Phase 2 — the core, and everything the core change broke

### What changed

| Change | Where |
| --- | --- |
| `ACK_COUNT` 4 → 2 | `rust/crates/vela-core/src/app/create_wallet.rs` |
| `KeyMethod { Platform, Hybrid, SecurityKey }` | `app/mod.rs`, on `Event::AddKey`, `ShellOperation::RegisterPasskey`, `CreateKeyRow` |
| corpus: 1 removed, 6 renamed, 14 rewritten, 31 added, × 15 locales | `i18n/locales/*/onboarding.json` |
| default passkey index → `p256-index-v2.getvela.app` | `network_admin.rs`, `models/types.ts` (owner instruction, separate commit) |

### Measured

| Measure | Before | After |
| --- | --- | --- |
| `onboarding` namespace leaves (`en`) | 163 | **193** |
| corpus leaves (`en`, 15 namespaces) | 1,184 | **1,214** |
| generated resources, 15 locales | 18,918 | **19,368** (+30 × 15) |
| shared path table | 1,359 (1,280 leaf + 79 branch) | **1,389** (1,310 + 79) |
| SC-005 residency, cold `ja` | 94,640 | **95,976** of 135,345 — 39,369 bytes of headroom |
| wasm artifact | 3,461,984 | **3,466,137** (+4,153) |
| core tests | 1,116 | **1,117** (+1 guard for the new field) |

### Gates

| Gate | Result |
| --- | --- |
| `cargo test -p vela-core --features crux,i18n-all` | 1,117 passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | clean |
| `cargo fmt --check` | clean |
| `gen:i18n` / `lint:i18n` / `verify:i18n` | pass · 69,650 comparisons, zero divergences from i18next |
| `dump:vectors` | regenerated |
| `npx jest` | 196 suites, 2,498 passed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (586 pre-existing warnings, none in touched files) |
| `build:wasm` + `verify:wasm` | 43,018 conformance cases green |
| **`npx playwright test onboarding`** | **8 passed** |

### The corpus lint, and what was fixed rather than baselined

`lint:i18n` flagged two new defect classes. One was avoidable and was fixed; one was not
and was baselined with its reason.

- **A5 `count_without_plurals`** — `create.keyCount` was `{{count}} / {{max}}`, which is a
  *ratio*, not a count, and only tripped the plural heuristic because of the variable's
  name. Renamed to `{{current}} / {{max}}` (matching `common.stepCounter`), which removes
  the defect instead of registering it. That took the new occurrences from 30 to 15.
  The remaining 15 are `create.progressSubtitle`, a genuine count-noun. It is baselined
  rather than given plural forms, because its neighbour `create.successMessage` has the
  same shape and 239 occurrences exist corpus-wide: the class deserves one deliberate
  pass, not a per-feature patch that leaves two adjacent sentences inconsistent.
- **A6 `significant_whitespace`** — all 24 are the `ack3*` → `ack1*` rename surfacing
  already-baselined trailing spaces under new names. Pure rename artefact.

### Two bugs this phase found in its own work

1. **`successMessage` was handed the wrong number.** The sentence was rewritten from "your
   address works on all {{count}} networks" to "any of your {{count}} keys can sign in",
   but the call site still passed `getAllNetworksSync().length` — so a one-key wallet's
   success screen read *"Any of your 12 keys can sign in on its own."* Caught by reading
   the rendered page in an e2e failure, not by any type or test. Now passes
   `flow.keys.length`.
2. **Two different things read identically in English.** `keyDeviceOnlyBadge` was
   shortened to "This device", which is exactly `methodPlatformTitle`. zh keeps them
   distinct (仅本机 vs 这台设备) and English now does too: "This device only".

### The onboarding e2e suite was already red, and is now green

All three onboarding specs failed on a clean tree before this feature — verified by
stashing every change and re-running. They rotted when the multi-key founding set landed
(2026-08-22) and nothing re-ran them since. Three independent causes:

1. **The network stubs knew only the pre-v2 endpoints** (`/api/health`, `/api/create`,
   `/api/query`). The interleaved create→confirm flow calls `POST /api/challenge` in
   member mode once per key, so `requestMemberChallenge` fell through to the catch-all
   JSON-RPC null and the executor read `.challenge` off `undefined` — the whole create
   path died at "Verifying identity…" with an unhandled `startsWith` on every run.
2. **Chrome's virtual authenticator leaves the backup flags clear**, which the core
   correctly reads as a device-bound key — so `needs_second_key` blocked a flow whose
   point was not the second-key gate. Fixed with `defaultBackupEligibility` /
   `defaultBackupState`.
3. **The founding-key list is a new step** the specs walked straight past, and a failed
   membership confirmation now lands there with a per-row `Confirm` retry rather than
   returning to the form's `Finish Verification`.

`onboarding-sync` needed one more change of substance: "block every external host" no
longer produces a sync failure, because it now kills the *challenge* before the publish
exists. It serves health and challenge and kills register/task, which is what the test's
own title claims it does.

**This matters beyond the tests.** These eight tests are the only automated proof that a
real passkey ceremony creates a real wallet — SC-010's evidence. Combined with the Phase 1
finding that `cargo test --workspace` runs zero core tests, two of this repository's three
onboarding safety nets were silently down.

### Phase 2 checkpoint: met

The whole repository — including `src/`, the shipping Expo client — builds, lints and
tests green, and creates and signs in for real under a virtual authenticator.
