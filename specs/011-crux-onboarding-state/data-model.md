# Data Model: Crux-Owned Onboarding State

**Feature**: 011-crux-onboarding-state | **Date**: 2026-08-05

Two state machines, one shared effect vocabulary. `Model` is private to the core;
`ViewModel` is the only thing the screen sees. Field names below are the
authoritative ones for implementation.

---

## Shared value types

| Type | Fields | Notes |
| --- | --- | --- |
| `Assertion` | `credential_id`, `signature_der_hex`, `authenticator_data_hex`, `client_data_json_hex`, `user_id_hex: Option<String>` | Mirrors `PasskeyAssertionResult` in `src/modules/passkey`. Hex everywhere — no base64 ambiguity, matching the existing module contract. |
| `Registration` | `credential_id`, `attestation_object_hex`, `client_data_json_hex` | Mirrors `PasskeyRegistrationResult`. |
| `Account` | `id` (= credential id), `name`, `address`, `public_key_hex`, `created_at_iso` | Serialises 1:1 to `StoredAccount`; the shell hands it to the existing `saveAccount`. |
| `PendingUpload` | `id`, `name`, `public_key_hex`, `attestation_object_hex`, `created_at_iso` | Serialises 1:1 to today's pending-upload record. |
| `FailureKind` | `Cancelled` \| `NotSupported` \| `NotDiscoverable` \| `Incompatible` \| `Network` \| `Storage` \| `Other` | The core's error classification. The shell maps it to existing copy; it never re-classifies. |
| `StatusKey` | `SettingUpIdentity` \| `VerifyingIdentity` \| `ExtractingKey` \| `ComputingAddress` \| `SyncingKey` \| `SetupCancelled` \| `VerifyCancelled` | One variant per existing `onboarding.create.status*` string. |
| `PromptKind` | `NotSupported` \| `NotDiscoverable` \| `IncompatibleCreate` \| `IncompatibleLogin` \| `CreateFailed{detail}` \| `RecoverOffer` \| `RecoverFailed` \| `SignInFailed{detail}` | One variant per existing `showAlert` call site. `RecoverOffer` is the only `confirmable` one. |

---

## Machine A — `CreateWallet`

### Model

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | `String` | The account name being typed. Owned by the core so FR-015 can reject before a ceremony. |
| `acks` | `[bool; 4]` | Acknowledgment checklist. |
| `draft` | `Option<Draft>` | A registered-but-unproven passkey. **The resume rule lives here.** |
| `prepared` | `Option<Prepared>` | Derived, not yet persisted: public key, address, timestamps. |
| `sync` | `SyncState` | Attempt count and last error for the index upload. |
| `stage` | `Stage` | Where the flow is. |
| `status` | `Option<StatusKey>` | The transient line under the form. |
| `attempt` | `u64` | Correlation id, incremented on every user-initiated start. |

```text
Draft    { credential_id, attestation_object_hex, name, registered_at_iso }
Prepared { credential_id, name, public_key_hex, address, created_at_iso }
SyncState{ tries: u8, last_error: Option<String>, create_error: Option<String> }
```

### Stages

```text
Form ──submit──► CheckingSupport ──ok──► Registering ──registered──► Verifying
  ▲                    │ unsupported          │ cancelled              │
  │                    ▼                      ▼                        │
  └────────────── Form (+prompt)      Form (+status SetupCancelled)     │
                                                                       │
        ┌──────────────────────────────────────────────────────────────┘
        │ proof signed
        ▼
    Deriving ──ok──► SavingPending ──ok──► Syncing{try} ──confirmed──► Saving
        │                  │                   │  │                      │
        │ incompatible     │ storage failed    │  │ tries<3              │ saved
        ▼                  ▼                   │  └──wait──► Syncing{try+1}
   Form (draft            SyncFailed           │                         ▼
   discarded,             (retryable)          │ tries=3              Created
   prompt Incompatible)                        ▼                         │
                                          SyncFailed                enter_wallet
                                                                         ▼
                                                                     (complete)
```

