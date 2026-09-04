# Data Model — 026 Web Money Wiring

Wire types are generated (ts-rs, mirrored: `Send*` ~35, `Sign*` ~28,
`Clear*` ~22, `Guard*` ~16, `Fee*` ~14, `Track*` ~10, `Batch*` ~10). This
file records the web shell's stored records, seams and lifetimes.

## Stored records (IndexedDB `vela`/`kv` unless noted; Expo byte-compat)

| Key | Format | Written by |
| --- | --- | --- |
| `vela.transactionHistory` | `LocalTransaction[]` (025 readers unchanged) | send `persist_tx_records` (one atomic write per batch), sign `persist_record`/`update_record`, tracker `update_tx_records` (one atomic patch) |
| `vela.accounts` (localStorage, onboarding) | `Account[]` with `keys[]` | parallel enter/exit swaps it; the signer reads `keySetOf` |
| `vela.parallelSpace` (localStorage) | `'1'` while inside | parallel enter/exit |
| `vela.parallelSpace.realWalletBackup` (localStorage) | `{accounts, idx}` JSON, idempotent | parallel enter |
| `vela.contacts` | + the fixture contact by exact address | parallel enter (seed) / exit (remove) |
| `dev_unlocked` (localStorage) | `'1'` | parallel enter; About-logo unlock later |
| token-metadata / allowance caches | as Expo (`token-metadata.ts`) | guard reads |

## Executor ↔ service map (deltas in contracts/shell-operations.md)

- **send** (`flows/core/send-*`): `fetch_tokens`/`clear_token_cache` → wallet-api; `resolve_token_metadata` → token-metadata; `add_network` → networks (025 custom-network add); `estimate_fee` → **ports.feeQuote** (live fee session); `probe_treasury`, `submit_user_op` (accounts + passkey `signWithAny` + kernels `verifySafeWebAuthn` + `sendBatchCalls`), `cancel_passkey_sign` → passkey abort; `persist_tx_records` → records writer; `track_submitted` → tracker sink; `resolve_identity` → 025 recipient-identity; `resolve_risk` → recipient-risk port; `simulate_calls` → tx-simulation port; `start_timer`; `haptic` → ack; `show_alert` → ports.alert (route notice); `close` → ports.close (nav).
- **fee_policy** (`flows/core/fee-*`): `fetch_gas_price`/`fetch_bundler_quote`/`estimate_user_op_gas` → safe-transaction raw wire; `fetch_in_band_quotes`/`fetch_fee_recipient` → bundler-service; `start_ttl` (rejects on abort, deliberately).
- **approval_guard** (`signing/core/guard-*`): `read_token_metadata` → token-metadata; `read_erc20_allowance`/`read_erc20_balance` → token-reads.
- **clear_signing** (`signing/core/clear-*`): `http_get` → ethereum-data descriptor; `rpc_eth_call` → pool (result + rpc_error split); `selector_db_lookup` → selector-registry; `timer`; `now`.
- **sign_request** (`signing/core/sign-*`, resident): `send_response` → transport registry; `check_bundler_funding`/`attempt_sponsorship` → bundler-service (parallel: denied); `sign_and_submit` → dapp-submit port; `persist_record`/`update_record` → records writer; `switch_active_account` → session.
- **tx_tracker** (`wallet/core/tracker-*`, resident): `poll_receipt`/`poll_status` → tx-reconciler; `load_pending_txs`/`update_tx_records` → records; `notify_confirmed` → token_trust; `now`.
- **batch_import** (`flows/core/batch-*`): `fetch_usd_fiat_rate` → currency-rate; `pick_file` → file input; `save_template_file` → Blob download.

## Builder seams

- `flows/live.ts` (025 overlays stand) gains: `send-pick` ← SendView.tokens/multi; `send-form` ← SendView (recipient draft + identity/risk, amount/fiat, split rows, fee row ← FeeView); `send-confirm` ← SendView.confirm_amount/facts + sim; `send-receipt` ← SendView.receipt/tx_status (+ `failed`); `fee-token` ← FeeView.options; `contact-pick` ← contacts view (024 session); `batch-import` ← BatchView; `tx-detail` ← FeedView item.
- `signing/live.ts` (new): `buildSigningModel(sign, clear, guard, fee, m, identicon) → SigningModel` — blocks from the clear-signing surface/fields/risk (13 block kinds), `allowance` block from GuardView editor, `fee` from FeeView, `confirm.enabled` = `confirm_gate_open && confirm_allowed && fee ready`.
- Route translation table: screen callbacks → core events (D28); ports → route state (alert notice, close → nav).

## Store lifetimes

| Machine | Lifetime |
| --- | --- |
| send | per flow entry (created on `nav.enter('send')`, disposed on close) |
| fee_policy | per surface (one for the send flow; one per signing sheet) |
| approval_guard | per request (+ per batch leg) |
| clear_signing | per sheet / per leg, coalesced fetches |
| sign_request | app-resident (transport registry) |
| tx_tracker | app-resident (tick while pending; resumed on visibility) |
| batch_import | per sheet |
| parallel space | app-resident state + localStorage flag |
