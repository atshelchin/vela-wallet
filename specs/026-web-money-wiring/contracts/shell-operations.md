# Contract — what the web shell answers, per operation (026)

§0 rules unchanged from 024/025 (answer exactly once; failure twins;
switch-only; `never` fallthrough; nothing rejects into the loop). The Expo
executors are the porting truth (`send-executor.ts` 19 arms,
`fee-executor.ts` 6, `guard-executor.ts` 3, `sign-executor.ts` 7,
`clear-executor.ts` 5, `tx-tracker-executor.ts` 6, `batch-import-executor.ts`
@ f9bcb278). Web deltas only:

| Machine / op | Web delta |
| --- | --- |
| send `haptic` | acknowledged no-op (`hapticSuccess/Error` are web no-ops) |
| send `show_alert` | the route's notice sheet, worded from the corpus by kind; acknowledged when shown |
| send `close` | `nav.close()`; acknowledged |
| send `submit_user_op` | passkey = `passkey.signWithAny` (all founding credentials); cancel = `NotAllowedError/AbortError` → `passkey_cancelled` twin; parallel override returns a fixture assertion behind the same call |
| send `cancel_passkey_sign` | aborts the pending WebAuthn ceremony (module-level controller) |
| fee `start_ttl` | rejects on abort, deliberately (the Expo comment) — the only op allowed to |
| sign `send_response` | transport registry; 026's only transport is the in-page test requester |
| sign `attempt_sponsorship` / `check_bundler_funding` | parallel active → `denied` without a round-trip (founder 2026-07-06) |
| sign `switch_active_account` | the 024 session core's account switch |
| clear `http_get` | `fetchWithTimeout` against the configured ethereum-data URL, `NET_TIMEOUTS.descriptor` |
| tracker `notify_confirmed` | → 025 token_trust resident (confirm-time logs only) |
| batch `pick_file` | hidden file input from the click gesture; `file_pick_cancelled` when dismissed |
| batch `save_template_file` | Blob + anchor download; `template_saved` after the click |
| every storage op | IndexedDB KV (`records.ts` writer) / onboarding localStorage for accounts; same keys and bytes |

Failure twins port verbatim: send `SubmitFailed` classification
(`classifySubmit`: passkey cancelled / relay unavailable / underfunded via
`parseBundlerUnderfunded` / generic) is ported with its wording pinned
against the relay's strings (FR-206). No operation is skipped on any path.