Verification cancelled at `Verifying` → **`Form` with `draft` retained**; the
primary action becomes "finish verification" and re-submitting re-enters
`Verifying` directly (never `Registering`). This is FR-007, and it is the single
most important edge in the machine.

`start_over` at any point clears `draft`, `prepared`, `sync`, bumps `attempt` and
returns to `Form` (FR-008). Because `attempt` changed, any in-flight result from
the abandoned draft is discarded on arrival (FR-025).

### Invariants

1. `Created` is reachable only through `Saving`, which is reachable only from a
   `Syncing` state that saw a **matching** stored key. (FR-006, FR-012)
2. `prepared.address` is exposed in the ViewModel **only** in `Created`. (FR-006)
3. `draft` is `Some` for the whole span between a successful registration and the
   first successful save, and is cleared on `Incompatible` and on `start_over`.
   No transition creates a second `Draft` while one exists. (FR-007, FR-009)
4. `sync.tries` never exceeds 3, and each retry is preceded by a `Wait`
   requested from the shell. (FR-011)
5. Any event that starts work while `stage` is not `Form`/`SyncFailed`/`Created`
   is a no-op. (FR-024)

### ViewModel

| Field | Type | Drives |
| --- | --- | --- |
| `stage` | `"form" \| "working" \| "sync_failed" \| "created"` | Which of the three existing panels renders |
| `name` | `String` | The text input value |
| `name_editable` | `bool` | `editable={!loading && !pendingReg}` today |
| `name_too_long` | `bool` | The live length hint |
| `acks` | `[bool; 4]` | Checkbox states |
| `can_submit` | `bool` | Primary button enabled |
| `submit_label` | `"create" \| "finish_verify"` | Primary button copy |
| `busy` | `bool` | Button spinner |
| `status` | `Option<StatusKey>` | The status line |
| `show_start_over` | `bool` | The escape hatch (draft present, not busy) |
| `address` | `Option<String>` | Success panel; `None` outside `Created` |
| `sync_error_detail` | `Option<String>` | Raw server text behind the disclosure |
| `can_go_back` | `bool` | Back arrow (hidden while sync-failed, as today) |

---

## Machine B — `Login`

### Model

| Field | Type | Purpose |
| --- | --- | --- |
| `stage` | `Stage` | Where the flow is |
| `assertion` | `Option<Assertion>` | The authenticated credential in flight |
| `attempt` | `u64` | Correlation id |
| `health` | `Health` | Index-service reachability sub-machine |

```text
Health { probes_done: u8, unreachable: bool }
```

### Stages

```text
Idle ──sign_in──► CheckingSupport ──ok──► Authenticating ──assertion──► Compat check
                        │ unsupported             │ cancelled                │
                        ▼                         ▼                    ok ┌──┴──┐ incompatible
                    Idle (prompt)              Idle (silent)              │     ▼
                                                                          │  Idle (prompt)
                                                                          ▼
                                                                    LoadingAccounts
                                                                          │
                                             local hit ┌────────────────┬─┴──────────┐ no local hit
                                                       ▼                             ▼
                                                 Completing(SetWallet)         QueryingIndex
                                                                                     │
                                              record ┌──────────────────┬─────────────┴──────┐ 404
                                                     ▼                  ▼ network error      ▼
                                              Completing(AddAccount)  Idle (+unreachable) AwaitingConsent
                                                                                             │ accept
                                                                                             ▼
                                                                                        Recovering
                                                                                             │ 2nd signature
                                                                                             ▼
                                                                                    recover key → Completing
                                                                                    + background index heal
```

### Health sub-machine (runs on mount, independent of sign-in)

