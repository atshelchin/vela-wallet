# Data Model — Presentation State (spec 014)

This feature ships **no business state**. The entities below are presentation-layer
shapes, implemented natively on each platform (Kotlin sealed classes / Swift enums with
associated values / TypeScript discriminated unions / Rust enums). Field names are the
authoritative cross-platform vocabulary; casing follows each platform's convention.

The shapes are deliberately renderable-only: a later wiring feature maps the crux
ViewModels of spec 011 onto them (§6).

---

## 1. Containers

| Entity | Fields | Rule |
| --- | --- | --- |
| `FlowContainer` | `presentation: sheet \| inline_panel`, `title_key`, `show_handle: bool`, `on_close` | `sheet` on iOS, Android, web < 1280 px (handle shown). `inline_panel` on desktop and web ≥ 1280 px (no handle). Title comes from the active state (§4 `scaffold_title`). Close × always present. |

## 2. Flow states

### `CreatePanelState`

```text
Form {
  name: String                 // spec011: name
  name_too_long: bool          // spec011: name_too_long — red inline hint (A3)
  acks: [bool; 3]              // three acknowledgment rows (design consolidates; see §6 note)
  can_submit: bool             // spec011: can_submit — derived: name valid && all acks
  busy: bool                   // spec011: busy — reserved; not exercised in this feature
}
Working {
  step: 1..=5                  // drives the 5-segment bar + "第 N/5 步"
  status: CreateStatusKey      // headline
  show_hint: bool              // A4 sub-caption 请在系统弹窗中确认 (step 1 only in mocks)
  elapsed_secs: Option<u16>    // Some(n) renders the countdown ring (c variants, > 3 s convention)
}
Outcome(OutcomeSpec)
```

`CreateStatusKey` — mirrors spec 011 `StatusKey` working subset:
`setting_up_identity | verifying_identity | extracting_key | computing_address | syncing_key`

### `LoginPanelState`

```text
Waiting {
  elapsed_secs: Option<u16>    // B1 → None, B1c → Some(41)
}
Outcome(OutcomeSpec)
```

The login Waiting bar is a single partially-filled bar (no step segments, no "第 N/5 步").

## 3. `OutcomeSpec` — one shape renders every result/error state

```text
OutcomeSpec {
  scaffold_title: TitleKey       // create | login | sync | shared
  badge: BadgeVariant
  headline_key: MessageKey
  body_key: MessageKey
  address: Option<String>        // Some → copyable address strip (A11 only)
  details: Option<TechDetails>   // Some → 技术详情 disclosure present
  details_expanded: bool         // default false; E2x fixture = true
  actions: ActionList            // exactly 1 primary + 0..=2 secondary, top-to-bottom
}

TechDetails {
  code: String                   // e.g. "E_SERVER" — rendered in error color
  context: String                // e.g. "第 5 步同步公钥；以及登录"
  endpoint: Option<String>       // e.g. "HTTP 503 · p256-index.getvela.app"
}

Action { role: primary | secondary, label_key: MessageKey, id: ActionId }
```

`BadgeVariant` (6 — refined from the mocks):

| Variant | Visual | Used by |
| --- | --- | --- |
| `success` | green circle, ✓ | A11, B5 |
| `warning` | amber-tinted circle, ! | A12, A13, E8 |
| `neutral` | dark circle, ! | E4, E5, B6 |
| `error` | red circle, × | E1, E2, E6, E7, E9, E10, B3, B4 |
| `timeout` | amber clock glyph | E3 |
| `info` | blue-tinted circle, ! | B2 |

## 4. `OutcomeKind` catalog — pure function `kind → OutcomeSpec`

One authoritative catalog per platform maps each kind to its spec (title, badge, keys,
actions). Components never branch on kind; they render the spec.

| Kind | Code | Title | Badge | Actions (primary first) |
| --- | --- | --- | --- | --- |
| `created` | A11 | create | success | enter_wallet |
| `sync_failed` | A12 | sync (跨设备同步) | warning | retry_upload / edit_index_endpoint / report_error |
| `verify_stuck` | A13 | create | warning | finish_verify / start_over_new_passkey / back |
| `network` | E1 | create | error | retry / cancel |
| `server` | E2·E2x | create | error | retry / edit_index_endpoint / report_error |
| `timeout` | E3 | create | timeout | retry / back |
| `cancelled_setup` | E4 | create | neutral | recreate_wallet / back |
| `cancelled_verify` | E5 | create | neutral | retry_verify / back |
| `unsupported` | E6 | create | error | open_biometric_settings / back |
| `incompatible` | E7 | create | error | open_credential_manager_settings / back |
| `not_discoverable` | E8 | create | warning | recreate_wallet / open_credential_manager_settings / back |
| `account_not_found` | E9 | login | error | create_new_wallet / edit_index_endpoint / back |
| `unknown` | E10 | shared (创建钱包 ∕ 登录) | error | retry / report_error / back |
| `recover_offer` | B2 | login | info | recover_now / not_now |
| `recover_failed` | B3 | login | error | retry / back |
| `sign_in_failed` | B4 | login | error | retry / report_error / back |
| `signed_in` | B5 | login | success | enter_wallet |
| `login_cancelled` | B6 | login | neutral | retry_login / back |

Action activations emit `ActionId` callbacks only; in this feature the gallery/host maps
them to fixture switches or dismissal — never to business behaviour (FR-011).

## 5. Gallery fixtures

`StateFixture { code: String, flow: create | login, state: CreatePanelState | LoginPanelState }`
— exactly 35, one per inventory code in spec.md, with the mock's representative data
(A11 address `0x44EEC06897ff7ab8C7f16819511A64bA1…` full 42-char fixture value; E2x detail
lines; ring values 19/8/41 as in mocks). Fixtures live with the gallery, not in
production code paths.

## 6. Mapping notes for the future wiring feature (informative)

| spec 011 ViewModel | This model |
| --- | --- |
| `stage: form` | `CreatePanelState::Form` |
| `stage: working` + `status` | `Working { step, status }` — step index derives from `StatusKey` order |
| `stage: sync_failed` + `sync_error_detail` | `Outcome(sync_failed)` with `TechDetails` from detail |
| `stage: created` + `address` | `Outcome(created)` with `address` |
| `acks: [bool; 4]` | design consolidates to 3 rows — wiring maps 4 flags onto 3 rows (rows 1–2 pass-through, row 3 merges legal acks) or crux is amended to 3; decided at wiring time |
| `submit_label: create \| finish_verify` | `Form` CTA label key; `finish_verify` also surfaces as `verify_stuck.finish_verify` action |
| `FailureKind` (7) | `OutcomeKind` superset (18): `Network→network`, `NotSupported→unsupported`, `NotDiscoverable→not_discoverable`, `Incompatible→incompatible`, `Cancelled→cancelled_setup/cancelled_verify/login_cancelled` (by phase), `Storage/Other→unknown`; `timeout`, `server`, `account_not_found` are new mock-driven refinements |
| `PromptKind::RecoverOffer/RecoverFailed/SignInFailed` | `recover_offer / recover_failed / sign_in_failed` |

Validation rules carried by the model itself: `can_submit == (!name_too_long && name
nonempty && all acks)`; `elapsed_secs` renders only when `Some`; `address` only meaningful
with `created`; `details_expanded` requires `details`; action lists fixed per kind (§4).
