# Research — 026 Web Money Wiring

Continues 024's D1–D8 and 025's D9–D14. Verified against the tree @ f9bcb278
(main after PR #183) and three explorations of the Expo money path, the drawn
web surfaces, and the parallel space (2026-09-04).

**The porting reality**: the six machines are complete in Rust (send 91 ·
fee_policy 69 · approval_guard 75 · sign_request 44 · clear_signing 62+3 ·
tx_tracker 18 tests, plus batch_import 71), their ts-rs types are already
mirrored, and every `*Core` class is already in the shipped wasm. The Expo
tree has ZERO `.web.ts`/`.native.ts` splits left: every executor IS the web
variant. Only `platform.ts` haptics/alerts and `storage.ts` (AsyncStorage) are
RN-reaching; `safe-transaction.ts` (2,838 lines), `bundler-service.ts` (839),
`approval-guard.ts` (488), the simulation family and `clear-executor.ts` are
pure.

## D15 — The kernel wrapper ports once, as the money code's only surface

Expo's `services/vela-core/{index,convert,js-helpers,safe-constants,types}.ts`
(900 lines, pure TS over the wasm kernels: `verifySafeWebAuthn` =
`validateClientData('get', …)`, `derSignatureToRaw`, `computeAddress`,
`abiEncode*`, `hashTypedData`, the Safe/EntryPoint/MultiSend constants) ports
as `$lib/core/kernels.ts` + `$lib/core/safe-constants.ts`. `client.ts` keeps
its existing re-exports (identicon, proofs, prices, keccak); money code
imports kernels only. **Rejected**: re-implementing helpers ad hoc in each
port (the Expo tree already paid for one wrapper).

## D16 — `safe-transaction.ts` ports verbatim; it is the ONLY submit entry

The UserOp builder/signer/submitter (`sendBatchCalls` — one call = single
`executeUserOp`, N = MultiSend, byte-identical to the legacy single sends),
the WebAuthn signature envelope (`buildUserOpSignature` with the 12-byte
validity window, `buildEip1271Signature` without it, `abiEncodeWebAuthnSig`),
fee estimation (`fetchRawGasSignals`, `fetchRawBundlerQuote`,
`simulateUserOpGas`, `estimateInBandBasisGas`), nonce, `submitUserOp`,
`waitForReceipt`. Substitutions: `rpc-adapter` → the 025 pool facade; the
fault hook `gasQuoteShouldZero` → the web fault module. Its Jest vectors
(`safe-transaction` suite) port to vitest as the fund-safety pin. **Never
called on the core path**: `sendNative`/`sendERC20` stay exported, unused.

## D17 — ONE live fee session per surface; `EstimateFee → ports.feeQuote` stays

The send executor does not estimate fees. It asks the shell's `feeQuote`
port, which forwards to the surface's live `fee_policy` session (Expo
`use-fee-quote.ts` → web `flows/core/fee-quote.ts`, a plain module). Four
prior integrations failed by letting the shell re-derive the fee: the
pre-check number, the displayed number and the signed number must be one
object owned by one session. The fee executor stops at the RAW wire
(`fetchRaw*`, `fetchInBandGasQuotes`, `fetchBundlerAccountInfo`) because the
higher helpers apply rules the core owns. The signing sheet's `GasFeeCard`
uses the same session type (Expo `use-signing-fee.ts`).

## D18 — The passkey seam lives in `passkey.ts`, gated at RUNTIME

`$lib/onboarding/core/passkey.ts` already has `sign(challengeHex,
credentialId, transports)` (one credential pinned). Multi-key wallets need
`allowCredentials` for EVERY founding key (Expo `webSign` passes all ids so
the provider picks), so the module gains `signWithAny(challengeHex,
credentials: {id, transports}[])` — one module, no fork. The parallel space
substitutes the signer through an explicit `setPasskeyOverride()` INSIDE the
module (Expo `__setPasskeyOverride`), so register/authenticate/sign are
covered by one seam.

