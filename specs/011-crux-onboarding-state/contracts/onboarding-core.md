# Contract: Onboarding Core ↔ Web Shell

> **SUPERSEDED (2026-08-25) by
> [`specs/019-onboarding-live-wiring/contracts/shell-operations.md`](../../019-onboarding-live-wiring/contracts/shell-operations.md).**
>
> What had drifted, in the words this file still uses below: it names
> `index_create_record` / `index_query_record` / `wallet_ref` and a four-variant
> `CreateStage` of `form|working|sync_failed|created`. The shipped Rust has
> `registry_publish` / `registry_query_by_public_key` / `registry_query_unit` /
> `generate_group_key` / `sign_member_proof` / `lookup_legacy_name`, and
> `CreateStage = Form | AddKeys | SyncFailed | Created`. The operation count went
> from eleven to eighteen when multi-key creation landed.
>
> Its title is also no longer true: "↔ Web Shell" was accurate when web was the
> only runtime that could execute the machines. Four clients run them now, and
> the 019 contract is written for all four.
>
> Kept because the reasoning below — why the core declares effects instead of
> performing them, and why the bridge treats a late answer as expected — is the
> reasoning 019 inherited rather than replaced.

**Feature**: 011-crux-onboarding-state | **Date**: 2026-08-05

This is the authoritative wire surface. The TypeScript types under
`src/services/onboarding-core/generated/` are produced from the Rust definitions
(D8) — this document is what a reviewer reads; the generated files are what the
compiler reads. If they disagree, the Rust is right and the generator must be
re-run.

All payloads are JSON. Enums are internally tagged with `type` and rendered in
`snake_case`, matching `crux-demo`'s convention and the existing repository style.

---

## 1. WASM surface

Two classes, one shape:

```ts
class CreateWalletCore {
  constructor();
  dispatch(event_json: string): string;              // → DispatchResult
  resolve_effect(effect_id: bigint, result_json: string): string; // → DispatchResult
  view(): string;                                    // → CreateView
  free(): void;
}

class LoginCore { /* identical, with LoginView */ }
```

```jsonc
// DispatchResult
{
  "view": { /* CreateView | LoginView */ },
  "effects": [ { "id": 7, "operation": { "type": "register_passkey", "name": "Ann" } } ],
  "cancelled_effect_ids": [ 5 ]
}
```

Errors: a malformed event or an unknown effect id rejects with a `JsValue` string.
The shell treats that as a programming error (surfaced via `onError`), never as a
user-facing failure.

---

## 2. Events — shell → core

### `CreateWallet`

| Event | Payload | Sent when |
| --- | --- | --- |
| `start` | — | Screen mounts |
| `name_changed` | `name` | Text input changes |
| `ack_toggled` | `index` | A checklist row is tapped |
| `submit` | — | Primary button (create **or** finish-verify) |
| `start_over` | — | "Start over" link |
| `retry_upload` | — | Sync-failed retry button |
| `enter_wallet` | — | "Enter Wallet" button |
| `go_back` | — | Back arrow (core clears transient status only) |
| `shell_completed` | `ShellResult` | Effect resolution (loop-managed) |

### `Login`

| Event | Payload | Sent when |
| --- | --- | --- |
| `start` | — | Screen mounts (begins the health probe) |
| `sign_in` | — | "I already have a wallet" |
| `shell_completed` | `ShellResult` | Effect resolution (loop-managed) |

---

## 3. Operations — core → shell

