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
