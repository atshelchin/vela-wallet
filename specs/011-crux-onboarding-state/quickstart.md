# Quickstart: Validating the Crux Onboarding Core

**Feature**: 011-crux-onboarding-state | **Date**: 2026-08-05

Everything here is runnable. Commands assume the repository root
`/Volumes/data/production/vela-wallet` and branch `011-crux-onboarding-state`.

---

## Prerequisites

- Rust 1.97.1 (pinned by `rust/rust-toolchain.toml`) with the
  `wasm32-unknown-unknown` target
- `wasm-pack` (0.15.x) on `PATH`
- `npm ci` already run

---

## 1. Core rules — deterministic, no browser

```bash
npm run test:core
```

That is `cargo test -p vela-core --features crux,i18n-all`. **`i18n-all` is not
optional** — the pre-existing conformance suite replays a 17,115-case corpus that
needs every locale resident, and it fails without it on `main` too. Getting this
wrong looks like a regression and is not one.

Expected: 20 create-flow tests, 15 sign-in tests and every pre-existing suite
green, including the three race cases (FR-033):

- `late_upload_result_after_start_over_is_ignored`
- `late_result_after_supersede_cannot_overwrite`
- `submit_while_busy_is_a_no_op`

Also confirm the default build is untouched:

```bash
cd rust
cargo check -p vela-core          # no `crux` feature — the app module is absent
cargo clippy -p vela-core --features crux --all-targets -- -D warnings
```

---

## 2. Mobile builds must not gain the dependency (FR-029, SC-004)

```bash
cd rust
cargo tree -p vela-core-uniffi | grep -c crux   # expect: 0
cargo tree -p vela-core-wasm   | grep -c crux   # expect: > 0
```

The first command is the acceptance test for "iOS and Android are provably
untouched". It inspects the resolved graph, not the configuration.

---

## 3. Wire types are in sync (D8)

```bash
npm run gen:onboarding-types -- --check
```

Expected: exits 0 and prints that the committed TypeScript matches a fresh
generation. On drift it names the files and exits non-zero. Regenerate with
`npm run gen:onboarding-types`.

---

## 4. Web artifact rebuild and the size gate (FR-030, SC-006)

```bash
npm run build:wasm
```

Expected output ends with `build-web: wrote rust/pkg-web (wasm N bytes, base64 …)`.

**Measured on 2026-08-05: `N = 817,738`** against the 1,000,000 ceiling
(baseline before this feature: 656,895). If `N` ever exceeds the ceiling the
build fails by design — stop and escalate rather than raise `MAX_WASM_BYTES`.

Then verify the committed artifact matches the source:

```bash
node rust/scripts/build-web.mjs --check
npm run verify:wasm
```

---

## 5. TypeScript, lint, unit tests

```bash
npm run typecheck
npm run lint
npm run test:unit
```

`typecheck` is the gate that catches a missing copy mapping (the exhaustive
`switch` with a `never` fallback) and any divergence between the native and web
controller hooks.

---

## 6. The regression gate — existing e2e, unmodified (FR-027, SC-001)

```bash
npx playwright test onboarding-verify
npx playwright test onboarding-sync
```

Expected: green, with **zero** edits to either spec file. `git diff --stat
e2e/` must show nothing for those two files at the end of the feature.

These cover, through a CDP virtual authenticator:
- happy path create → address shown only after signing proven and key synced
- dead passkey → nothing persisted, resume offered, no second passkey
- index sync failure surface

---

## 7. Sign-in and recovery — now automated (FR-032)

```bash
npx playwright test onboarding-signin
```

Five scenarios, all through a CDP virtual authenticator and a stateful mock of
the key index — these branches had **no** coverage before this feature:

| Scenario | The invariant it pins |
| --- | --- |
| locally known passkey | opens the wallet with the index switched off entirely |
| known only to the index | address derived from the indexed key restores the *same* wallet |
| unknown to the index | two real signatures rebuild the *same* address on-device |
| recovery declined | nothing persisted, back to the welcome screen |
| index unreachable | endpoint settings surface by themselves after three probes |

The recovery test is the important one: it asserts the recovered address equals
the address the wallet was created with, so a recovery that "worked" but produced
a different wallet fails the build.