**Deviation from Expo**: Expo gates the override on `__DEV__` (compile time)
and runs e2e against a dev server. The web e2e runs the PRODUCTION artifact
(`build && preview`), which is the stronger test — so the gate is the runtime
dev gate 025 already uses for the console (`import.meta.env.DEV ||
localStorage['vela.dev.console'] === '1'`), and the fixture module is reached
only through a dynamic import behind it. Consequences recorded: the fixture
keys are public by design (Expo ships them too, documented in the takeover
audit); the badge renders unconditionally when active; the runbook's "never
receive funds in the parallel space" stands. **Rejected**: a dev-only
Playwright project against `vite dev` (tests a build nobody ships).

## D19 — Parallel space on web: same keys, Svelte state instead of globalThis

`vela.accounts` is localStorage on web (onboarding storage, same key as
Expo). Enter = back up the real wallet (`vela.parallelSpace.realWalletBackup`,
idempotent on re-entry) → write the fixture accounts (three single-key
Safes `0xD400…130b` / `0x031d…772b` / `0x58cd…1d3d` + the multi-key golden
`0x88cCA0…6894`) → flag `vela.parallelSpace = '1'` → seed the fixture contact;
exit restores and clears. The active flag is a module `$state` mirrored to
localStorage (no Metro double-bundle hack, no 400 ms badge poll). Sponsorship
probes short-circuit to `denied` while active (fixture Safes were never
indexed — founder decision 2026-07-06). Entry: `/{locale}/parallel` route
(prerendered ×15 like every route, EntryGenerator) that enters and redirects
to the wallet, plus `vela.parallel.enter()` on the console. Golden-lock: the
derived addresses join the four existing conformance surfaces as the fifth.

## D20 — The store writer arrives; accounts are read from onboarding storage

`records.ts` (025: read/merge/delete) gains `saveTransaction(s)` /
`updateTransaction(s)` under the same `withTxLock` — ONE atomic write per
batch of siblings (a per-record write races the RMW and drops all but one),
ONE atomic patch for the tracker. `$lib/services/accounts.ts` reads
`vela.accounts` for `findAccountByAddress` / `findAccountByCredentialId` /
`keySetOf` (the session core's view is the display truth; the signer needs the
stored key set).

## D21 — tx_tracker is app-resident; it replaces four pollers

`wallet/core/tracker-{types,executor,session,resident}.ts` port 1:1: a 3 s
tick alive only while something is pending, `visibilitychange` →
`app_resumed`, the wallet page → `home_focused`, `session.start(app_resumed)`
IS the cross-restart recovery. Ports: `feedReconciled` → `feed.liveTick()`,
`receiptLogsConfirmed` → the 025 token_trust resident (confirm-time receipt
logs are the ONLY allowed auto-add source — memory: token auto-add security).
The receipt poll's 3 s shared throttle (`tx-reconciler.ts`) coalesces across
the receipt screen, the tracker and `waitForReceipt`.

## D22 — sign_request is app-resident behind a transport registry; 026's transport is in-page

`sign-resident.ts` ports with `transportFor(transport_id)`. There is NO real
dApp transport on web in 026 (027 = WalletPair / remote-inject). The only
transport is `$lib/dev/test-requester.ts`: an in-page requester implementing
`{ sendResponse }` and exposing `vela.requester.fire(method, params)` under
the dev gate — the web twin of Expo's `e2e/support/relay.js` test dApp, minus
the relay (no cross-tab bridge needed for a hermetic sheet test). The sheet
mounts in the wallet route (mobile `SigningSheet`, desktop `SigningPanel`),
driven by `signing/live.ts`, which composes SignView + ClearSigningView +
GuardView + FeeView into the drawn `SigningModel` blocks — Expo's
`SigningSheet.tsx` and its `views/` are the block-mapping truth. Dismissal IS
rejection (022 contract: no reject button).

## D23 — clear_signing: per-leg sessions + a module coalescing map

`clear-executor.ts` (pure) and `clear-batch.ts` port as is: N `wallet_sendCalls`
legs each get a session; the module-level in-flight map (not a cache) shares
one descriptor fetch / ERC-165 probe / `decimals()` read. Descriptor source is
ethereum-data over `http_get`; Rust owns the ladder, so the 1,321-line TS
twin `clear-signing.ts` and `local-descriptors.ts` are NOT ported (display
types come from the generated `ClearSign*` bindings).

## D24 — approval_guard per request; the submit path ports as a plain module