```text
Start ──► Probe ──ok──► (done, nothing shown)
            │ fail (probes_done < 3) ──wait 2s──► Probe
            │ fail (probes_done = 3)
            ▼
      unreachable = true   →  ViewModel surfaces settings (FR-023)
```

### Invariants

1. Compatibility is checked **before** any resolution or persistence. (FR-016)
2. Resolution order is local → index → recovery, and recovery is only offered on
   a *missing record*, never on a transport failure. (FR-017, FR-018)
3. A recovery that yields no unique key ends in `RecoverFailed` with nothing
   persisted. (FR-018)
4. The background index heal after recovery is fire-and-forget: its result cannot
   move the machine out of `Completing`. (FR-019)
5. A cancelled ceremony produces no prompt and no error state. (FR-021)
6. Results whose `attempt` differs from the model's are discarded. (FR-025)

### ViewModel

| Field | Type | Drives |
| --- | --- | --- |
| `busy` | `bool` | The "I already have a wallet" button spinner |
| `endpoint_unreachable` | `bool` | Auto-opening the endpoint settings sheet |

The welcome screen has no other core-owned state; theme, layout and the settings
sheet's open/closed flag stay in the shell.

---

## Shared shell vocabulary

Operations (core → shell) and results (shell → core) are listed in
[`contracts/onboarding-core.md`](contracts/onboarding-core.md), which is the
authoritative wire surface. Summary:

| Operation | Used by | Executed with |
| --- | --- | --- |
| `CheckPasskeySupport` | both | `Passkey.isSupported()` |
| `RegisterPasskey { name }` | create | `Passkey.register()` |
| `SignProof { credential_id, purpose }` | both | `Passkey.sign()` — shell mints the challenge |
| `AuthenticatePasskey` | login | `Passkey.authenticate()` |
| `LoadAccounts` | login | `loadAccounts()` |
| `SaveAccount { account }` | both | `saveAccount()` |
| `SavePendingUpload { record }` | create | `savePendingUpload()` |
| `RemovePendingUpload { credential_id }` | create | `removePendingUpload()` |
| `IndexCreateRecord { credential_id, public_key_hex, name }` | both | `PublicKeyIndex.createRecord()` |
| `IndexQueryRecord { credential_id }` | both | `PublicKeyIndex.queryRecord()` |
| `IndexQueryByWalletRef { address }` | create | `PublicKeyIndex.queryByWalletRef()` |
| `ProbeIndexHealth` | login | `fetch(base + '/api/health')` |
| `Wait { ms }` | both | `setTimeout` |
| `Prompt { kind, confirmable }` | both | `showAlert()` |
| `CompleteOnboarding { mode }` | both | wallet-context dispatch + `router.replace` / `onComplete` |

`rpId`, endpoint URLs, timeouts, retry-on-transport and challenge material are
**shell** concerns and never appear in the core.

---

## Index-upload decision table (owned by `CreateWallet`)

This is the table `src/services/public-key-upload.ts` implements imperatively
today. It is reproduced here because two implementations now exist (D10) and this
is the shared source of truth. One core test per row (FR-032).

| `IndexCreateRecord` | `IndexQueryRecord` | Key matches | Core decision |
| --- | --- | --- | --- |
| ok | ok | yes | Confirmed → proceed to wallet-ref check |
| ok | ok | **no** | **Fail** — "public key mismatch", not retryable by waiting |
| **fail** | ok | yes | Confirmed → proceed (covers "already exists" and "write landed, response lost") |
| fail | ok | no | Fail with the create error |
| ok | **fail/404** | — | Unconfirmed → retry (up to 3), then sync-failed |
| fail | fail/404 | — | Fail with the create error |

Wallet-reference step (after confirmation, never blocking):

| `IndexQueryByWalletRef` | Core decision |
| --- | --- |
| resolved | `RemovePendingUpload`, then save the account |
| not resolved | keep the pending entry, save the account anyway |
| call failed | keep the pending entry, save the account anyway |
