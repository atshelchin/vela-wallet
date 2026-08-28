# Contract — What every client must do for every operation

**Feature**: 019 · **Supersedes**: `specs/011-crux-onboarding-state/contracts/onboarding-core.md`

That earlier contract has drifted out of date — it still names `index_create_record` /
`index_query_record` / `wallet_ref` and a four-variant `CreateStage` of
`form|working|sync_failed|created`. The shipped Rust has `registry_publish` /
`registry_query_by_public_key` / `registry_query_unit` / `generate_group_key` /
`sign_member_proof` / `lookup_legacy_name`, and `CreateStage = Form | AddKeys |
SyncFailed | Created`. **The Rust is authoritative**; this file is generated from it by
reading, and 011's contract should be marked superseded when this feature lands.

---

## 0. The three rules that apply to every row below

1. **Nothing rejects.** Every failure becomes the result variant the operation owes.
   A thrown exception reaching the effect loop is a bug, not a code path. The reference
   is `src/services/onboarding-core/executor.ts` — read its header before writing a new
   one: *"if this file ever grows an `if` that decides what happens next, that decision
   belongs in the Rust machine instead."*
2. **The shell owns the outside world.** Relying-party id, endpoint URLs, timeouts,
   challenge material, randomness and the clock live here and appear nowhere in
   `shell.rs`. That is why no core test can depend on a domain, a network condition, or
   the time of day.
3. **One in-flight operation is cancellable.** Each effect gets its own cancellation
   handle; a cancelled operation's late answer is expected, not a fault, and the bridge
   discards it (unknown effect id ⇒ *the answer outlived the question*).

---

## 1. Onboarding operations (`ShellOperation` → `ShellResult`)

Eighteen operations. Every client implements all eighteen; none may be a stub that
silently succeeds.

### Passkey ceremonies

| Operation | Must do | Succeeds with | Fails with |
| --- | --- | --- | --- |
| `check_passkey_support` | ask the platform whether any passkey authenticator is usable | `passkey_support { supported }` | never — report `supported: false` |
| `register_passkey { name, exclude_credential_ids, method }` | run a registration for `method`; ES256 **only** (`alg: -7`); resident key **required**; user verification required; direct attestation; exclude the listed credentials | `passkey_registered { registration, now_iso }` | `passkey_failed { kind, message }` |
| `sign_proof { credential_id, purpose }` | assert against exactly that credential, over the challenge label the purpose selects | `proof_signed { assertion, now_iso }` | `passkey_failed { … }` |
| `sign_member_proof { credential_id, public_key_hex, attestation_hex, group_public_key_hex }` | fetch the member-mode challenge, assert, assemble the proof | `member_proof_signed { proof }` | `passkey_failed` or `index_failed`, by what actually threw |
| `authenticate_passkey` | assert with **no** credential hint — "who are you?" | `passkey_authenticated { assertion, now_iso }` | `passkey_failed { … }` |

`now_iso` is the wall clock the client observed while doing the work. It travels with the
observation so the core stays a pure function of its inputs — no clock effect, no clock in
tests.

**Failure classification is the client's only judgement call**, and it is narrow:
map the platform's cancellation error to `cancelled`, its "no authenticator" error to
`not_supported`, a non-discoverable credential to `not_discoverable`, everything else to
`other` **with the platform's own words in `message`**. Do not prettify that string — it
goes into the bug report.

**RS256 is forbidden.** An RSA credential can never satisfy the RIP-7212 precompile, so
`pubKeyCredParams` offers ES256 alone. A client that widens it produces a wallet that
cannot sign.

### Per-client ceremony implementation

| Client | Registration | Assertion |
| --- | --- | --- |
| `app-web` | `navigator.credentials.create()`; `residentKey: 'required'` **and** `requireResidentKey: true`; `extensions: { credProps: true }`, and `credProps.rk === false` ⇒ `not_discoverable` **before anything is stored** | `navigator.credentials.get()` |
| `app-ios` | `ASAuthorizationPlatformPublicKeyCredentialProvider`, `excludedCredentials` (requires iOS 17.4 — research D6) | same provider, no credential hint for `authenticate_passkey` |
| `app-android` | `androidx.credentials.CreatePublicKeyCredentialRequest(requestJson)` — the same WebAuthn JSON the web path builds | `GetCredentialRequest` + `GetPublicKeyCredentialOption(requestJson)` |
| `app-desktop` | CTAP2 `authenticatorMakeCredential` over USB HID, framing and CBOR from `vela-core::ctap` | CTAP2 `authenticatorGetAssertion` |

`method` selects the ceremony: `Platform` ⇒ the platform authenticator, `SecurityKey` ⇒ a
cross-platform/USB authenticator, `Hybrid` ⇒ **only** `app-web` (the browser owns the QR);
elsewhere the client never issues it because the key screen offers it as unavailable.

On desktop, "no security key present" is not a generic failure: report
`passkey_failed { kind: not_supported, message }` with a message naming the missing key,
so the sheet can say so.

### Group key

| Operation | Must do | Succeeds with |
| --- | --- | --- |
| `generate_group_key` | mint a 32-byte random seed with the platform CSPRNG and derive its P-256 public key | `group_key_generated { seed_hex, group_public_key_hex }` |

All randomness lives in the client. The seed never enters the core's serialized state
beyond being echoed into the final publish.

### Storage

