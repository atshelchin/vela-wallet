# Data Model — 019 Live Onboarding

**Date**: 2026-08-24 · **Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

This feature adds **one** type to the core and one field to three existing ones.
Everything else here is a mapping: how the core's existing view models drive the v2
screens. Where a section says *unchanged*, it is documenting a contract this feature must
not break, not proposing anything.

---

## 1. New: `KeyMethod`

How the person chose to mint a founding key. Lives in `rust/crates/vela-core/src/app/mod.rs`
beside `FailureKind` and `PromptKind`.

| Variant | Design label | Design caption | This feature |
| --- | --- | --- | --- |
| `Platform` | 这台电脑 / 这台设备 | Touch ID 或 Windows Hello | usable on web, iOS, Android, and Windows desktop (Hello via webauthn.dll, gated on it being enrolled); greyed on macOS/Linux desktop, which reach no platform authenticator from gpui |
| `Hybrid` | 手机或平板 | 扫码，用附近设备创建 | live on web (the browser owns the QR) and on all three desktops (the app-owned caBLE client, T174) |
| `SecurityKey` | USB 安全密钥 | 插入后轻触 | usable on web and desktop |

Serialised `snake_case` (`platform` / `hybrid` / `security_key`), consistent with every
other wire enum in `shell.rs`.

`Hybrid` exists from day one deliberately: 020 then adds a transport, not a core type, and
the client can render the method as present-and-explained rather than absent — which is
what the design draws.

### Where it appears

```
Event::AddKey { name, method }                        // was { name }
ShellOperation::RegisterPasskey { name,
                                  exclude_credential_ids,
                                  method }            // new field
CreateKeyRow { …, method }                            // new field
```

`Model.registering_label` gains a companion `registering_method` so the method survives
the round trip through the shell and lands on the resulting draft.

**The first key.** `Event::Submit` also registers a key — the wallet's first — and has no
method today. It takes the platform default per client (`Platform` where a system passkey
service exists, `SecurityKey` on desktop). This is the one place the client, not the
person, picks; the key screen then lets them add whatever they like.

### Why not derive it from what the authenticator reported

`CreateKeyRow` already carries `authenticator_attachment`, `transports` and `aaguid` —
but those are what the **authenticator said about itself**, and they can legitimately
disagree with what the person **chose** (a "this device" choice that resolves to a
cross-platform authenticator). Both are kept: the ceremony follows the choice, the row's
provider line shows the report. Neither is inferred from the other.

---

## 2. Changed: `ACK_COUNT` 4 → 2

`create_wallet.rs`. `Model.acks` becomes `[bool; 2]`; `CreateView.acks` is a 2-element
vector; `can_submit` still requires all of them.

| Index | Content | Rendering |
| --- | --- | --- |
| 0 | Private keys are held by this device's credential manager; Vela cannot recover them. | checkbox |
| 1 | Agreement to the privacy policy and the terms of service, both linked inline. | checkbox + two links |

The v2 name screen's other two lines render as **static assurances with a filled accent
tick** — copy, not gates. Corpus: `onboarding.create.ack0` and `ack1` are rewritten;
`ack2` and `ack3` are removed in all 15 locales.

---

## 3. `CreateView` → the v2 create journey

`CreateView` is *unchanged apart from* §1 and §2. The mapping below is the whole of the
create UI's logic; a client that implements this table has no create logic of its own.

### Screen selection

| Screen | Condition |
| --- | --- |
| Name | `stage == form` |
| Keys | `stage == add_keys` and not `busy` |
| Progress | `busy` and `status` is a progress status |
| Retry | `stage == sync_failed` |
| Done | `stage == created` |

The top back affordance renders when `can_go_back`; the segmented progress bar fills to
33 % on Name, 66 % on Keys, 100 % on Progress and Done.

### Name screen

| Design element | Source |
| --- | --- |
| account-name field value | `name`, editable while `name_editable` |
| inline over-length hint | `name_too_long` |
| the two checkboxes | `acks[0]`, `acks[1]` → `Event::AckToggled { index }` |
| 继续 enabled | `can_submit` → `Event::Submit` |
| CTA label | `submit_label`: `create` → 继续 · `finish_verify` → 完成验证 |
| 重新开始 link | `show_start_over` → `Event::StartOver` |
| transient status line | `status` ∈ { `setup_cancelled`, `verify_cancelled` } |

### Keys screen

| Design element | Source |
| --- | --- |
| title | `needs_second_key` ? 再加一把才能创建 : 添加通行密钥 |
| subtitle | `needs_second_key` ? "两把密钥，丢一把另一把照样登录。" : `can_add_key` ? "任意一把都能单独登录，最多 7 把。" : "已达上限 7 把。" |
| accent-soft warning strip | rendered iff `needs_second_key` |
| counter | `keys.len()` / 7 |
| one row per key | `keys[i]` — icon and provider line from `method` + `transports`/`aaguid`, name from `name`, badge from `synced` (已同步 / 仅本机) |
| per-row retry | rendered iff `!keys[i].confirmed` → `Event::ConfirmKey { index }` |
| row delete | index > 0 only → `Event::RemoveKey { index }` |
| + 添加通行密钥 | enabled iff `can_add_key`; opens the three methods → `Event::AddKey { name, method }` |
| primary CTA | `can_finish` → `Event::FinishKeys`; label flips 创建钱包 ⇄ 先添加第 2 把密钥 on `needs_second_key` |
| footnote | "钱包地址由这组密钥决定，创建后不能再增减。" — static |

Row 0 is the pinned key: not removable, not renamable, and its name *is* the wallet name.

### Progress screen

Three task rows and a percentage, derived from `status` (research D9):

