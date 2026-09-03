# Data Model — 025 Web Read Wiring

Wire types are generated (ts-rs, already mirrored). This file records the
web shell's stored records and builder seams.

## Stored records (IndexedDB `vela`/`kv` unless noted; Expo byte-compat)

| Key | Format | Written for |
| --- | --- | --- |
| `vela.rpc.banned` | `{url, bannedAt, permanent}[]` | rpc_pool `persist_bans` |
| `vela.balances` (per Expo balance-cache key scheme) | account→chain→snapshot | balance_dashboard cache ops |
| `vela.transactionHistory` | `LocalTransaction[]` (Expo shape; empty until 026 writes) | activity_feed store ops + contacts send-history |
| `vela.customTokens` | as Expo | manage_tokens / token_trust |
| `vela.balancePrivacy` (Expo key) | flag | balance_dashboard `write_privacy` |

localStorage stays onboarding-only (024 D3 unchanged).

## Executor ↔ service map (contract detail in contracts/shell-operations.md)

- rpc_pool: `load_pool_config`→endpoints assembly (+admission), `json_rpc_post`→fetch w/ X-Rpc-Url, `probe_chain_id`, `draw_jitter`→Math.random, `start_backoff`→timer, `persist_bans`→KV, `conclude`→settle the caller's promise (call registry).
- balance_dashboard: `fetch_tokens`/`fetch_account_assets`→wallet-api port, cache read/write→balance-cache port, `start_retry_timer`, `write_privacy`.
- activity_feed: `read_tx_store`/`delete_tx_record`→KV, `scan_incoming_transfers`→activity port (pool reads), `resolve_recipient_identity`→identity port, `timer`, `haptic`→no-op ack (web).
- token_trust / manage_tokens: pool reads (blockNumber/getLogs/getBlock/multicall), custom-token KV, `invalidate_token_cache`→wallet-api cache.
- receive_watch: `fetch_tokens` (visibility-gated), abortable `wait`, `signal_deposit`→UI ack (no haptics on web).
- payment_request: validation is in-core; shell supplies parse inputs per Expo validate-pay seam.
- Backfilled arms: contacts `resolve_identity`/`classify_recipient`; currency `resolve_rate`; network_admin `invalidate_pools`/`clear_bundler_cache` + settings-home tile probes.

## Builder seams

- `wallet/live.ts`: `buildWalletFromCore(balanceView, feedView, m, identity, ui) → WalletHomeModel/WalletDesktopModel`; ui = {tab, chainFilter, hidden, sheet…} (route render state). Replaces the identity-only overlay on the live route; fixtures stay canon.
- Receive flow: flows' receive screens get callbacks (024 contacts pattern) + a `ReceiveWatch` session per open surface.

## Store lifetimes

| Machine | Lifetime |
| --- | --- |
| rpc_pool | app-resident (behind the facade) |
| balance_dashboard, activity_feed, token_trust | app-resident residents (Expo precedent) |
| manage_tokens | route/session-scoped (its screens) |
| receive_watch | per-screen factory w/ dispose |
| payment_request | per-parse session (transient) |