| Operation | Succeeds with | Fails with |
| --- | --- | --- |
| `load_accounts` | `accounts_loaded { accounts }` | `storage_failed { message }` |
| `save_account { account }` | `account_saved` | `storage_failed { message }` |
| `save_pending_upload { record }` | `pending_upload_saved` | `storage_failed { message }` |
| `remove_pending_upload { credential_id }` | `pending_upload_removed` | `storage_failed { message }` |

Keys and record shapes are byte-compatible with the shipping web client — see
[data-model.md §6](../data-model.md). **`keys` is carried on every read and every write**;
dropping it silently repairs a multi-key account into a different, wrong, single-key Safe.

### Registry and index

| Operation | Must do | Succeeds with | Fails with |
| --- | --- | --- | --- |
| `registry_publish { metadata_hex, members, group_seed_hex, group_public_key_hex }` | with `group_seed_hex` set: close the group with the software group proof and register — **no prompts**, the members already carry creation-time proofs. Empty: run the legacy mechanism (fresh group key, challenges, one assertion per member). Poll the task to completion. Idempotent by content hash. | `registry_published` | `index_failed { message, network }` |
| `registry_query_by_public_key { public_key_hex }` | ask whether this key is registered and which groups it founds | `registry_key_status { registered, unit_ids }` | `index_failed { … }` |
| `registry_query_unit { unit_id }` | fetch one group: metadata blob + founding members in ascending on-chain order (which **is** founding order) | `registry_unit { metadata_hex, members }` | `index_failed { … }` |
| `lookup_legacy_name { credential_id }` | read-only, best effort, against the frozen v1 contract | `legacy_name { name }` | `legacy_name { name: None }` — never an error |
| `probe_index_health` | one health request | `index_health { ok }` | `index_health { ok: false }` |

`network: true` means the request never reached the server — a transport failure or an
abort, as distinct from a 4xx. **Only the client can tell those apart**, which is why this
single bit of classification is delegated. Everything else about an index failure is the
core's to interpret.

Health probing runs on its own channel: three probes, two seconds apart, and a sign-in
attempt must never cancel it (nor it a sign-in).

### Control

| Operation | Must do | Succeeds with |
| --- | --- | --- |
| `wait { ms }` | sleep, cancellably | `waited` |
| `prompt { kind, confirmable }` | show the sheet; `confirmable` selects two buttons whose answer is a business decision | `prompt_answered { accepted }` — a dismissal is `accepted: false` |
| `complete_onboarding { mode }` | hand the wallet to the session machine (§2) and leave onboarding | `onboarding_completed` |

`wait` is the core's only clock. It is `u32` because the wire is JSON.

---

## 2. Session operations (`SessionOperation` → `SessionShellResult`)

The session machine is **app-resident** — one per process, outliving every screen — and
has its own vocabulary.

| Operation | Must do | Result | On failure |
| --- | --- | --- | --- |
| `load_accounts` | read every stored account | `accounts_loaded { accounts }` | `accounts_unavailable` |
| `load_active_index` | read the active index; missing/garbage ⇒ 0; a negative value must fail closed rather than arrive | `active_index_loaded { index }` | — (no failure variant) |
| `save_account { account }` | best-effort migration write-back | `account_saved` | swallow; the in-memory correction stands |
| `save_active_index { index }` | best effort | `active_index_saved` | swallow |
| `check_pending_uploads` | are there public keys the index never confirmed? | `pending_uploads { has_pending }` | `pending_uploads_unavailable` |
| `clear_signed_in_wallet` | drop the account list and the active index — **and nothing else** | ack | best effort |
| `clear_extension_cache` | drop the browser-extension account snapshot; a no-op where no extension exists | ack | best effort |

**Sign-out scope is a decision, not an implementation detail.** Contacts, history, custom
tokens and networks, endpoints, price source, locale, dApp permissions belong to the
*account*, not the session, and the account returns intact because its address derives
from the passkey rather than from disk. The pending-upload outbox is excluded for a second
reason: a record there is a public key the index has not confirmed, the next launch can
retry it with no account list — but a deleted record can never be retried, and that
credential becomes unfindable at sign-in.

`SessionView::allowed_route` is the route guard. The core decides **what** is allowed; the
client decides **when** to navigate.

---

## 3. The bridge each client drives the core through

Three methods, identical semantics everywhere. `rust/crates/vela-core-wasm/src/bridge.rs`
is the reference implementation.

```
dispatch(event_json)                 -> DispatchResult json
resolve_effect(effect_id, result_json) -> DispatchResult json
view()                               -> ViewModel json

DispatchResult = { view, effects: [{ id, operation }], cancelled_effect_ids: [ … ] }
```

- Effect ids are monotonic per core instance.
- An id the bridge does not know is **not an error**: return the current view unchanged.
- `cancelled_effect_ids` tells the client to abort those in-flight operations.

| Client | Bridge |
| --- | --- |
| `app-web` | the existing wasm classes `CreateWalletCore` / `LoginCore` / `SessionCore`, loaded in the browser on demand |
| `app-ios`, `app-android` | a new uniffi object with the same three methods, `Mutex`-guarded (research D2) |
| `app-desktop` | no bridge — `Core<CreateWallet>` directly, via a generic `CoreHost<A>` |

The driving loop itself (`src/services/crux/effect-loop.ts`) is product-agnostic and its
contract is one sentence: **`execute` must not reject for an expected failure; the failure
converter turns it into the result variant instead.**