| Row | `status` | % |
| --- | --- | --- |
| 校验通行密钥公钥 | `verifying_identity`, `extracting_key` | 33 |
| 推导账户地址 | `computing_address` | 62 |
| 写入密钥索引 | `syncing_key` | 100 |

Rows before the active one show `✓`, after it `○`. No timer is involved; the client never
advances a row the core has not reported. `setting_up_identity` occurs before the key list
exists and renders as the Name screen's status line, not here.

### Retry screen (`sync_failed`)

Headline and body from the corpus, technical details from `sync_error_detail`, primary
`Event::RetryUpload`, secondary `Event::StartOver`. The full key list is preserved and
shown — nothing is re-minted.

### Done screen

| Design element | Source |
| --- | --- |
| identicon | derived from `address` |
| wallet name | `keys[0].name` |
| address, mono | `address` — `Some` only in this stage, by construction |
| key list | `keys[]`, name + badge |
| 进入钱包 | `Event::EnterWallet` |

---

## 4. `LoginView` → the sign-in journey

`LoginView` is two booleans and stays that way.

| Field | Drives |
| --- | --- |
| `busy` | the Welcome screen's 我已有钱包 spinner; the button is disabled while true |
| `endpoint_unreachable` | the endpoint-settings surface opens automatically, with a warning; sign-in is **still permitted** |

Everything else the person sees during sign-in is a `Prompt` (§5) or the wallet home.
There is deliberately no "sign-in progress" screen: the common path is one system passkey
sheet followed by the wallet.

---

## 5. Prompts and the outcome catalog

`PromptKind` is unchanged. Every variant renders in the v2 error sheet — bottom-anchored
with a drag handle on mobile, a centred 400 px card on desktop.

| `PromptKind` | Confirmable | Primary | Secondary |
| --- | --- | --- | --- |
| `NotSupportedCreate` / `NotSupportedLogin` | no | dismiss | — |
| `NotDiscoverable` | no | 换一台设备登录 | 创建新钱包 |
| `IncompatibleCreate` / `IncompatibleLogin` | no | dismiss | — |
| `CreateFailed { detail }` | no | 重试 | 返回 · detail in technical details |
| `RecoverOffer` | **yes** | 继续恢复 | 取消 — the answer is a business decision |
| `RecoverFailed` | no | dismiss | — |
| `SignInFailed { detail }` | no | 重试 | 返回 · detail in technical details |

Cancellation is not a prompt. A dismissed passkey sheet becomes a `StatusKey`
(`setup_cancelled` / `verify_cancelled`) rendered as a quiet status line, with drafts
intact — the design's "验证已取消" sheet is reserved for the sign-in path, where there is no
form to return to.

Spec 014's eighteen `OutcomeKind` values remain the client-side catalog behind these
(network / timeout / server / storage / unknown refinements of `CreateFailed` and
`SignInFailed`); they are re-skinned, not reduced (research D13).

---

## 6. Persisted entities — *unchanged, and load-bearing*

```
Account   { id, name, address, public_key_hex, created_at_iso, keys: [AccountKey] }
AccountKey{ credential_id, public_key_hex, name }
PendingUpload { credential_id, …, members: [PendingUploadMember] }
```

Storage keys, byte-for-byte with the shipping web client:

| Key | Holds |
| --- | --- |
| `vela.accounts` | every `Account` |
| `vela.activeAccountIndex` | which one is active |
| `vela.pendingUploads` | interrupted publishes, written **before** the first attempt |
| `vela.serviceEndpoints` | index endpoint overrides |

**The invariant every client must carry.** `Account` has both the legacy scalar key fields
and the `keys` array. Only `key_hexes()` and `matches_credential()` may read that duality.
A mapper that copies `Account` field by field and drops `keys` does not merely lose data —
the core derives the address from **all** keys, so a multi-key account stripped to its
scalar key is silently "repaired" into a different, wrong, single-key Safe on every
restore. Every mapper on every client carries `keys`. An empty `keys` means a genuine
legacy single-key record and must stay empty.

---

## 7. Session

`session.rs`, app-resident (one per process, outliving every screen).

| In | Out |
| --- | --- |
| `Event::AccountEstablished { mode: CompletionMode }` | account(s) persisted, active index set |
| `Event::Boot` | accounts + active index loaded, pending uploads checked |
| `Event::SwitchAccount { index }` | active index changed |
| `Event::SignOut` → `SignOutConfirmed` | stored wallet cleared |

`CompletionMode` has two shapes because sign-in resolves two ways:
`SetWallet { accounts, active_index }` when a locally known credential restores the whole
list, `AddAccount { account }` for everything else.

`SessionView::allowed_route` is the route guard: the core decides **what** is allowed, the
client decides **when** to navigate.

---

## 8. Validation rules — all core-owned, restated so clients can be checked against them

| Rule | Enforced by |
| --- | --- |
| account name ≤ 27 bytes (`64 − 37`) as a WebAuthn user handle | `name_fits_user_handle` → `name_too_long` |
| both acknowledgements checked before creation | `can_submit` |
| at most 7 founding keys | `MAX_MULTI_KEYS` → `can_add_key` |
| no duplicate public key in the founding set | refused at registration, not at finish |
| a lone founding key must be backed up | `needs_second_key` → `can_finish` |
| every key must have proved group membership | `can_finish` |
| row 0 is neither removable nor renamable | `remove_key` / `key_name_changed` refuse index 0 |
| address derives from the **whole** set, canonically ordered | `compute_safe_address_multi` |
| the account is saved only after the publish lands | `Stage::Syncing` → `Saving` |
| a rebuilt address must match the group's record | sign-in refuses on mismatch |
| two recovery signatures must pin exactly one key | `recover_public_key_from_assertions` returns `None` otherwise |
| a result from an abandoned attempt is discarded | `attempt` counter |
