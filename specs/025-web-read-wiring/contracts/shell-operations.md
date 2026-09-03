# Contract — what the web shell answers, per operation (025)

§0 rules unchanged from 024's contract (answer exactly once; failure twins;
switch-only; `never` fallthrough). This contract SUPERSEDES the fail-closed
arms 024 recorded for: network_admin `invalidate_pools`/`clear_bundler_cache`
(now act on the real pool/bundler caches), contacts
`resolve_identity`/`classify_recipient` (live identity/pool), display_currency
`resolve_rate` (live rate quote). Everything else in 024's contract stands.

The Expo executors are the porting truth for every table below
(`rpc-pool-executor.ts`, `balance-executor.ts`, `feed-executor.ts`,
`token-trust-executor.ts`, `manage-tokens-executor.ts`, `executors.ts`
receive/payment arms @ 37694179 base). Web deltas only:

| Machine / op | Web delta |
| --- | --- |
| feed `haptic`, receive `signal_deposit` haptics | acknowledged no-op (no vibrator API commitment on web; the UI celebration renders regardless) |
| receive `fetch_tokens` activity gate | `document.visibilityState === 'visible'` stands in for `isAppActive` |
| every storage op | IndexedDB KV instead of AsyncStorage, same keys/bytes |
| rpc_pool `json_rpc_post` | `fetchWithTimeout` (024 port) + `X-Rpc-Url`; ws endpoints follow the Expo probe transport |

Failure twins port verbatim. No operation is skipped on any path.