```jsonc
{ "type": "check_passkey_support" }
{ "type": "register_passkey", "name": "Ann" }
{ "type": "sign_proof", "credential_id": "…", "purpose": "verify" }      // "verify" | "recover_first" | "recover_second"
{ "type": "authenticate_passkey" }
{ "type": "load_accounts" }
{ "type": "save_account", "account": { "id": "…", "name": "…", "address": "0x…", "public_key_hex": "04…", "created_at_iso": "…" } }
{ "type": "save_pending_upload", "record": { "id": "…", "name": "…", "public_key_hex": "04…", "attestation_object_hex": "…", "created_at_iso": "…" } }
{ "type": "remove_pending_upload", "credential_id": "…" }
{ "type": "index_create_record", "credential_id": "…", "public_key_hex": "04…", "name": "Ann" }
{ "type": "index_query_record", "credential_id": "…" }
{ "type": "index_query_by_wallet_ref", "address": "0x…" }
{ "type": "probe_index_health" }
{ "type": "wait", "ms": 1000 }
{ "type": "prompt", "kind": { "type": "recover_offer" }, "confirmable": true }
{ "type": "complete_onboarding", "mode": { "type": "add_account", "account": { … } } }
// complete_onboarding mode alternative:
//   { "type": "set_wallet", "accounts": [ … ], "active_index": 0 }
```

### Shell execution mapping (web)

| Operation | Implementation |
| --- | --- |
| `check_passkey_support` | `Passkey.isSupported()` |
| `register_passkey` | `Passkey.register(name)` |
| `sign_proof` | `Passkey.sign(challenge, credentialId)`; challenge = `'vela-verify-' + Date.now()` for `verify`, `'vela-recover-' + Date.now()` for the recover purposes — **unchanged from today** |
| `authenticate_passkey` | `Passkey.authenticate()` |
| `load_accounts` | `loadAccounts()` |
| `save_account` | `saveAccount(account)` (field names mapped to `StoredAccount`) |
| `save_pending_upload` | `savePendingUpload(record)` |
| `remove_pending_upload` | `removePendingUpload(id)` |
| `index_*` | `PublicKeyIndex.createRecord / queryRecord / queryByWalletRef`, `rpId` supplied by `getRelyingPartyId()` |
| `probe_index_health` | `fetch(base + '/api/health?_t=…')`, 8 s abort, validates `service === 'webauthn-p256-publickey-index' && status === 'ok'` — unchanged from today |
| `wait` | `setTimeout`, cancellable via the effect's `AbortSignal` |
| `prompt` | `showAlert(title, body[, buttons])` with the existing `t()` keys; resolves `accepted` |
| `complete_onboarding` | `dispatch({type:'ADD_ACCOUNT'…})` or `dispatch({type:'SET_WALLET'…})`, then `onComplete?.()` else `router.replace('/(tabs)/wallet')` |

---

## 4. Results — shell → core

```jsonc
{ "type": "passkey_support", "supported": true }
{ "type": "passkey_registered", "registration": { "credential_id": "…", "attestation_object_hex": "…", "client_data_json_hex": "…" }, "now_iso": "2026-08-05T…Z" }
{ "type": "proof_signed", "assertion": { "credential_id": "…", "signature_der_hex": "…", "authenticator_data_hex": "…", "client_data_json_hex": "…", "user_id_hex": "…" }, "now_iso": "…" }
{ "type": "passkey_authenticated", "assertion": { … }, "now_iso": "…" }
{ "type": "passkey_failed", "kind": "cancelled" }        // cancelled | not_supported | not_discoverable | other
{ "type": "accounts_loaded", "accounts": [ { … } ] }
{ "type": "account_saved" }
{ "type": "pending_upload_saved" }
{ "type": "pending_upload_removed" }
{ "type": "storage_failed", "message": "…" }
{ "type": "index_created" }
{ "type": "index_record", "public_key_hex": "04…", "name": "Ann" }
{ "type": "index_missing" }
{ "type": "index_failed", "message": "…", "network": true }   // network=true ⇒ unreachable classification
{ "type": "wallet_ref", "resolved": true }
{ "type": "index_health", "ok": false }
{ "type": "waited" }
{ "type": "prompt_answered", "accepted": true }
{ "type": "onboarding_completed" }
```

