# Contract: wallet-state cores (wave 1)

**Feature**: [016-crux-wallet-state](../spec.md) · Authoritative field-level
shapes live in the generated TS under
`src/services/wallet-state-core/generated/` (drift-gated); this file fixes the
*surface* and its semantics.

## 1. Bridge surface (identical for all three cores)

Each core is a wasm class with the 011 shape:

```ts
new XCore()
dispatch(event_json: string): string        // → DispatchResult JSON
resolve_effect(id: bigint, result_json: string): string
view(): string
free(): void
```

`DispatchResult = { view, effects: [{ id, operation }], cancelled_effect_ids }`.
Monotonic effect ids per core instance; resolving an unknown id returns the
current view and changes nothing; a resolve for an aborted command likewise.
Consumed through the existing product-agnostic
`src/services/crux/json-wasm-shell.ts` — unchanged.

Exported classes: `DisplayCurrencyCore`, `ReceiveWatchCore`,
`PaymentRequestCore` (plus the unchanged `CreateWalletCore` / `LoginCore`).

## 2. Events in (tag = `type`, snake_case)

- **DisplayCurrencyCore**: `refresh` · `user_chose {code}`
- **ReceiveWatchCore**: `start`
- **PaymentRequestCore**: `start {account, recipient, base_url}` ·
  `mode_changed {mode}` · `asset_picked {chain_id, token_address?, symbol,
  decimals, network_name}` · `amount_changed {text}` · `acknowledge` ·
  `link_opened {to?, chain?, token?, amount?, sym?, dec?, net?}`

`shell_completed` is internal to every core — a shell never sends it; results
enter through `resolve_effect`.

## 3. Operations out / results back

| Core | Operation | Result variants |
| --- | --- | --- |
| DisplayCurrency | `read_stored_code` | `stored_code {code?}` |
| | `write_stored_code {code}` | `code_written` |
| | `read_device_currency` | `device_currency {code?}` |
| | `resolve_rate {code}` | `rate_resolved {code, rate?}` |
| ReceiveWatch | `fetch_tokens` | `tokens_fetched {tokens, now_ms}` · `fetch_failed {now_ms}` · `inactive` |
| | `wait {ms}` | `waited {now_ms}` |
| | `signal_deposit` | `signalled` |
| PaymentRequest | `read_ack {account}` | `ack_flag {acknowledged}` |
| | `write_ack {account}` | `ack_written` |

Failure is always a result variant; executors never reject for expected
failures (the shared effect-loop contract).

## 4. View models

Field-level truth: `CurrencyView`, `ReceiveWatchView`, `PaymentRequestView` in
the generated directory. Semantics pinned here:

- `CurrencyView.committed == false` ⇔ render USD/1 placeholder.
- `ReceiveWatchView.deposits[].items[].amount`/`usd` are raw numbers; the
  shell formats (`formatBalance`, `$x.xx`, locale time from `at_epoch_ms`).
- `PaymentRequestView.copy_payload` is the pay-link in request mode, the bare
  address in address mode; `qr_value` falls back to the bare recipient until a
  request is built; `can_copy`/`can_save` are false until the gate is
  acknowledged; `pay_valid == false` ⇒ the invalid-request surface.

## 5. Numbers on the wire

JSON numbers (f64) everywhere except base-unit token amounts, which are
decimal strings (`amount_base`). Epoch times are f64 milliseconds. No u64.

## 6. Compatibility guarantees

- Onboarding wire (classes, generated dir, e2e) is byte-identical to 011.
- Storage keys and their value formats are unchanged
  (`vela.displayCurrency` = code string; `vela.receiveWarned.{address}` = `'1'`).
- EIP-681 / pay-link output strings are byte-identical to the TS builder for
  every input the TS builder handled; `/pay` inputs the TS page crashed or
  hex-misparsed on now produce `pay_valid = false` (research.md D8).