## 8. Native must be verifiably unchanged (US3)

```bash
npx jest src/__tests__/modules/passkey.test.ts
git diff --stat main -- src/screens/onboarding/ src/hooks/use-create-wallet.ts src/hooks/use-onboarding-login.ts
```

The native controller files must be a **move** of today's logic: the diff should
show relocation, not rewritten behaviour. Anything else needs justification in
review.

Optional device check (not required to merge, recommended before release):
create a wallet and sign in once on the Xiaomi test device
(`adb -s 9d5f42fb`), confirming the flows behave exactly as on `main`.

---

## 9. Rule → test map (FR-032, SC-005)

Every rule has at least one test that drives the core directly. `create` =
`rust/crates/vela-core/tests/app_create_wallet.rs`, `login` = `…/app_login.rs`.

| Rule | Test |
| --- | --- |
| FR-006 prove signing before persisting | `cancelling_registration_persists_nothing`, `the_account_is_saved_only_after_the_server_confirms_and_the_address_follows` |
| FR-007 resume, never re-register | `cancelled_verification_resumes_at_the_signature_and_never_re_registers` |
| FR-008 start-over discards the draft | `late_upload_result_after_start_over_is_ignored` |
| FR-009 incompatible provider is terminal | `incompatible_provider_discards_the_draft` |
| FR-010 pending record before first upload | `pending_record_is_written_before_the_first_upload` |
| FR-011 three attempts, increasing waits | `upload_retries_exactly_three_times_with_increasing_waits` |
| FR-012 save only after server confirmation | `the_account_is_saved_only_after_the_server_confirms_and_the_address_follows`, `a_stored_key_that_does_not_match_fails_the_attempt`, `failed_create_is_forgiven_when_the_query_confirms_the_key`, `a_missing_record_retries_rather_than_saving`, `confirmed_upload_proceeds_to_the_wallet_reference_check`, `an_unresolved_wallet_reference_keeps_the_pending_entry_and_still_completes`, `a_failing_wallet_reference_check_does_not_block_the_wallet` |
| FR-013 retry resumes at the upload | `retry_upload_resumes_at_the_upload_never_at_registration` |
| FR-014 entering needs no ceremony | `entering_the_wallet_requires_no_further_ceremony` |
| FR-015 name budget checked first | `overlong_name_is_rejected_before_any_effect_is_requested`, `submit_requires_every_acknowledgment` |
| FR-016 compatibility before resolution | `an_incompatible_provider_stops_before_any_resolution` |
| FR-017 local → index → recovery | `a_locally_known_credential_opens_the_wallet_without_the_index`, `an_indexed_credential_is_resolved_persisted_and_entered` |
| FR-018 missing record offers recovery | `a_missing_record_offers_recovery_and_declining_persists_nothing`, `an_unrecoverable_signature_pair_persists_nothing` |
| FR-019 heal in the background | `accepted_recovery_rebuilds_the_wallet_and_heals_the_index_afterwards`, `a_failed_background_heal_changes_nothing` |
| FR-020 strict user-handle decode | `a_nameless_index_record_falls_back_to_the_credential_handle`, plus `app::mod` unit tests (`user_name_rejects_a_foreign_handle`) |
| FR-021 cancellation is silent | `a_cancelled_ceremony_is_silent` |
| FR-022 unreachable vs server error | `a_transport_failure_surfaces_settings_and_never_offers_recovery`, `a_server_error_is_reported_rather_than_blamed_on_the_endpoint` |
| FR-023 three probes before declaring | `three_failed_probes_declare_the_index_unreachable`, `a_probe_that_succeeds_leaves_the_endpoint_alone` |
| FR-024 one ceremony at a time | `submit_while_busy_is_a_no_op`, `sign_in_while_busy_is_a_no_op`, `retry_upload_is_ignored_unless_the_flow_is_sync_failed` |
| FR-025 stale results discarded | `late_upload_result_after_start_over_is_ignored`, `late_result_after_supersede_cannot_overwrite` |
| FR-026 superseding cancels its effects | `late_upload_result_after_start_over_is_ignored` (start-over aborts the in-flight command and the late answer is dropped) |