`guard-executor.ts` + `token-reads.ts` port; the never-unlimited mandate has
three layers on Expo and keeps them on web: the guard's editor (core), the
confirm gate (`SignView.confirm_gate_open && GuardView.confirm_allowed`, the
shell's AND), and the final submit guard — owned by the CORE on this path
(`sign-executor.ts` hands `'core'`; Rust `proceed_submit` runs
`enforce_no_unlimited` and fails the request, never throws). The dApp submit
path `use-dapp-signing.ts::handleDAppRequest` ports as `$lib/services/dapp-
submit.ts` stripped of React; `approval-guard.ts` (detection/cap helpers) and
`dapp-history.ts` (`buildSigningRecord`, `MAX_SIGNED_CONTENT`) port pure.

## D25 — The amount codec is fund-safety-critical and unit-pinned

The core states base units as DECIMAL strings; every `safe-transaction.ts`
consumer reads `value` as HEX. `toShellCall` / `decimalToHex`
(`send-types.ts`) and the same in `fee-executor.ts` port verbatim with
vectors (0, max uint256, leading zeros, decimals with 18/6/0 places).

## D26 — Relay stubs join the hermetic harness; faults get relay arms

`e2e/stub-chain.ts` gains `stubRelay(page, handlers)` for the methods the
client speaks — `eth_estimateUserOperationGas`, `eth_sendUserOperation`,
`eth_getUserOperationReceipt`, `eth_getUserOperationStatus`,
`pimlico_getUserOperationGasPrice`, `vela_getInBandGasQuote`, `eth_gasPrice`,
`eth_maxPriorityFeePerGas` — and REST `/v1/account/{chain}/{safe}`,
`/v1/sponsor`, `/v1/treasury`. The fault console gains what Expo's lacks (its
own TEST-OUTLINE names the gap): `failRelay`, `emptyTreasury`,
`rejectSubmit`, `silentReceipt`, beside the ported `zeroGasQuote` /
`forceFunding`; `__VELA_FAULT_INIT__` applies at module load so the first
read runs under the fault. The wallet↔relay wording coupling
(`parseBundlerUnderfunded` ↔ vela-bundler handlers) is pinned by a unit test
over the relay's actual error strings (FR-206).

## D27 — Batch import: lazy xlsx, browser file seams

`recipient-table.ts` ports with `await import('xlsx')` (SheetJS added to
app-web; asserted absent from the startup chunk). `pick_file` → a hidden
`<input type=file>` resolved from the click; `save_template_file` → a Blob
download from the same gesture; `fetch_usd_fiat_rate` → 025's
`currency-rate`. The BatchImport screen's paste field gains `oninput`.

## D28 — Selection travels through the core, not through nav

Screens emit `onselect(index)`; the ROUTE maps index → core event
(`select_token`, `picked_address`, `choose_fee_token`) and then `nav.push`.
FlowNav stays index-blind (its job is WHICH screen); the next screen's live
builder reads the core's view (`selected_token`, `recipient`, `fee`), so no
index needs to travel. The 021 entry-point table is the contract.

## D29 — The drawn gaps, closed as props (fixtures untouched)

`SendForm` gets `oncontinue` (its CTA had no callback); `AmountInput` renders
an `<input>` when `oninput` is present (the BalanceDisplay toggle pattern);
copy affordances call `navigator.clipboard` when a handler is present;
`ReceiptStage 'failed'` has no fixture and no title key — a corpus check in
Phase 4 decides between existing `send.txError*` copy and the program's first
corpus delta (recorded either way); the receive-flow rule "no camera decode"
stands (scan stays 021's surface until a decode spec).

## D30 — The live sweep spends dust in-band, opt-in, never CI

There is no local bundler anywhere in the program (the "local relay" of the
plan is the test-dApp bridge). The live sweep uses the real relay from a
fixture Safe: in-band fee (`vela_getInBandGasQuote`, the fee paid from the
Safe's own xDAI) or the per-Safe gas deposit when funded — the golden Safe
holds ~0.77 xDAI on Gnosis. Behind a `RUN_ONCHAIN`-style opt-in, recorded in
results.md with hashes; the founder's real-passkey pass remains the one sweep
a script cannot do.