**Failure convention**: the shell never throws into the loop. Every rejected
promise is converted by `toFailure(effect, error)` into the result variant that
belongs to that operation — a passkey ceremony becomes `passkey_failed`, an index
call becomes `index_failed`, a storage call becomes `storage_failed`. This is what
lets the core own classification (FR-022) instead of pattern-matching strings.

The one string the shell *does* classify is transport reachability: a fetch
rejection or an aborted request sets `network: true` on `index_failed`, because
only the shell can tell a transport failure from a 4xx.

---

## 5. View models

### `CreateView`

```jsonc
{
  "stage": "form",                    // form | working | sync_failed | created
  "name": "Ann",
  "name_editable": true,
  "name_too_long": false,
  "acks": [false, false, false, false],
  "can_submit": false,
  "submit_label": "create",           // create | finish_verify
  "busy": false,
  "status": null,                     // null | "setting_up_identity" | "verifying_identity" | "extracting_key" | "computing_address" | "syncing_key" | "setup_cancelled" | "verify_cancelled"
  "show_start_over": false,
  "address": null,
  "sync_error_detail": null,
  "can_go_back": true
}
```

### `LoginView`

```jsonc
{ "busy": false, "endpoint_unreachable": false }
```

---

## 6. Copy mapping (shell-owned, exhaustive)

The core never emits user-facing text. These tables are the whole of the
translation surface and are what keeps FR-028 true.

| `StatusKey` | i18n key |
| --- | --- |
| `setting_up_identity` | `onboarding.create.statusSettingUpIdentity` |
| `verifying_identity` | `onboarding.create.statusVerifyingIdentity` |
| `extracting_key` | `onboarding.create.statusExtractingKey` |
| `computing_address` | `onboarding.create.statusComputingAddress` |
| `syncing_key` | `onboarding.create.statusSyncingKey` |
| `setup_cancelled` | `onboarding.create.statusSetupCancelled` |
| `verify_cancelled` | `onboarding.create.statusVerifyCancelled` |

| `PromptKind` | title / body keys | Buttons |
| --- | --- | --- |
| `not_supported` (create) | `onboarding.create.alertNotSupportedTitle` / `…Body` | OK |
| `not_supported` (login) | `onboarding.login.alertNotSupportedTitle` / `…Body` | OK |
| `not_discoverable` | `onboarding.create.alertNotDiscoverableTitle` / `…Body` | OK |
| `incompatible_create` | `onboarding.login.alertIncompatibleTitle` / `…BodyCreate` | OK |
| `incompatible_login` | `onboarding.login.alertIncompatibleTitle` / `…Body` | OK |
| `create_failed{detail}` | `onboarding.create.alertErrorTitle` / raw detail | OK |
| `recover_offer` | `onboarding.login.recoverOfferTitle` / `…Body` | `recoverCancel` / `recoverConfirm` |
| `recover_failed` | `onboarding.login.recoverFailedTitle` / `…Body` | OK |
| `sign_in_failed{detail}` | `onboarding.login.alertSignInFailedTitle` / `alertSignInFailedBody{message}` | OK |

| `submit_label` | i18n key |
| --- | --- |
| `create` | `onboarding.create.createWalletBtn` |
| `finish_verify` | `onboarding.create.finishVerifyBtn` |

Both mappings are implemented as exhaustive `switch` statements with a `never`
fallback, so adding a variant to the Rust enum without adding its copy is a
TypeScript compile error.

---

## 7. What the contract deliberately excludes

- `rpId` and endpoint URLs — environment-derived, shell-only.
- Challenge material and timestamps as *requests* — they arrive as fields on
  results (D6).
- Network count in the success message (`onboarding.create.successMessage`) —
  read from the chain registry by the shell, not business state.
- Theme, layout, animation, copy-to-clipboard confirmation, the technical-details
  disclosure toggle, and the settings sheet's open/closed flag — all pure UI.
